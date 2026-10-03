import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Check = {
  capability: string;
  status: 'pass' | 'fail';
  code?: string;
  action?: string;
};
/**
 * Probe the host Node floor, SQLite and gzip/Zstandard decompression capabilities.
 * Creates and removes a temporary SQLite database; installs nothing. Returns
 * runtime details and per-capability results, with ok true only when all pass.
 */
export async function doctor() {
  const checks: Check[] = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  checks.push(
    major > 22 || (major === 22 && minor >= 15)
      ? { capability: 'node', status: 'pass' }
      : {
          capability: 'node',
          status: 'fail',
          code: 'NODE_BELOW_FLOOR',
          action:
            'Use a trusted host Node >=22.15.0 with SQLite and Zstandard support.',
        },
  );
  async function check(capability: string, operation: () => Promise<void>) {
    try {
      await operation();
      checks.push({ capability, status: 'pass' });
    } catch {
      checks.push({
        capability,
        status: 'fail',
        code: 'CAPABILITY_SELF_TEST_FAILED',
        action: `Check host Node ${process.versions.node} for built-in ${capability} support and writable temporary storage. Use a maintained compatible host Node; doctor installs nothing.`,
      });
    }
  }
  await check('sqlite', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const directory = await mkdtemp(join(tmpdir(), 'tandem-doctor-'));
    try {
      const database = new DatabaseSync(join(directory, 'probe.sqlite'));
      try {
        database.exec('CREATE TABLE probe (value TEXT NOT NULL)');
        database.prepare('INSERT INTO probe VALUES (?)').run('tandem');
        if (
          database.prepare('SELECT value FROM probe').get()?.value !== 'tandem'
        )
          throw new Error('sqlite mismatch');
      } finally {
        database.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  await check('gzip', async () => {
    const { gunzipSync } = await import('node:zlib');
    if (
      gunzipSync(
        Buffer.from(
          'H4sIAAAAAAAACitJzEtJzdUtTs1J0y1JLS6JyQMAlZSGQhIAAAA=',
          'base64',
        ),
        { maxOutputLength: 128 },
      ).toString() !== 'tandem-self-test\\n'
    )
      throw new Error('gzip mismatch');
  });
  await check('zstandard', async () => {
    const { zstdDecompressSync } = await import('node:zlib');
    if (
      zstdDecompressSync(
        Buffer.from('KLUv/SASkQAAdGFuZGVtLXNlbGYtdGVzdFxu', 'base64'),
        { maxOutputLength: 128 },
      ).toString() !== 'tandem-self-test\\n'
    )
      throw new Error('zstandard mismatch');
  });
  return {
    schemaVersion: 1,
    command: 'doctor',
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    },
    ok: checks.every((c) => c.status === 'pass'),
    checks,
  };
}
