import type { PianoInputEvent } from '../../instrument/input/types'
import type { PracticeMode } from '../../../shared/types/domain'
import type { PracticeJudgement } from '../PracticeEngine'

export type RecordedPracticeEvent = PianoInputEvent & {
  sequence: number
  scoreBeat: number | null
  bpm: number
  mode: PracticeMode
  isPlaying: boolean
}

export type NoteAttempt = PracticeJudgement & {
  eventSequence: number
  velocity: number
}

export type PracticeSessionSummary = {
  inputCount: number
  noteCount: number
  correctCount: number
  wrongCount: number
  earlyCount: number
  delayedCount: number
  averageWaitDelayMs: number | null
  pedalChangeCount: number
  averageVelocity: number | null
  accuracy: number | null
}

export type PracticeSessionSnapshot = PracticeSessionSummary & {
  recording: boolean
  pedalDown: boolean
  startedAt: string | null
  elapsedMs: number
}

export type PracticeSessionRecord = {
  id: string
  pieceId: string
  startedAt: string
  endedAt: string
  initialMode: PracticeMode
  initialBpm: number
  scope: PracticeScopeSnapshot
  events: RecordedPracticeEvent[]
  attempts: NoteAttempt[]
  summary: PracticeSessionSummary
}

export type PracticeSessionContext = {
  id: string
  pieceId: string
  startedAt: string
  startedAtMs: number
  initialMode: PracticeMode
  initialBpm: number
  scope: PracticeScopeSnapshot
}

export type PracticeScopeSnapshot = {
  arrangementId: string
  scoreFingerprint: string
  startBeat: number
  endBeat: number
  startMeasure: number
  endMeasure: number
}

export type PracticeTransportSnapshot = {
  beat: number
  bpm: number
  mode: PracticeMode
  isPlaying: boolean
}
