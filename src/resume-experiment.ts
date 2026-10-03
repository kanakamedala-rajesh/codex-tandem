import { decodeCaptureEvent, type CaptureEvent } from './capture.js';

/** Synthetic aliases describe the controlled experiment, never provider identity proof. */
export interface ExperimentLaunch {
  launchId: string;
  targetGeneration: string;
  identity: 'A' | 'B';
  context: 'per-launch' | 'unverified-server';
}
export interface ExperimentObservation {
  expectedLaunchId: string;
  event: CaptureEvent;
}

/** Read-only G0 evidence assessment. No activation, accounting or production attribution. */
export function assessResumeExperiment(
  launches: readonly ExperimentLaunch[],
  observations: readonly ExperimentObservation[],
) {
  const label = /^[A-Za-z0-9_-]{1,64}$/;
  const launchIds = new Set<string>();
  for (const launch of launches) {
    if (
      !label.test(launch.launchId) ||
      !label.test(launch.targetGeneration) ||
      !['A', 'B'].includes(launch.identity) ||
      !['per-launch', 'unverified-server'].includes(launch.context) ||
      launchIds.has(launch.launchId)
    )
      throw new Error('INVALID_EXPERIMENT_LAUNCH');
    launchIds.add(launch.launchId);
  }
  if (launches.length > 256 || observations.length > 256)
    throw new Error('EXPERIMENT_LIMIT');
  const attempts = new Map<string, CaptureEvent & { identity: 'A' | 'B' }>();
  const unresolved = new Map<string, { eventId: string; reason: string }>();
  const copies = new Map<string, string>();
  for (const observation of observations) {
    const event = decodeCaptureEvent(
      Buffer.from(JSON.stringify(observation.event)),
    );
    const copy = JSON.stringify({
      expectedLaunchId: observation.expectedLaunchId,
      event,
    });
    if (copies.has(event.eventId)) {
      if (copies.get(event.eventId) !== copy) {
        attempts.delete(event.eventId);
        unresolved.set(event.eventId, {
          eventId: event.eventId,
          reason: 'CONFLICTING_EVENT',
        });
      }
      continue;
    }
    copies.set(event.eventId, copy);
    const launch = launches.find(
      (value) => value.launchId === observation.expectedLaunchId,
    );
    const reason = !launch
      ? 'MISSING_LAUNCH_CONTEXT'
      : event.launchId !== launch.launchId
        ? 'STALE_LAUNCH_CONTEXT'
        : event.targetGeneration !== launch.targetGeneration
          ? 'TARGET_MISMATCH'
          : launch.context !== 'per-launch'
            ? 'SERVER_CONTEXT_UNVERIFIED'
            : undefined;
    if (reason || !launch) {
      unresolved.set(event.eventId, {
        eventId: event.eventId,
        reason: reason!,
      });
      continue;
    }
    attempts.set(event.eventId, { ...event, identity: launch.identity });
  }
  return {
    fullTracking: false as const,
    attempts: [...attempts.values()].sort(
      (a, b) =>
        a.launchId.localeCompare(b.launchId) ||
        a.eventId.localeCompare(b.eventId),
    ),
    unresolved: [...unresolved.values()].sort((a, b) =>
      a.eventId.localeCompare(b.eventId),
    ),
  };
}
