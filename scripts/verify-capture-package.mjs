import { writeFileSync } from 'node:fs';

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withTempPackage } from './temp-package.mjs';
import assert from 'node:assert/strict';
await withTempPackage(async ({ scratch, packageRoot, sha256 }) => {
  const { decodeCaptureEvent, readCaptureInbox } = await import(
    pathToFileURL(join(packageRoot, 'dist', 'capture.js'))
  );
  const fixture = {
    schemaVersion: 1,
    eventId: '11111111-1111-4111-8111-111111111111',
    kind: 'turn.started',
    launchId: 'launch_A',
    targetGeneration: 'generation_A',
    sessionId: '22222222-2222-4222-8222-222222222222',
    turnId: '33333333-3333-4333-8333-333333333333',
    capturedAt: '2026-10-02T10:00:00Z',
  };
  assert.deepEqual(
    decodeCaptureEvent(
      Buffer.from(JSON.stringify({ ...fixture, prompt: 'PRIVATE_SENTINEL' })),
    ),
    fixture,
  );
  writeFileSync(
    join(scratch, fixture.eventId + '.json'),
    JSON.stringify(fixture),
  );
  writeFileSync(join(scratch, 'incomplete.tmp'), 'unfinished');
  assert.deepEqual(await readCaptureInbox(scratch), [fixture]);
  assert.deepEqual(await readCaptureInbox(scratch), [fixture]);
  assert.throws(() => decodeCaptureEvent(Buffer.alloc(4097)), {
    message: 'INVALID_CAPTURE_EVENT',
  });
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        platform: process.platform,
        node: process.version,
        packageSha256: sha256,
        result: 'PASS',
        cases: [
          'installed capture projection',
          'bounded rejection',
          'committed-only repeated snapshot',
        ],
        scope:
          'G0 synthetic contract; no durable database receipt or full-tracking claim',
      },
      null,
      2,
    ),
  );
});
