import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = mkdtempSync(join(tmpdir(), 'tandem-profiles-'));
after(() => rmSync(root, { recursive: true, force: true }));
const cli = resolve(process.env.TANDEM_TEST_PACKAGE || '.', 'dist/cli.js');
const state = join(root, 'state');
function auth(
  account = 'account-A',
  user = 'user-A',
  secret = 'SYNTHETIC-SECRET',
) {
  const claim = {
    'https://api.openai.com/auth': {
      chatgpt_account_id: account,
      chatgpt_user_id: user,
    },
  };
  return JSON.stringify({
    tokens: {
      account_id: account,
      id_token: `e30.${Buffer.from(JSON.stringify(claim)).toString('base64url')}.synthetic`,
      access_token: secret,
      refresh_token: secret,
    },
    last_refresh: '2026-10-01T00:00:00Z',
  });
}
const source = join(root, 'auth.json');
writeFileSync(source, auth());
const run = (args) =>
  spawnSync(
    process.execPath,
    [cli, 'profiles', ...args, '--state-home', state, '--json'],
    { encoding: 'utf8', timeout: 30000 },
  );
function ok(args) {
  const r = run(args);
  assert.equal(
    r.status,
    0,
    JSON.stringify({
      status: r.status,
      signal: r.signal,
      errorCode: r.error?.code ?? null,
    }) +
      '\n' +
      r.stderr,
  );
  assert.doesNotMatch(r.stdout + r.stderr, /SYNTHETIC-SECRET/);
  return JSON.parse(r.stdout);
}
test('import, rename and confirmed deletion preserve historical profile and binding IDs', () => {
  const added = ok(['add', '--label', 'Alpha', '--import', source]);
  assert.match(added.profile.id, /^profile_/);
  const renamed = ok([
    'rename',
    '--identity',
    added.profile.id,
    '--label',
    'Renamed',
  ]);
  assert.equal(renamed.profile.bindingId, added.profile.bindingId);
  assert.equal(run(['remove', '--identity', added.profile.id]).status, 2);
  assert.equal(
    ok(['show', '--identity', added.profile.id]).profile.status,
    'available',
  );
  const removed = ok([
    'remove',
    '--identity',
    added.profile.id,
    '--confirm',
    added.profile.id,
  ]);
  assert.equal(removed.profile.status, 'deleted');
  const historical = ok(['show', '--identity', added.profile.id]);
  assert.equal(historical.profile.bindingId, added.profile.bindingId);
  assert.equal(historical.bindings[0].id, added.profile.bindingId);
  assert.throws(() =>
    readFileSync(join(state, 'credentials', `${added.profile.bindingId}.json`)),
  );
});

