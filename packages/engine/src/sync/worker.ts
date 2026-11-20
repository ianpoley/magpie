import { readFileSync } from 'node:fs';

import { SCHEDULE } from '../config.ts';
import type { Paths } from '../config.ts';
import { lockHolder } from '../lock.ts';
import type { BackendName } from '../secrets/store.ts';
import { parseSecrets } from '../secrets.ts';
import { MESSAGE_MAX_CHARS, errorText } from '../util.ts';
import type { SyncRunResult } from './run.ts';
import { decide, intervalHours } from './scheduler.ts';
import {
  readConnection,
  readSchedulerState,
  readSyncRequest,
  removeSyncRequest,
  writeConnection,
  writeSchedulerState,
  writeWorkerStatus,
} from './state.ts';
import type { AttemptResult, LastAttempt } from './state.ts';

export type WorkerFiles = Pick<Paths, 'lock' | 'schedulerState' | 'workerStatus' | 'syncRequest' | 'xConnection' | 'settings'>;

export type WorkerOptions = {
  files: WorkerFiles;
  /** One whole sync: the run orchestrator. */
  runSync: () => Promise<SyncRunResult>;
  /** The recorded secret backend, reported in the status file. */
  secretBackend: () => BackendName | null;
  tickMs?: number;
  log?: (line: string) => void;
};

export type Worker = {
  /** Stops ticking. Resolves once a run in progress has finished and been recorded. */
  stop(): Promise<void>;
};

type Complete = Extract<SyncRunResult, { status: 'complete' }>;
/** A finished run, or the error it threw. */
type Outcome = { run: SyncRunResult; error?: undefined } | { run?: undefined; error: unknown };

function readSettings(path: string): Record<string, string> {
  try {
    return parseSecrets(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * How a run went, for the schedule. A failed categorize stage is not a
 * failed attempt: only the X side decides when to retry.
 */
function classify(run: Complete | undefined, error: unknown): { result: AttemptResult; runId: number | null; message: string | null } {
  if (run === undefined) return { result: 'failed', runId: null, message: errorText(error).slice(0, MESSAGE_MAX_CHARS) };
  if (run.auth.status !== 'ok') return { result: run.auth.status, runId: run.runId, message: run.auth.message };
  if (run.xOk) return { result: 'ok', runId: run.runId, message: null };
  const failed = run.stages.filter((stage) => stage.stage.startsWith('x_') && stage.outcome === 'failed');
  const message = failed.map((stage) => `${stage.stage}: ${stage.message}`).join('; ').slice(0, MESSAGE_MAX_CHARS);
  return { result: 'failed', runId: run.runId, message: message || null };
}

/**
 * The background sync worker. Every tick, also while a run is in progress,
 * it writes its heartbeat to the worker status file, reads the schedule's
 * state, settings, X connection and any sync request, and asks the
 * scheduler whether to start a run. A run is never awaited by the tick, so
 * a long backfill does not stop the heartbeat; and while one is in progress,
 * here or in another command, no second run starts and a request waits.
 *
 * After a run it records the attempt for the schedule. When X rejected the
 * session it marks the connection it ran with as rejected, which pauses the
 * schedule; when X accepted it, it clears any rejection of that connection
 * and fills in the handle.
 */
export function startWorker(options: WorkerOptions): Worker {
  const { files } = options;
  const log = options.log ?? (() => {});
  let inFlight: Promise<void> | null = null;
  let lastBusyAt: Date | null = null;
  let stopped = false;

  function record(trigger: LastAttempt['trigger'], generation: string | null, startedAt: Date, outcome: Outcome): void {
    if (outcome.run?.status === 'locked') {
      log(`another sync (pid ${outcome.run.pid}) started first; nothing was run`);
      return;
    }
    const run = outcome.run;
    const finishedAt = new Date();
    const { result, runId, message } = classify(run, outcome.error);
    const failures = readSchedulerState(files.schedulerState).consecutiveFailures;
    writeSchedulerState(files.schedulerState, {
      lastAttempt: { trigger, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), result, runId, message },
      consecutiveFailures: result === 'failed' || result === 'transient' ? failures + 1 : 0,
    });
    log(`sync${runId === null ? '' : ` run ${runId}`} finished: ${result}${message ? ` (${message})` : ''}`);

    // Only the connection the run used: after a reconnect, a stale result changes nothing.
    const connection = readConnection(files.xConnection);
    if (generation === null || connection === null || connection.connectedAt !== generation) return;
    if (result === 'rejected') {
      writeConnection(files.xConnection, {
        ...connection,
        rejection: { generation, at: finishedAt.toISOString(), message },
      });
    } else if (run?.auth.status === 'ok') {
      const handle = run.auth.handle ?? connection.handle;
      if (connection.rejection || handle !== connection.handle) {
        writeConnection(files.xConnection, { handle, connectedAt: connection.connectedAt });
      }
    }
  }

  function start(trigger: LastAttempt['trigger'], generation: string | null, startedAt: Date): void {
    log(`starting a ${trigger === 'request' ? 'requested' : 'scheduled'} sync`);
    inFlight = Promise.resolve()
      .then(options.runSync)
      .then(
        (run): Outcome => ({ run }),
        (error: unknown): Outcome => ({ error }),
      )
      .then((outcome) => {
        record(trigger, generation, startedAt, outcome);
        return true;
      })
      .catch((error: unknown) => {
        log(`the sync could not be recorded: ${errorText(error)}`);
        return false;
      })
      .then((recorded) => {
        inFlight = null;
        // Tick again soon, so a request that waited behind this run starts and
        // the status shows the result. Deferred to the event loop, never
        // straight from here, so a state that keeps asking for a run cannot
        // starve the timers and signal handlers. After a failed record, the
        // regular tick decides.
        if (recorded) setImmediate(tick);
      });
  }

  function tick(): void {
    if (stopped) return;
    try {
      const now = new Date();
      const running = inFlight !== null || lockHolder(files.lock) !== null;
      if (running) lastBusyAt = now;
      const scheduler = readSchedulerState(files.schedulerState);
      const connection = readConnection(files.xConnection);
      const decision = decide({
        now,
        intervalHours: intervalHours(readSettings(files.settings)),
        scheduler,
        connection,
        request: readSyncRequest(files.syncRequest),
        running,
        lastBusyAt,
      });
      if (decision.dropRequest) {
        removeSyncRequest(files.syncRequest);
        log('dropped a sync request too old to run');
      }
      if (decision.run !== null) {
        if (decision.run === 'request') removeSyncRequest(files.syncRequest);
        start(decision.run, connection?.connectedAt ?? null, now);
      }
      const busy = running || decision.run !== null;
      writeWorkerStatus(files.workerStatus, {
        pid: process.pid,
        heartbeatAt: now.toISOString(),
        state: busy ? 'running' : 'idle',
        schedule: decision.schedule,
        nextRunAt: busy ? null : (decision.nextRunAt?.toISOString() ?? null),
        lastAttempt: scheduler.lastAttempt,
        secretBackend: options.secretBackend(),
      });
    } catch (error) {
      log(`tick failed: ${errorText(error)}`);
    }
  }

  const timer = setInterval(tick, options.tickMs ?? SCHEDULE.tickMs);
  tick();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      return inFlight ?? Promise.resolve();
    },
  };
}
