import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeCaptureEvent } from '../dist/capture.js';
const event = {
  schemaVersion: 1,
  eventId: '11111111-1111-4111-8111-111111111111',
  kind: 'turn.started',
  launchId: 'launch_A',
  targetGeneration: 'generation_A',
  sessionId: '22222222-2222-4222-8222-222222222222',
  turnId: '33333333-3333-4333-8333-333333333333',
  capturedAt: '2026-10-02T10:00:00Z',
};
test('host accepts the bounded projected turn-start contract and discards unknown content', () => {
  assert.deepEqual(
    decodeCaptureEvent(
      Buffer.from(JSON.stringify({ ...event, prompt: 'must disappear' })),
    ),
    event,
  );
});
test('host rejects oversized, malformed, unsupported and content-shaped metadata without echoing input', () => {
  for (const bytes of [
    Buffer.alloc(4097, 32),
    Buffer.from('secret malformed'),
    ...[
      { ...event, schemaVersion: 2 },
      { ...event, turnId: 'prompt with spaces' },
      { ...event, eventId: 'secret' },
      { ...event, capturedAt: 'tomorrow' },
      { ...event, launchId: 'x'.repeat(65) },
      { ...event, kind: 'tool.started' },
      null,
    ].map((x) => Buffer.from(JSON.stringify(x))),
  ]) {
    assert.throws(() => decodeCaptureEvent(bytes), {
      message: 'INVALID_CAPTURE_EVENT',
    });
  }
});
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readCaptureInbox } from '../dist/capture.js';
test('collector-absent inbox survives repeated reads and ignores interrupted publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct05-inbox-'));
  try {
    await writeFile(join(root, event.eventId + '.json'), JSON.stringify(event));
    await writeFile(join(root, 'interrupted.tmp'), 'unfinished');
    assert.deepEqual(await readCaptureInbox(root), [event]);
    assert.deepEqual(await readCaptureInbox(root), [event]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('capture contract rejects calendar dates that normalize to a different day', () => {
  assert.throws(
    () =>
      decodeCaptureEvent(
        Buffer.from(
          JSON.stringify({ ...event, capturedAt: '2026-02-31T10:00:00Z' }),
        ),
      ),
    { message: 'INVALID_CAPTURE_EVENT' },
  );
});
test('actual Codex metadata including the crash-before-completion event is readable without raw content', async () => {
  const events = await readCaptureInbox(
    fileURLToPath(
      new URL('../docs/qualification/ct05/actual-events/', import.meta.url),
    ),
  );
  assert.equal(events.length, 4);
  const crash = events.find(
    (event) => event.eventId === '14621415-988a-492b-ba78-c8caabd6588d',
  );
  assert.equal(crash?.kind, 'turn.started');
  assert.equal(crash?.launchId, 'launch_ct05');
});
