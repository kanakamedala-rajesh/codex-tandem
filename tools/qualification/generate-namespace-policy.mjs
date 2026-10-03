// Qualification-only transformation; see namespace-policy.md for provenance.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [baselinePath, outputPath] = process.argv.slice(2);
if (!baselinePath || !outputPath || process.argv.length !== 4) {
  throw new Error('Usage: node generate-namespace-policy.mjs BASELINE OUTPUT');
}
const bytes = readFileSync(baselinePath);
if (
  createHash('sha256').update(bytes).digest('hex') !==
  '536529b665dd0972c37bfb569f5d4ac8a53592e7b00752bc39ff063ca9864c74'
) {
  throw new Error('Baseline SHA-256 mismatch; refusing an unreviewed policy');
}
const profile = JSON.parse(bytes);
const allow = (name, index, value) => ({
  args: [{ index, value, op: 'SCMP_CMP_EQ' }],
  names: [name],
  action: 'SCMP_ACT_ALLOW',
});
profile.syscalls.push(
  allow('clone', 0, 2013397009),
  allow('clone', 0, 939655185),
  allow('unshare', 0, 268435456),
  { action: 'SCMP_ACT_ALLOW', names: ['mount', 'pivot_root'] },
  allow('umount2', 1, 2),
);
// Exclusive creation prevents overwriting an existing reviewed policy.
writeFileSync(outputPath, JSON.stringify(profile, null, 2) + '\n', {
  flag: 'wx',
});
