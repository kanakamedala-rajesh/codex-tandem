// Maintained SRS §14.2 local synthetic full-launch benchmark; never uses real Codex.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm, copyFile } from 'node:fs/promises';
import { cpus, totalmem, release } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { activationFixture } from '../test/fixtures/activation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const ready = 'TANDEM_BENCHMARK_READY\n';

/** Measure this benchmark's fixed readiness marker and clean process completion. Unexpected output, nonzero exit and deadlines fail without exposing child output. */
export function measureLaunch(executable, args, options) {
  return new Promise((resolveResult, reject) => {
    const start = performance.now();
    let readinessMs,
      failure,
      output = '',
      stderrBytes = 0;
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    const fail = (code) => {
      failure ??= new Error(code);
      child.kill('SIGKILL');
    };
    const timer = setTimeout(
      () => fail('BENCHMARK_TIMEOUT'),
      options.timeoutMs,
    );
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('BENCHMARK_SPAWN_FAILED'));
    });
    child.stdin.on('error', () => {}); // An early exit is diagnosed from close, without an EPIPE leak.
    child.stdin.end();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > 4096) {
        output = '';
        fail('BENCHMARK_OUTPUT_LIMIT');
      } else if (output === ready && readinessMs === undefined) {
        readinessMs = performance.now() - start;
      } else if (!ready.startsWith(output)) {
        fail('BENCHMARK_READINESS_INVALID');
      }
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 4096) fail('BENCHMARK_OUTPUT_LIMIT');
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0 || signal)
        reject(new Error('BENCHMARK_CHILD_FAILED'));
      else if (stderrBytes) reject(new Error('BENCHMARK_CHILD_DIAGNOSTIC'));
      else if (readinessMs === undefined || output !== ready)
        reject(new Error('BENCHMARK_READINESS_MISSING'));
      else
        resolveResult({ readinessMs, completionMs: performance.now() - start });
    });
  });
}

function argumentsFor(args) {
  const diagnostic = args.includes('--diagnostic');
  const values = {
    warmups: diagnostic ? 2 : 50,
    samples: diagnostic ? 10 : 1000,
    timeoutMs: 180000,
    identityMode: 'same',
  };
  const seen = new Set();
  for (const arg of args) {
    if (arg.startsWith('--identity-mode=')) {
      const mode = arg.slice('--identity-mode='.length);
      if (seen.has('identityMode') || !['same', 'alternating'].includes(mode))
        throw new Error('BENCHMARK_ARGUMENTS_INVALID');
      seen.add('identityMode');
      values.identityMode = mode;
      continue;
    }
    const match = /^--(warmups|samples|timeout-ms)=(\d+)$/.exec(arg);
    const key = match?.[1] === 'timeout-ms' ? 'timeoutMs' : match?.[1];
    if (seen.has(key ?? arg)) throw new Error('BENCHMARK_ARGUMENTS_INVALID');
    seen.add(key ?? arg);
    if (arg === '--diagnostic') continue;
    if (!match) throw new Error('BENCHMARK_ARGUMENTS_INVALID');
    const value = Number(match[2]);
    if (
      !Number.isSafeInteger(value) ||
      value < (key === 'warmups' ? 0 : 1) ||
      value > (key === 'timeoutMs' ? 180000 : 10000)
    )
      throw new Error('BENCHMARK_ARGUMENTS_INVALID');
    values[key] = value;
  }
  if (!diagnostic && (values.warmups < 50 || values.samples < 1000))
    throw new Error('BENCHMARK_DIAGNOSTIC_REQUIRED');
  return { diagnostic, ...values };
}

function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.ceil(sorted.length * p) - 1];
  return {
    samples,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1),
  };
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function artifactIdentity() {
  const files = {};
  let entriesSeen = 0;
  async function collect(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const path = join(directory, entry.name);
      if (++entriesSeen > 1024 || relative(root, path).length > 256)
        throw new Error('BENCHMARK_ARTIFACT_LIMIT');
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile())
        files[relative(root, path).replaceAll('\\', '/')] = await sha256(path);
      else throw new Error('BENCHMARK_ARTIFACT_INVALID');
    }
  }
  await collect(join(root, 'dist'));
  for (const path of [
    'scripts/benchmark-launch.mjs',
    'test/fixtures/benchmark-launch.mjs',
    'test/fixtures/activation.mjs',
    'package.json',
  ])
    files[path] = await sha256(join(root, path));
  const git = (args) => {
    const result = spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0)
      throw new Error('BENCHMARK_SOURCE_IDENTITY_UNAVAILABLE');
    return result.stdout.trim();
  };
  return {
    commit: git(['rev-parse', 'HEAD']),
    dirty: git(['status', '--porcelain']).length > 0,
    filesSha256: files,
    nodeSha256: await sha256(process.execPath),
  };
}

