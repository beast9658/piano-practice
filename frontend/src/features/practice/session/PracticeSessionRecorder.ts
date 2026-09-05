import type { PianoInputEvent } from '../../instrument/input/types'
import type { PracticeJudgement } from '../PracticeEngine'
import type {
  NoteAttempt,
  PracticeSessionContext,
  PracticeSessionRecord,
  PracticeSessionSummary,
  PracticeSessionSnapshot,
  PracticeTransportSnapshot,
  RecordedPracticeEvent,
} from './types'

export class PracticeSessionRecorder {
  private readonly context: PracticeSessionContext
  private readonly events: RecordedPracticeEvent[] = []
  private readonly attempts: NoteAttempt[] = []
  private sequence = 0
  private pedalDown = false
  private finished = false

  constructor(context: PracticeSessionContext) {
    this.context = context
  }

  get id() {
    return this.context.id
  }

  recordEvaluation(
    event: PianoInputEvent,
    transport: PracticeTransportSnapshot,
    judgement: PracticeJudgement | null,
  ) {
    if (
      this.finished
      || !['left-hand', 'right-hand', 'both-hands'].includes(transport.mode)
    ) return
    const recorded: RecordedPracticeEvent = {
      ...event,
      sequence: this.sequence,
      scoreBeat: transport.beat,
      bpm: transport.bpm,
      mode: transport.mode,
      isPlaying: transport.isPlaying,
    }
    this.sequence += 1
    this.events.push(recorded)

    if (recorded.type === 'controlChange' && recorded.controller === 64) {
      this.pedalDown = recorded.value >= 64
    }
    if (recorded.type === 'noteOn' && judgement) {
      this.attempts.push(this.toAttempt(recorded, judgement))
    }
  }

  snapshot(nowMs = performance.now()): PracticeSessionSnapshot {
    return {
      ...summarizeSession(this.events, this.attempts),
      recording: !this.finished,
      pedalDown: this.pedalDown,
      startedAt: this.context.startedAt,
      elapsedMs: Math.max(0, nowMs - this.context.startedAtMs),
    }
  }

  checkpoint(endedAt = new Date().toISOString()): PracticeSessionRecord {
    return this.buildRecord(endedAt)
  }

  finish(endedAt = new Date().toISOString()): PracticeSessionRecord {
    this.finished = true
    return this.buildRecord(endedAt)
  }

  private toAttempt(
    event: Extract<RecordedPracticeEvent, { type: 'noteOn' }>,
    judgement: PracticeJudgement,
  ): NoteAttempt {
    return {
      ...judgement,
      eventSequence: event.sequence,
      velocity: event.velocity,
    }
  }

  private buildRecord(endedAt: string): PracticeSessionRecord {
    return {
      id: this.context.id,
      pieceId: this.context.pieceId,
      startedAt: this.context.startedAt,
      endedAt,
      initialMode: this.context.initialMode,
      initialBpm: this.context.initialBpm,
      scope: this.context.scope,
      events: [...this.events],
      attempts: [...this.attempts],
      summary: summarizeSession(this.events, this.attempts),
    }
  }
}

function summarizeSession(
  events: RecordedPracticeEvent[],
  attempts: NoteAttempt[],
): PracticeSessionSummary {
  const scored = attempts.filter((attempt) => attempt.kind !== 'unscored')
  const correctCount = scored.filter((attempt) => attempt.kind === 'correct').length
  const correctWaitDelays = scored
    .filter(
      (attempt) => attempt.kind === 'correct'
        && attempt.timingStatus === 'delayed'
        && attempt.waitDelayMs !== null,
    )
    .map((attempt) => attempt.waitDelayMs as number)
  const summary: PracticeSessionSummary = {
    inputCount: events.length,
    noteCount: attempts.length,
    correctCount,
    wrongCount: scored.length - correctCount,
    earlyCount: scored.filter((attempt) => attempt.timingStatus === 'early').length,
    delayedCount: scored.filter((attempt) => attempt.timingStatus === 'delayed').length,
    averageWaitDelayMs: correctWaitDelays.length > 0
      ? Math.round(correctWaitDelays.reduce((total, delay) => total + delay, 0) / correctWaitDelays.length)
      : null,
    pedalChangeCount: events.filter(
      (event) => event.type === 'controlChange' && event.controller === 64,
    ).length,
    averageVelocity: attempts.length > 0
      ? Math.round(attempts.reduce((total, attempt) => total + attempt.velocity, 0) / attempts.length)
      : null,
    accuracy: scored.length > 0 ? correctCount / scored.length : null,
  }
  return summary
}
