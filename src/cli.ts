#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'doctor') {
  try {
    const { parseDiscoveryOptions } = await import('./discovery-options.js');
    const options = parseDiscoveryOptions(args.slice(1));
    const { doctor } = await import('./doctor.js');
    const runtime = await doctor();
    const targetDiscovery = options
      ? await (await import('./discovery.js')).discoverTarget(options)
      : undefined;
    const report = {
      ...runtime,
      ...(targetDiscovery
        ? { targetDiscovery, ok: runtime.ok && targetDiscovery.ok }
        : {}),
    };
    if (args.includes('--json'))
      process.stdout.write(JSON.stringify(report) + '\n');
    else {
      for (const check of report.checks)
        process.stderr.write(
          `${check.capability}: ${check.status}${check.action ? ` — ${check.action}` : ''}\n`,
        );
      if (targetDiscovery)
        process.stderr.write(JSON.stringify(targetDiscovery, null, 2) + '\n');
    }
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    if (args.includes('--json'))
      process.stdout.write(
        JSON.stringify({
          schemaVersion: 1,
          ok: false,
          code: 'INVALID_ARGUMENTS',
        }) + '\n',
      );
    else
      process.stderr.write(
        'Invalid doctor options. Use --target local|docker and explicit path options.\n',
      );
    process.exitCode = 2;
  }
} else if (args[0] === 'guard' || args[0] === 'processes') {
  const { guardCommand } = await import('./guard-command.js');
  process.exitCode = await guardCommand(args[0], args.slice(1));
} else if (args[0] === 'profiles') {
  const { profilesCommand } = await import('./profiles.js');
  process.exitCode = await profilesCommand(args.slice(1));
} else {
  const { run } = await import('./run.js');
  process.exitCode = await run(args[0] === 'run' ? args.slice(1) : args);
}
