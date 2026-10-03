import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const target = {
  experimental: true,
  generation:
    '057df0f1fa2c691b7341cfe3688817b3ed86f09462f2c830e343e48075f623e2',
  uid: 1000,
  home: '/home/validation',
  codexHome: '/home/validation/ct07-qualification-20261002/codex-home',
  project: '/home/validation/ct07-qualification-20261002/project',
  executable: '/home/validation/ct07-qualification-20261002/runtime/bin/codex',
};
const prompt =
  'Run exactly `python3 build.py` once in the current directory. Do not modify source files, use the network, or run other commands. Report only whether it passed.';
const modulePath = resolve(process.argv.at(-1));
if (process.argv[2] === '--child') {
  const { runG0ContainerExperiment } = await import(pathToFileURL(modulePath));
  process.exitCode = await runG0ContainerExperiment(target, prompt);
} else {
  // Capture raw native/model output in memory only; only fixed projections leave here.
  const probe = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), '--child', modulePath],
    {
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const records = [];
  for (const line of (probe.stdout ?? '').split('\n')) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object') records.push(value);
    } catch {
      /* no raw export */
    }
  }
  const commands = records
    .filter(
      (value) =>
        value.type === 'item.completed' &&
        value.item?.type === 'command_execution',
    )
    .map((value) => value.item);
  const diagnostic = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.toLowerCase();
  const proof = JSON.parse(
    execFileSync(
      'docker',
      [
        'exec',
        '--user',
        '1000',
        target.generation,
        '/usr/local/bin/python3',
        '-c',
        `
import pathlib,json,hashlib
root=pathlib.Path('/home/validation/ct07-qualification-20261002')
project=root/'project'
source=json.loads((root/'source-hashes.json').read_text())
unchanged=all(hashlib.sha256((project/name).read_bytes()).hexdigest()==value for name,value in source.items())
artifact=project/'build/result.json'
environment=project/'build/environment.json'
equal=artifact.is_file() and artifact.read_bytes()==(root/'baseline-result.json').read_bytes()
env_equal=environment.is_file() and json.loads(environment.read_text())==json.loads((root/'baseline-environment.json').read_text())
print(json.dumps({'sourceUnchanged':unchanged,'artifactExists':artifact.is_file(),'artifactMatchesDirectBaseline':equal,'effectiveEnvironmentMatchesDirectBaseline':env_equal,'compiledModuleExists':(project/'build/calculator.pyc').is_file(),'artifactSha256':hashlib.sha256(artifact.read_bytes()).hexdigest() if equal else None}))
`,
      ],
      { encoding: 'utf8' },
    ),
  );
  const result = {
    schemaVersion: 1,
    targetGeneration: target.generation,
    hostPlatform: process.platform,
    hostNode: process.version,
    nativeExit: probe.status,
    timedOut: probe.error?.code === 'ETIMEDOUT',
    nativeTurnStarted: records.some((value) => value.type === 'turn.started'),
    nativeTurnCompleted: records.some(
      (value) => value.type === 'turn.completed',
    ),
    nativeTurnFailed: records.some((value) => value.type === 'turn.failed'),
    completedCommandCount: commands.length,
    buildCommandSucceeded: commands.some(
      (value) =>
        typeof value.command === 'string' &&
        value.command.includes('python3 build.py') &&
        value.exit_code === 0,
    ),
    failureCategory:
      /bwrap|bubblewrap|operation not permitted|failed to create.*namespace/.test(
        diagnostic,
      )
        ? 'SANDBOX_CAPABILITY'
        : /unauthorized|authentication/.test(diagnostic)
          ? 'AUTHENTICATION'
          : /usage limit|quota/.test(diagnostic)
            ? 'QUOTA'
            : probe.status === 0
              ? 'NONE'
              : 'OTHER',
    ...proof,
    rawExported: false,
  };
  console.log(JSON.stringify(result));
  process.exitCode =
    result.nativeExit === 0 &&
    result.buildCommandSucceeded &&
    proof.sourceUnchanged &&
    proof.artifactMatchesDirectBaseline &&
    proof.effectiveEnvironmentMatchesDirectBaseline &&
    proof.compiledModuleExists
      ? 0
      : 1;
}
