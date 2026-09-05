import type { PracticeSessionRecord } from '../features/practice/session/types'
import { requestRpc } from './http'

export type PracticeSessionListItem = {
  id: string
  pieceId: string
  startedAt: string
  endedAt: string
  initialMode: string
  initialBpm: number
  scope: PracticeSessionRecord['scope']
  startBeat: number | null
  endBeat: number | null
  summary: PracticeSessionRecord['summary']
}

export const practiceApi = {
  saveSession(session: PracticeSessionRecord) {
    return requestRpc<{ saved: boolean; sessionId: string }>('practice_save_session', { session })
  },
  listSessions(pieceId: string, limit = 20) {
    return requestRpc<PracticeSessionListItem[]>('practice_list_sessions', {
      piece_id: pieceId,
      limit,
    })
  },
}