test('same-account reauthentication preserves binding and a different workspace requires explicit replacement', () => {
  const added = ok(['add', '--label', 'Refresh', '--import', source]);
  writeFileSync(source, auth('account-A', 'user-A', 'SYNTHETIC-REFRESH'));
  const renewed = ok([
    'login',
    '--identity',
    added.profile.id,
    '--import',
    source,
  ]);
  assert.equal(renewed.profile.bindingId, added.profile.bindingId);
  assert.match(
    readFileSync(
      join(state, 'credentials', `${added.profile.bindingId}.json`),
      'utf8',
    ),
    /SYNTHETIC-REFRESH/,
  );
  writeFileSync(source, auth('workspace-B'));
  const refused = run([
    'login',
    '--identity',
    added.profile.id,
    '--import',
    source,
  ]);
  assert.equal(
    JSON.parse(refused.stderr).code,
    'NEW_BINDING_CONFIRMATION_REQUIRED',
  );
  assert.equal(
    ok(['show', '--identity', added.profile.id]).profile.bindingId,
    added.profile.bindingId,
  );
  const replaced = ok([
    'login',
    '--identity',
    added.profile.id,
    '--import',
    source,
    '--new-binding',
    added.profile.id,
  ]);
  assert.notEqual(replaced.profile.bindingId, added.profile.bindingId);
  assert.deepEqual(
    replaced.bindings.map((b) => b.retired),
    [true, false],
  );
  assert.throws(() =>
    readFileSync(join(state, 'credentials', `${added.profile.bindingId}.json`)),
  );
  writeFileSync(source, auth());
});
test('corrupt stored metadata cannot echo injected secrets and duplicate labels never select a different profile', () => {
  const added = ok(['add', '--label', 'Distinct', '--import', source]);
  assert.equal(
    JSON.parse(run(['add', '--label', 'Distinct', '--import', source]).stderr)
      .code,
    'LABEL_DUPLICATE',
  );
  const path = join(state, 'profiles.json');
  const original = readFileSync(path, 'utf8');
  const corrupt = JSON.parse(original);
  corrupt.profiles.find((p) => p.id === added.profile.id).unexpected =
    'SYNTHETIC-SECRET';
  writeFileSync(path, JSON.stringify(corrupt));
  const rejected = run(['show', '--identity', added.profile.id]);
  assert.equal(rejected.status, 2);
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /SYNTHETIC-SECRET/);
  writeFileSync(path, original);
});
test('invalid credentials and effective broad permissions preserve saved credentials and block access', () => {
  const added = ok(['add', '--label', 'Protected', '--import', source]);
  const saved = join(state, 'credentials', `${added.profile.bindingId}.json`);
  const original = readFileSync(saved, 'utf8');
  const invalid = join(root, 'invalid-auth.json');
  writeFileSync(invalid, '{"tokens":{"refresh_token":"SYNTHETIC-SECRET"}}');
  const failed = run([
    'login',
    '--identity',
    added.profile.id,
    '--import',
    invalid,
  ]);
  assert.equal(JSON.parse(failed.stderr).code, 'IDENTITY_FORMAT_UNSUPPORTED');
  assert.doesNotMatch(failed.stdout + failed.stderr, /SYNTHETIC-SECRET/);
  assert.equal(readFileSync(saved, 'utf8'), original);
  if (process.platform === 'win32') {
    const granted = spawnSync(
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe'),
      [state, '/grant', '*S-1-1-0:(R)'],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(granted.status, 0);
    try {
      assert.equal(
        JSON.parse(run(['show', '--identity', added.profile.id]).stderr).code,
        'PRIVATE_ACL_REQUIRED',
      );
    } finally {
      assert.equal(
        spawnSync(
          join(
            process.env.SystemRoot ?? 'C:\\Windows',
            'System32',
            'icacls.exe',
          ),
          [state, '/remove:g', '*S-1-1-0'],
          {
            encoding: 'utf8',
          },
        ).status,
        0,
      );
    }
  } else {
    chmodSync(state, 0o755);
    try {
      assert.equal(
        JSON.parse(run(['show', '--identity', added.profile.id]).stderr).code,
        'PRIVATE_PERMISSIONS_REQUIRED',
      );
    } finally {
      chmodSync(state, 0o700);
    }
  }
});

test('conflicting ID-token user aliases cannot replace saved credentials or binding', () => {
  const original = auth();
  const input = join(root, 'conflicting-aliases.json');
  writeFileSync(input, original);
  const added = ok(['add', '--label', 'Alias consistency', '--import', input]);
  const saved = join(state, 'credentials', `${added.profile.bindingId}.json`);
  const previous = ok(['show', '--identity', added.profile.id]);
  const conflicting = JSON.parse(
    auth('account-A', 'user-A', 'SYNTHETIC-CONFLICT'),
  );
  const claims = {
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'account-A',
      chatgpt_user_id: 'user-A',
      user_id: 'user-B',
    },
  };
  conflicting.tokens.id_token = `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
  writeFileSync(input, JSON.stringify(conflicting));
  const refused = run([
    'login',
    '--identity',
    added.profile.id,
    '--import',
    input,
  ]);
  assert.equal(refused.status, 2);
  assert.equal(JSON.parse(refused.stderr).code, 'IDENTITY_FORMAT_UNSUPPORTED');
  assert.doesNotMatch(
    refused.stdout + refused.stderr,
    /SYNTHETIC-CONFLICT|user-B/,
  );
  assert.equal(readFileSync(saved, 'utf8'), original);
  assert.deepEqual(ok(['show', '--identity', added.profile.id]), previous);
});

for (const [hint, conflict] of [
  ['chatgpt_account_id', 'account-B'],
  ['chatgpt_user_id', 'user-B'],
  ['user_id', 'user-B'],
]) {
  test(`contradictory access-token ${hint} cannot replace saved credentials or binding`, () => {
    const original = auth();
    const input = join(root, `conflicting-${hint}.json`);
    writeFileSync(input, original);
    const added = ok(['add', '--label', `Access ${hint}`, '--import', input]);
    const saved = join(state, 'credentials', `${added.profile.bindingId}.json`);
    const previous = ok(['show', '--identity', added.profile.id]);
    const conflicting = JSON.parse(
      auth('account-A', 'user-A', 'SYNTHETIC-CONFLICT'),
    );
    const claims = {
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'account-A',
        chatgpt_user_id: 'user-A',
        [hint]: conflict,
      },
    };
    conflicting.tokens.access_token = `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
    writeFileSync(input, JSON.stringify(conflicting));
    const refused = run([
      'login',
      '--identity',
      added.profile.id,
      '--import',
      input,
    ]);
    assert.equal(refused.status, 2);
    assert.equal(
      JSON.parse(refused.stderr).code,
      'IDENTITY_FORMAT_UNSUPPORTED',
    );
    assert.doesNotMatch(
      refused.stdout + refused.stderr,
      /SYNTHETIC-CONFLICT|account-B|user-B/,
    );
    assert.equal(readFileSync(saved, 'utf8'), original);
    assert.deepEqual(ok(['show', '--identity', added.profile.id]), previous);
  });
}

test('consistent token hints and opaque access tokens retain the same binding', () => {
  const input = join(root, 'consistent-tokens.json');
  writeFileSync(input, auth());
  const added = ok(['add', '--label', 'Consistent tokens', '--import', input]);
  const saved = join(state, 'credentials', `${added.profile.bindingId}.json`);
  const hints = {
    chatgpt_account_id: 'account-A',
    chatgpt_user_id: 'user-A',
    user_id: 'user-A',
  };
  const jwt = (claims) =>
    `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': claims })).toString('base64url')}.synthetic`;
  for (const access of [jwt(hints), 'opaque.with.dots', 'OPAQUE-ACCESS']) {
    const credential = JSON.parse(auth());
    credential.tokens.id_token = jwt(hints);
    credential.tokens.access_token = access;
    const bytes = JSON.stringify(credential);
    writeFileSync(input, bytes);
    const renewed = ok([
      'login',
      '--identity',
      added.profile.id,
      '--import',
      input,
    ]);
    assert.equal(renewed.profile.bindingId, added.profile.bindingId);
    assert.equal(readFileSync(saved, 'utf8'), bytes);
  }
  delete hints.chatgpt_user_id;
  const credential = JSON.parse(auth());
  credential.tokens.id_token = jwt(hints);
  writeFileSync(input, JSON.stringify(credential));
  assert.equal(
    ok(['login', '--identity', added.profile.id, '--import', input]).profile
      .bindingId,
    added.profile.bindingId,
  );
});
