// Same effective-policy contract as activation.mjs, plus a deterministic readiness boundary.
import readline from 'node:readline';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

if (process.argv.includes('app-server')) {
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const request = JSON.parse(line);
    if (request.id === 0) console.log(JSON.stringify({ id: 0, result: {} }));
    if (request.id === 1)
      console.log(
        JSON.stringify({
          id: 1,
          result: {
            config: { cli_auth_credentials_store: 'file' },
            layers: [],
          },
        }),
      );
    if (request.id === 2)
      console.log(JSON.stringify({ id: 2, result: { requirements: null } }));
  });
} else {
  if (process.env.TANDEM_LAUNCH_ID) {
    const record = JSON.parse(
      readFileSync(
        join(
          process.env.TANDEM_BENCHMARK_STATE,
          'launches',
          'launch-' + process.env.TANDEM_LAUNCH_ID + '.json',
        ),
        'utf8',
      ),
    );
    if (
      record.status !== 'prepared' ||
      record.id !== process.env.TANDEM_LAUNCH_ID ||
      record.mode !== 'tracked'
    )
      process.exit(91);
  }
  process.stdout.write('TANDEM_BENCHMARK_READY\n');
}
