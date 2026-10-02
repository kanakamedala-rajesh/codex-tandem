#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'doctor' && args.slice(1).every(arg => arg === '--json')) {
  const { doctor } = await import('./doctor.js');
  const report = await doctor();
  if (args.includes('--json')) process.stdout.write(JSON.stringify(report) + '\n');
  else for (const check of report.checks) process.stderr.write(`${check.capability}: ${check.status}${check.action ? ` — ${check.action}` : ''}\n`);
  process.exitCode = report.ok ? 0 : 1;
} else {
  if (args.includes('--json')) process.stdout.write(JSON.stringify({ schemaVersion: 1, ok: false, code: 'INVALID_ARGUMENTS', usage: 'codex-tandem doctor [--json]' }) + '\n');
  else process.stderr.write('Usage: codex-tandem doctor [--json]\n');
  process.exitCode = 2;
}

