import type { FingeringPatch } from '../shared/types/domain'
import type {
  FingerNumber,
  FingeringLabel,
  PracticeMode,
} from '../shared/types/domain'
import { requestRpc } from './http'

export type FingeringCandidate = {
  id: string
  pieceId: string
  planId: string
  stageId: string
  arrangementId: string
  scoreFingerprint: string
  name: string
  strategy: string
  startMeasure: number
  endMeasure: number
  startBeat: number
  endBeat: number
  features: {
    thumbCrossings: number
    positionShifts: number
    repeatedNoteChanges: number
    maxSpan: number
    blackKeyThumbs: number
  }
  createdAt: string
  assignments: Array<{
    noteId: string
    hand: 'left' | 'right'
    finger: FingerNumber
    label: FingeringLabel
  }>
}

export type FingeringAdherence = 'confirmed' | 'partial' | 'not-followed' | 'unknown'

export type FingeringTrialPass = {
  id: string
  candidateId: string
  position: number
  status: 'pending' | 'running' | 'completed'
  practiceSessionId: string | null
  adherence: FingeringAdherence
  comfortRating: number | null
  startedAt: string | null
  completedAt: string | null
  summary: {
    noteCount: number
    accuracy: number | null
    averageWaitDelayMs: number | null
  } | null
}

export type FingeringTrial = {
  id: string
  pieceId: string
  planId: string
  stageId: string
  arrangementId: string
  scoreFingerprint: string
  protocol: 'A-B-A'
  mode: Exclude<PracticeMode, 'listen' | 'free'>
  bpm: number
  startMeasure: number
  endMeasure: number
  startBeat: number
  endBeat: number
  candidateIds: [string, string]
  passes: FingeringTrialPass[]
  status: 'running' | 'completed' | 'cancelled'
  createdAt: string
  completedAt: string | null
}

export const fingeringApi = {
  generate(pieceId: string, planId: string, stageId: string) {
    return requestRpc<FingeringPatch>('music_generate_fingering', {
      piece_id: pieceId,
      plan_id: planId,
      stage_id: stageId,
    })
  },
  generateCandidates(pieceId: string, planId: string, stageId: string, limit = 3) {
    return requestRpc<FingeringCandidate[]>('fingering_generate_candidates', {
      piece_id: pieceId,
      plan_id: planId,
      stage_id: stageId,
      limit,
    })
  },
  listCandidates(pieceId: string, stageId?: string) {
    return requestRpc<FingeringCandidate[]>('fingering_list_candidates', {
      piece_id: pieceId,
      stage_id: stageId,
    })
  },
  createTrial(
    pieceId: string,
    candidateIds: [string, string],
    mode: Exclude<PracticeMode, 'listen' | 'free'>,
    bpm: number,
  ) {
    return requestRpc<FingeringTrial>('fingering_create_trial', {
      piece_id: pieceId,
      candidate_ids: candidateIds,
      mode,
      bpm,
    })
  },
  listTrials(pieceId: string) {
    return requestRpc<FingeringTrial[]>('fingering_list_trials', { piece_id: pieceId })
  },
  startTrialPass(trialId: string, passId: string) {
    return requestRpc<FingeringTrial>('fingering_start_trial_pass', {
      trial_id: trialId,
      pass_id: passId,
    })
  },
  completeTrialPass(
    trialId: string,
    passId: string,
    practiceSessionId: string,
    adherence: FingeringAdherence,
    comfortRating: number | null,
  ) {
    return requestRpc<FingeringTrial>('fingering_complete_trial_pass', {
      trial_id: trialId,
      pass_id: passId,
      practice_session_id: practiceSessionId,
      adherence,
      comfort_rating: comfortRating,
    })
  },
  cancelTrial(trialId: string) {
    return requestRpc<FingeringTrial>('fingering_cancel_trial', { trial_id: trialId })
  },
  adoptCandidate(pieceId: string, candidateId: string) {
    return requestRpc<FingeringCandidate>('fingering_adopt_candidate', {
      piece_id: pieceId,
      candidate_id: candidateId,
    })
  },
}
