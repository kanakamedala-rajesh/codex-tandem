// Shared synthetic credentials and native target fixture for contract and crash checks.
import { mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export const modulePath = (name) =>
  pathToFileURL(resolve(process.env.TANDEM_TEST_PACKAGE || '.', 'dist', name))
    .href;
export const syntheticAuth = (account, refresh) =>
  JSON.stringify({
    tokens: {
      account_id: account,
      id_token: `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: account, chatgpt_user_id: 'synthetic-user' } })).toString('base64url')}.synthetic`,
      access_token: 'SYNTHETIC-ACCESS',
      refresh_token: refresh,
    },
  });
export async function activationFixture() {
  const { privateDirectory } = await import(modulePath('private-files.js'));
  const root = await mkdtemp(join(tmpdir(), 'ct11-activation-'));
  const home = await privateDirectory(join(root, 'home')),
    state = join(root, 'state');
  const executable = join(
    root,
    process.platform === 'win32' ? 'probe.exe' : 'probe',
  );
  await copyFile(process.execPath, executable);
  const script = join(root, 'policy.mjs');
  await writeFile(
    script,
    `import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===0)console.log(JSON.stringify({id:0,result:{}}));if(r.id===1)console.log(JSON.stringify({id:1,result:{config:{cli_auth_credentials_store:'file'},layers:[]}}));if(r.id===2)console.log(JSON.stringify({id:2,result:{requirements:null}}));});`,
  );
  const profiles = [];
  for (const account of ['A', 'B']) {
    const input = join(root, account + '.json');
    await writeFile(input, syntheticAuth(account, 'SYNTHETIC-' + account));
    profiles.push(
      JSON.parse(
        (
          await run(process.execPath, [
            fileURLToPath(modulePath('cli.js')),
            'profiles',
            'add',
            '--state-home',
            state,
            '--label',
            account,
            '--import',
            input,
            '--json',
          ])
        ).stdout,
      ).profile,
    );
  }
  return {
    root,
    home,
    state,
    profiles,
    options: {
      stateHome: state,
      codexHome: home,
      command: { executable, prefix: [script] },
      projectPath: root,
    },
  };
}
