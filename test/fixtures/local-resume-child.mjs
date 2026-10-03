import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';

// Intercept only the external process boundary; never execute the supplied binary.
const spawnSync = childProcess.spawnSync;
os.homedir = () => process.env.TANDEM_TEST_HOME;
childProcess.spawnSync = (binary, args, options) => {
  assert.equal(binary, 'harmless-child');
  assert.equal(options.env.CODEX_HOME, join(options.cwd, 'codex-home'));
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL'])
      assert.equal(process.env[key], undefined, key);
    const args = JSON.parse(process.argv[1]);
    const config = args.indexOf('-c');
    assert.ok(config >= 0 && config < args.indexOf('exec'));
    assert.equal(args[config + 1], 'cli_auth_credentials_store="file"');
    console.log(JSON.stringify({type:'thread.started', thread_id:'11111111-1111-4111-8111-111111111111'}));
    console.log(JSON.stringify({type:'turn.completed'}));
  `,
      JSON.stringify(args),
    ],
    options,
  );
  assert.equal(child.status, 0, child.stderr);
  return child;
};
syncBuiltinESMExports();
