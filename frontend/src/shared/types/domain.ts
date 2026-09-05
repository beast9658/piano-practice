export type PracticeMode = 'listen' | 'free' | 'right-hand' | 'left-hand' | 'both-hands'
export type FingerNumber = 1 | 2 | 3 | 4 | 5
export type FingeringLabel = `L${FingerNumber}` | `R${FingerNumber}`

export type Piece = {
  id: string
  title: string
  composer: string
  level: string
  durationSeconds: number
  keySignature: string
  bpm: number
  progress: number
  lastPracticedAt: string
  mistakeHotspots: number[]
  sourcePath?: string | null
  arrangementCount?: number
  noteCount?: number
}

export type MidiScanReport = {
  watchedPaths: string[]
  discoveredFiles: number
  registeredFiles: number
  updatedFiles: number
}

export type ScoreNote = {
  id: string
  pitch: number
  startBeat: number
  durationBeats: number
  velocity: number
  track: number
  channel: number
  hand: 'left' | 'right' | 'unknown'
  handConfidence: number
  fingering: FingeringLabel | null
  fingeringSource: 'agent' | 'manual' | 'imported' | null
  fingeringConfidence: number | null
}

export type PieceScore = {
  pieceId: string
  arrangementId: string
  scoreFingerprint: string
  title: string
  tempoBpm: number
  timeSignature: string
  totalBeats: number
  notes: ScoreNote[]
  handAnalysisVersion: string | null
  handConfidence: number
}

export type AgentSuggestion = {
  id: string
  title: string
  detail: string
  evidence: string
}

export type FingeringPatch = {
  planId: string
  stageId: string
  arrangementId: string
  startMeasure: number
  endMeasure: number
  updatedCount: number
  warnings: string[]
  annotations: Array<{
    noteId: string
    hand: 'left' | 'right'
    finger: FingerNumber
    label: FingeringLabel
    confidence: number
  }>
}