async function main() {
  const configuration = argumentsFor(process.argv.slice(2));
  if (process.env.TANDEM_TEST_PACKAGE)
    throw new Error('BENCHMARK_PACKAGE_OVERRIDE_UNSUPPORTED');
  const identity = await artifactIdentity();
  let fixture, evidence;
  try {
    fixture = await activationFixture();
    const script = fixture.options.command.prefix[0];
    await copyFile(join(root, 'test/fixtures/benchmark-launch.mjs'), script);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^(CODEX_|TANDEM_|OPENAI_)/i.test(key),
      ),
    );
    Object.assign(env, {
      CODEX_HOME: fixture.home,
      TANDEM_BENCHMARK_STATE: fixture.state,
    });
    const direct = [script];
    const wrapped = [
      join(root, 'dist', 'cli.js'),
      'run',
      '--target',
      'local',
      '--identity',
      fixture.profiles[0].id,
      '--state-home',
      fixture.state,
      '--codex-home',
      fixture.home,
      '--codex-executable',
      fixture.options.command.executable,
      '--codex-script',
      script,
      '--project',
      fixture.root,
      '--json',
    ];
    const identityArgument = wrapped.indexOf('--identity') + 1;
    const pairs = [];
    for (let i = 0; i < configuration.warmups + configuration.samples; i++) {
      wrapped[identityArgument] =
        fixture.profiles[
          configuration.identityMode === 'alternating' ? i % 2 : 0
        ].id;
      const pair = { order: i % 2 === 0 ? 'direct-wrapped' : 'wrapped-direct' };
      for (const kind of pair.order.split('-'))
        pair[kind] = await measureLaunch(
          kind === 'direct'
            ? fixture.options.command.executable
            : process.execPath,
          kind === 'direct' ? direct : wrapped,
          { cwd: fixture.root, env, timeoutMs: configuration.timeoutMs },
        );
      if (i >= configuration.warmups) pairs.push(pair);
    }
    // Inspect only this harness's intended-launch records after measurement;
    // never put this verification on the managed launch path.
    const launchesPerIdentity = [0, 0];
    for (const name of await readdir(join(fixture.state, 'launches'))) {
      if (!/^launch-[a-f0-9-]{36}\.json$/.test(name))
        throw new Error('BENCHMARK_IDENTITY_PROOF_FAILED');
      const record = JSON.parse(
        await readFile(join(fixture.state, 'launches', name), 'utf8'),
      );
      const selected = fixture.profiles.findIndex(
        (profile) =>
          profile.id === record.profileId &&
          profile.bindingId === record.bindingId,
      );
      if (
        selected < 0 ||
        record.status !== 'prepared' ||
        record.mode !== 'tracked'
      )
        throw new Error('BENCHMARK_IDENTITY_PROOF_FAILED');
      launchesPerIdentity[selected]++;
    }
    const total = configuration.warmups + configuration.samples;
    const expected =
      configuration.identityMode === 'alternating'
        ? [Math.ceil(total / 2), Math.floor(total / 2)]
        : [total, 0];
    if (launchesPerIdentity.some((count, index) => count !== expected[index]))
      throw new Error('BENCHMARK_IDENTITY_PROOF_FAILED');
    const metric = (key) => ({
      direct: distribution(pairs.map((p) => p.direct[key])),
      wrapped: distribution(pairs.map((p) => p.wrapped[key])),
      overhead: distribution(pairs.map((p) => p.wrapped[key] - p.direct[key])),
    });
    const readinessMs = metric('readinessMs');
    const withinBudget =
      readinessMs.overhead.p95 <= 100 && readinessMs.overhead.p99 <= 250;
    const finalIdentity = await artifactIdentity();
    if (
      identity.commit !== finalIdentity.commit ||
      JSON.stringify(identity.filesSha256) !==
        JSON.stringify(finalIdentity.filesSha256)
    )
      throw new Error('BENCHMARK_ARTIFACT_CHANGED');
    evidence = {
      schemaVersion: 1,
      ok: true,
      fixtureOnly: true,
      releaseQualified: false,
      configuration,
      launchesPerIdentity,
      identity,
      platform: {
        os: process.platform,
        release: release(),
        arch: process.arch,
        node: process.version,
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpus: cpus().length,
        memoryBytes: totalmem(),
        wsl: /microsoft/i.test(release()),
        smartAppControl: 'NOT_VERIFIED',
      },
      boundary:
        'process spawn to fixed harmless-fixture readiness marker; completion includes registration, exit sync and guard release',
      conditions: {
        target: 'local synthetic',
        cache: 'warm process; OS cache uncontrolled',
        collector: 'not started',
        history:
          'synthetic credentials and growing launch journals; no rollouts or analytics',
      },
      notExecuted: [
        'real Codex UI readiness',
        'equivalent Docker/legacy-target baseline',
        'cold OS cache',
        'collector running/importing',
        'typical/large history comparison',
        'capture-hook performance',
        'interactive selector responsiveness',
        'other runtime/platform combinations',
      ],
      pairingOrder: pairs.map((p) => p.order),
      readinessMs,
      completionMs: metric('completionMs'),
      fixtureBudget: {
        metric: 'readinessMs.overhead',
        p95LimitMs: 100,
        p99LimitMs: 250,
        result: configuration.diagnostic
          ? 'DIAGNOSTIC_ONLY'
          : withinBudget
            ? 'PASS'
            : 'FAIL',
      },
    };
  } finally {
    if (fixture) await rm(fixture.root, { recursive: true, force: true });
  }
  process.stdout.write(JSON.stringify(evidence) + '\n');
  if (evidence.fixtureBudget.result === 'FAIL') process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    const code =
      error instanceof Error && /^BENCHMARK_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'BENCHMARK_FAILED';
    process.stderr.write(
      JSON.stringify({
        schemaVersion: 1,
        ok: false,
        code,
        fixtureOnly: true,
        releaseQualified: false,
      }) + '\n',
    );
    process.exitCode = 2;
  }
}
