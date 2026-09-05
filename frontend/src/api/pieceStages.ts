import { requestRpc } from './http'

export type PieceStage = {
  id: string
  startMeasure: number
  endMeasure: number
  label: string
  reason: string
}

export type PieceStagePlan = {
  id: string
  arrangementId: string
  name: string
  segmentationPrompt: string
  model: string
  generation: number
  isActive: boolean
  analyzedAt: string
  stages: PieceStage[]
}

export const pieceStagesApi = {
  get(pieceId: string) {
    return requestRpc<PieceStagePlan | null>('music_get_stage_plan', { piece_id: pieceId })
  },
  list(pieceId: string) {
    return requestRpc<PieceStagePlan[]>('music_list_stage_plans', { piece_id: pieceId })
  },
  analyze(pieceId: string, planId?: string, name?: string, prompt?: string) {
    return requestRpc<PieceStagePlan>('music_analyze_stages', {
      piece_id: pieceId,
      plan_id: planId,
      name,
      prompt,
    })
  },
  rename(pieceId: string, planId: string, name: string) {
    return requestRpc<PieceStagePlan>('music_rename_stage_plan', {
      piece_id: pieceId,
      plan_id: planId,
      name,
    })
  },
  activate(pieceId: string, planId: string) {
    return requestRpc<PieceStagePlan>('music_activate_stage_plan', {
      piece_id: pieceId,
      plan_id: planId,
    })
  },
  delete(pieceId: string, planId: string) {
    return requestRpc<{ deleted: boolean }>('music_delete_stage_plan', {
      piece_id: pieceId,
      plan_id: planId,
    })
  },
}
