import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = (name) =>
  pathToFileURL(resolve(process.env.TANDEM_TEST_PACKAGE || '.', 'dist', name))
    .href;
const { privateDirectory, writePrivate } = await import(
  modulePath('private-files.js')
);
const jwt =
  'e30.' +
  Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'workspace-A',
        chatgpt_user_id: 'user-A',
      },
    }),
  ).toString('base64url') +
  '.synthetic';
const credential = JSON.stringify({
  tokens: {
    account_id: 'workspace-A',
    id_token: jwt,
    access_token: 'PRIVATE-SENTINEL',
    refresh_token: 'PRIVATE-SENTINEL',
  },
});
test('canceled isolated Codex login leaves live credentials and configuration byte-identical', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct09-login-'));
  try {
    const home = await privateDirectory(join(root, 'codex'));
    const storage = await privateDirectory(join(root, 'store'));
    await writePrivate(join(home, 'auth.json'), credential);
    await writePrivate(
      join(home, 'config.toml'),
      'cli_auth_credentials_store = "file"\n',
    );
    const fixture = join(root, 'codex.mjs');
    await writeFile(
      fixture,
      `import readline from 'node:readline';\nif (process.argv.includes('login')) process.exit(130);\nreadline.createInterface({input:process.stdin}).on('line', line => { const r=JSON.parse(line); if(r.id===0) console.log(JSON.stringify({id:0,result:{}})); if(r.id===1) console.log(JSON.stringify({id:1,result:{config:{cli_auth_credentials_store:'file'},layers:[]}})); if(r.id===2) console.log(JSON.stringify({id:2,result:{requirements:null}})); });`,
    );
    const { stagedCredential } = await import(modulePath('profile-login.js'));
    await assert.rejects(
      stagedCredential({
        command: { executable: process.execPath, prefix: [fixture] },
        codexHome: home,
        stateHome: storage,
        cwd: resolve('.'),
      }),
      /LOGIN_CANCELED/,
    );
    assert.equal(await readFile(join(home, 'auth.json'), 'utf8'), credential);
    assert.equal(
      await readFile(join(home, 'config.toml'), 'utf8'),
      'cli_auth_credentials_store = "file"\n',
    );
    assert.deepEqual(
      (await readdir(storage)).filter((p) => p.startsWith('login-')),
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('successful isolated login yields private credentials without changing live home', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct09-success-'));
  try {
    const home = await privateDirectory(join(root, 'codex'));
    const storage = await privateDirectory(join(root, 'store'));
    await writePrivate(join(home, 'auth.json'), 'original-valid-credential');
    const fixture = join(root, 'codex.mjs');
    await writeFile(
      fixture,
      `import readline from 'node:readline'; import {writeFileSync} from 'node:fs'; import {join} from 'node:path'; if(process.argv.includes('login')) { writeFileSync(join(process.env.CODEX_HOME,'auth.json'),${JSON.stringify(credential)},{mode:0o600}); process.exit(0); } readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===0)console.log(JSON.stringify({id:0,result:{}}));if(r.id===1)console.log(JSON.stringify({id:1,result:{config:{cli_auth_credentials_store:'file'},layers:[]}}));if(r.id===2)console.log(JSON.stringify({id:2,result:{requirements:null}}));});`,
    );
    const { stagedCredential } = await import(modulePath('profile-login.js'));
    assert.equal(
      (
        await stagedCredential({
          command: { executable: process.execPath, prefix: [fixture] },
          codexHome: home,
          stateHome: storage,
          cwd: resolve('.'),
        })
      ).toString(),
      credential,
    );
    assert.equal(
      await readFile(join(home, 'auth.json'), 'utf8'),
      'original-valid-credential',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('unknown effective auth constraints block login before any credential mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct09-policy-'));
  try {
    const home = await privateDirectory(join(root, 'codex'));
    const storage = await privateDirectory(join(root, 'store'));
    const fixture = join(root, 'codex.mjs');
    await writeFile(
      fixture,
      `import readline from 'node:readline';if(process.argv.includes('login'))process.exit(130);readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===0)console.log(JSON.stringify({id:0,result:{}}));if(r.id===1)console.log(JSON.stringify({id:1,result:{config:{cli_auth_credentials_store:'file',forced_login_method:'unrecognized'},layers:[]}}));if(r.id===2)console.log(JSON.stringify({id:2,result:{requirements:null}}));});`,
    );
    const { stagedCredential } = await import(modulePath('profile-login.js'));
    await assert.rejects(
      stagedCredential({
        command: { executable: process.execPath, prefix: [fixture] },
        codexHome: home,
        stateHome: storage,
        cwd: resolve('.'),
      }),
      /POLICY_UNVERIFIABLE/,
    );
    assert.deepEqual(await readdir(storage), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('managed/keyring policy and incomplete policy are blocked without override or backup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct09-managed-'));
  try {
    const home = await privateDirectory(join(root, 'codex'));
    const storage = await privateDirectory(join(root, 'store'));
    const { previewLogin } = await import(modulePath('profile-login.js'));
    for (const [requirements, layers, expected] of [
      [{ cliAuthCredentialsStore: 'keyring' }, [], 'FILE_STORAGE_PROHIBITED'],
      [{}, [], 'POLICY_UNVERIFIABLE'],
      [
        null,
        [
          {
            name: {
              type: 'enterpriseManaged',
              id: 'synthetic',
              name: 'Policy',
            },
          },
        ],
        'POLICY_UNVERIFIABLE',
      ],
      ['omitted', [], 'POLICY_UNVERIFIABLE'],
    ]) {
      const fixture = join(root, 'codex.mjs');
      const result = requirements === 'omitted' ? {} : { requirements };
      await writeFile(
        fixture,
        `import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===0)console.log(JSON.stringify({id:0,result:{}}));if(r.id===1)console.log(JSON.stringify({id:1,result:{config:{cli_auth_credentials_store:'file'},layers:${JSON.stringify(layers)}}}));if(r.id===2)console.log(JSON.stringify({id:2,result:${JSON.stringify(result)}}));});`,
      );
      await assert.rejects(
        previewLogin({
          command: { executable: process.execPath, prefix: [fixture] },
          codexHome: home,
          stateHome: storage,
          cwd: resolve('.'),
          approveFileMode: true,
        }),
        new RegExp(expected),
      );
      assert.deepEqual(await readdir(storage), []);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('file mode changes require preview and consent and retain a restricted configuration backup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct09-consent-'));
  try {
    const home = await privateDirectory(join(root, 'codex'));
    const storage = await privateDirectory(join(root, 'store'));
    const config =
      'cli_auth_credentials_store = "keyring"\n# Keep user hooks and trust\n[hooks]\n';
    await writePrivate(join(home, 'config.toml'), config);
    const fixture = join(root, 'codex.mjs');
    await writeFile(
      fixture,
      `import readline from 'node:readline';if(process.argv.includes('login'))process.exit(130);const mode=process.argv.includes('cli_auth_credentials_store="file"')?'file':'keyring';readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===0)console.log(JSON.stringify({id:0,result:{}}));if(r.id===1)console.log(JSON.stringify({id:1,result:{config:{cli_auth_credentials_store:mode},layers:[]}}));if(r.id===2)console.log(JSON.stringify({id:2,result:{requirements:null}}));});`,
    );
    const { stagedCredential, previewLogin } = await import(
      modulePath('profile-login.js')
    );
    const options = {
      command: { executable: process.execPath, prefix: [fixture] },
      codexHome: home,
      stateHome: storage,
      cwd: resolve('.'),
    };
    assert.deepEqual(await previewLogin(options), {
      mode: 'keyring',
      change: 'staging-only file mode',
      backupRequired: true,
    });
    await assert.rejects(
      stagedCredential(options),
      /FILE_MODE_APPROVAL_REQUIRED/,
    );
    assert.deepEqual(await readdir(storage), []);
    await assert.rejects(
      stagedCredential({ ...options, approveFileMode: true }),
      /LOGIN_CANCELED/,
    );
    const files = await readdir(storage);
    assert.equal(files.length, 1);
    assert.match(files[0], /^config-backup-/);
    assert.equal(await readFile(join(storage, files[0]), 'utf8'), config);
    const { verifyPrivate } = await import(modulePath('private-files.js'));
    await verifyPrivate(join(storage, files[0]));
    assert.equal(await readFile(join(home, 'config.toml'), 'utf8'), config);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
