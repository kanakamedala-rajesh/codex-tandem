#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'doctor' && args.slice(1).every(arg => arg === '--json')) {
  const { doctor } = await import('./doctor.js');
  const report = await doctor();
  if (args.includes('--json')) process.stdout.write(JSON.stringify(report) + '\n');
  else for (const check of report.checks) process.stderr.write(`${check.capability}: ${check.status}${check.action ? ` — ${check.action}` : ''}\n`);
  process.exitCode = report.ok ? 0 : 1;
} else {
  const {run}=await import('./run.js');
  process.exitCode=await run(args[0]==='run'?args.slice(1):args);
}
