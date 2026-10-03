import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessResumeExperiment } from '../dist/resume-experiment.js';
import { readFileSync } from 'node:fs';

const launches = [
  {
    launchId: 'launch_A',
    targetGeneration: 'target',
    identity: 'A',
    context: 'per-launch',
  },
  {
    launchId: 'launch_B',
    targetGeneration: 'target',
    identity: 'B',
    context: 'per-launch',
  },
];
const event = {
  schemaVersion: 1,
  eventId: '11111111-1111-4111-8111-111111111111',
  kind: 'turn.started',
  launchId: 'launch_A',
  targetGeneration: 'target',
  sessionId: '22222222-2222-4222-8222-222222222222',
  turnId: '33333333-3333-4333-8333-333333333333',
  capturedAt: '2026-10-02T10:00:00Z',
};

test('bounded resume evidence preserves A and B attempts for the same logical turn, including delayed A', () => {
  const observations = [
    {
      expectedLaunchId: 'launch_B',
      event: {
        ...event,
        eventId: '44444444-4444-4444-8444-444444444444',
        launchId: 'launch_B',
      },
    },
    { expectedLaunchId: 'launch_A', event },
  ];
  const result = assessResumeExperiment(launches, observations);
  assert.deepEqual(
    result.attempts.map((x) => [x.launchId, x.identity, x.turnId]),
    [
      ['launch_A', 'A', event.turnId],
      ['launch_B', 'B', event.turnId],
    ],
  );
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.fullTracking, false);
  assert.deepEqual(
    assessResumeExperiment(launches, [
      observations[1],
      observations[0],
      observations[1],
    ]),
    result,
  );
});

test('actual container resume exposes a new B turn and stale environment remains unresolved', () => {
  const runs = JSON.parse(
    readFileSync(
      new URL(
        '../docs/qualification/ct06/container-observations.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const actualLaunches = launches.map((launch, index) => ({
    ...launch,
    launchId: 'ct06_' + (index === 0 ? 'A' : 'B'),
    targetGeneration:
      'b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf',
  }));
  const result = assessResumeExperiment(
    actualLaunches,
    runs.flatMap((run) =>
      run.events.map((event) => ({
        expectedLaunchId: run.expectedLaunchId,
        event,
      })),
    ),
  );
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].sessionId, result.attempts[1].sessionId);
  assert.notEqual(result.attempts[0].turnId, result.attempts[1].turnId);
  assert.deepEqual(result.unresolved, [
    {
      eventId: '9ebf37dd-a022-44fd-b8cf-ebd5144f2497',
      reason: 'STALE_LAUNCH_CONTEXT',
    },
  ]);
  assert.equal(runs.find((run) => run.mode === 'missing').events.length, 0);
});

test('contradictory event copies remain unresolved in either arrival order', () => {
  const first = { expectedLaunchId: 'launch_A', event };
  const conflict = {
    expectedLaunchId: 'launch_B',
    event: { ...event, launchId: 'launch_B' },
  };
  for (const values of [
    [first, conflict],
    [conflict, first],
  ]) {
    assert.deepEqual(assessResumeExperiment(launches, values), {
      fullTracking: false,
      attempts: [],
      unresolved: [{ eventId: event.eventId, reason: 'CONFLICTING_EVENT' }],
    });
  }
  assert.throws(
    () =>
      assessResumeExperiment(
        [...launches, { ...launches[0], identity: 'B' }],
        [],
      ),
    { message: 'INVALID_EXPERIMENT_LAUNCH' },
  );
});

test('stale, missing, wrong-target and unverified-server contexts cannot establish an attempt', () => {
  for (const [context, observation, reason] of [
    [launches, { expectedLaunchId: 'launch_B', event }, 'STALE_LAUNCH_CONTEXT'],
    [launches, { expectedLaunchId: 'absent', event }, 'MISSING_LAUNCH_CONTEXT'],
    [
      launches,
      {
        expectedLaunchId: 'launch_A',
        event: { ...event, targetGeneration: 'other' },
      },
      'TARGET_MISMATCH',
    ],
    [
      [{ ...launches[0], context: 'unverified-server' }],
      { expectedLaunchId: 'launch_A', event },
      'SERVER_CONTEXT_UNVERIFIED',
    ],
  ]) {
    const result = assessResumeExperiment(context, [observation]);
    assert.deepEqual(result.attempts, []);
    assert.deepEqual(result.unresolved, [{ eventId: event.eventId, reason }]);
  }
});
