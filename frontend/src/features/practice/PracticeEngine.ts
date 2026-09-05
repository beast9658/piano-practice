import type { PracticeMode, ScoreNote } from '../../shared/types/domain'

const ONSET_GROUP_TOLERANCE_BEATS = 0.08
const MAX_EARLY_WINDOW_MS = 500

export type PracticeTarget = {
  beat: number
  pitches: Set<number>
}

type PracticeFrame = {
  beat: number
  target: PracticeTarget | null
}

type TargetGroup = {
  beat: number
  notes: ScoreNote[]
  pitches: Set<number>
  fulfilled: Set<number>
  dueAtMs: number | null
  earlyWindowMs: number
}

export type PracticeTimingStatus = 'early' | 'on-time' | 'delayed' | 'unavailable'

export type PracticeJudgement = {
  kind: 'correct' | 'extra' | 'duplicate' | 'unscored'
  targetNoteId: string | null
  targetBeat: number | null
  expectedPitches: number[]
  expectedHand: 'left' | 'right' | null
  actualPitch: number
  timingStatus: PracticeTimingStatus
  timingOffsetMs: number | null
  waitDelayMs: number | null
}

export class PracticeEngine {
  private groups: TargetGroup[] = []
  private nextGroupIndex = 0

  configure(notes: ScoreNote[], mode: PracticeMode) {
    this.groups = buildTargetGroups(selectUserNotes(notes, mode))
    this.reset(0)
  }

  reset(beat: number) {
    this.nextGroupIndex = lowerBoundGroup(this.groups, beat)
    for (const target of this.groups) {
      target.fulfilled.clear()
      target.dueAtMs = null
    }
  }

  advance(proposedBeat: number, nowMs: number, bpm: number): PracticeFrame {
    const target = this.groups[this.nextGroupIndex]
    if (!target) return { beat: proposedBeat, target: null }

    if (proposedBeat < target.beat) {
      target.earlyWindowMs = this.nextGroupIndex === 0
        ? MAX_EARLY_WINDOW_MS
        : Math.min(
            MAX_EARLY_WINDOW_MS,
            (target.beat - this.groups[this.nextGroupIndex - 1].beat) * 60_000 / bpm / 2,
          )
      target.dueAtMs = nowMs + Math.max(0, target.beat - proposedBeat) * 60_000 / bpm
      return { beat: proposedBeat, target: null }
    }
    if (target.dueAtMs === null) target.dueAtMs = nowMs

    if (target.fulfilled.size === target.pitches.size) {
      this.nextGroupIndex += 1
      return this.advance(proposedBeat, nowMs, bpm)
    }

    return {
      beat: target.beat,
      target: this.publicTarget(target),
    }
  }

  receiveNoteOn(pitch: number, timestampMs: number): PracticeJudgement {
    const target = this.groups[this.nextGroupIndex]
    if (!target || target.dueAtMs === null) return unscoredJudgement(pitch)

    const timingOffsetMs = timestampMs - target.dueAtMs
    if (timingOffsetMs < -target.earlyWindowMs) return unscoredJudgement(pitch)

    const expectedPitches = [...target.pitches].sort((a, b) => a - b)
    const expectedNotes = target.notes.filter((note) => note.pitch === pitch)
    const timingStatus = timingStatusFor(timingOffsetMs)
    const timing = {
      timingStatus,
      timingOffsetMs,
      waitDelayMs: Math.max(0, timingOffsetMs),
    }
    if (expectedNotes.length === 0) {
      return {
        kind: 'extra',
        targetNoteId: null,
        targetBeat: target.beat,
        expectedPitches,
        expectedHand: responsibleHand(target.notes),
        actualPitch: pitch,
        ...timing,
      }
    }
    if (target.fulfilled.has(pitch)) {
      return {
        kind: 'duplicate',
        targetNoteId: expectedNotes.length === 1 ? expectedNotes[0].id : null,
        targetBeat: target.beat,
        expectedPitches,
        expectedHand: responsibleHand(expectedNotes),
        actualPitch: pitch,
        ...timing,
      }
    }

    target.fulfilled.add(pitch)
    return {
      kind: 'correct',
      targetNoteId: expectedNotes.length === 1 ? expectedNotes[0].id : null,
      targetBeat: target.beat,
      expectedPitches,
      expectedHand: responsibleHand(expectedNotes),
      actualPitch: pitch,
      ...timing,
    }
  }

  private publicTarget(target: TargetGroup): PracticeTarget {
    return {
      beat: target.beat,
      pitches: new Set([...target.pitches].filter((pitch) => !target.fulfilled.has(pitch))),
    }
  }
}

export function selectAutoPlayNotes(notes: ScoreNote[], mode: PracticeMode) {
  if (mode === 'listen') return notes
  if (mode === 'right-hand') return notes.filter((note) => note.hand === 'left')
  if (mode === 'left-hand') return notes.filter((note) => note.hand === 'right')
  return []
}

export function selectUserNotes(notes: ScoreNote[], mode: PracticeMode) {
  if (mode === 'right-hand') return notes.filter((note) => note.hand === 'right')
  if (mode === 'left-hand') return notes.filter((note) => note.hand === 'left')
  if (mode === 'both-hands') return notes
  return []
}

function buildTargetGroups(targets: ScoreNote[]) {
  const groups: TargetGroup[] = []
  for (const note of targets.toSorted((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch)) {
    const previous = groups.at(-1)
    if (!previous || note.startBeat - previous.beat > ONSET_GROUP_TOLERANCE_BEATS) {
      groups.push({
        beat: note.startBeat,
        notes: [note],
        pitches: new Set([note.pitch]),
        fulfilled: new Set(),
        dueAtMs: null,
        earlyWindowMs: MAX_EARLY_WINDOW_MS,
      })
      continue
    }
    previous.notes.push(note)
    previous.pitches.add(note.pitch)
  }
  return groups
}

function lowerBoundGroup(groups: TargetGroup[], targetBeat: number) {
  let low = 0
  let high = groups.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (groups[middle].beat < targetBeat) low = middle + 1
    else high = middle
  }
  return low
}

function timingStatusFor(offsetMs: number): PracticeTimingStatus {
  if (offsetMs < -80) return 'early'
  if (offsetMs > 80) return 'delayed'
  return 'on-time'
}

function responsibleHand(notes: ScoreNote[]): 'left' | 'right' | null {
  const hands = new Set(notes.map((note) => note.hand).filter((hand) => hand === 'left' || hand === 'right'))
  return hands.size === 1 ? [...hands][0] as 'left' | 'right' : null
}

function unscoredJudgement(pitch: number): PracticeJudgement {
  return {
    kind: 'unscored',
    targetNoteId: null,
    targetBeat: null,
    expectedPitches: [],
    expectedHand: null,
    actualPitch: pitch,
    timingStatus: 'unavailable',
    timingOffsetMs: null,
    waitDelayMs: null,
  }
}
