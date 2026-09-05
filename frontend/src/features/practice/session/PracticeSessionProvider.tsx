import { createContext, useContext, type ReactNode } from 'react'
import type { PieceScore } from '../../../shared/types/domain'
import { usePracticeSession } from './usePracticeSession'

type PracticeSessionState = ReturnType<typeof usePracticeSession>

const PracticeSessionContext = createContext<PracticeSessionState | null>(null)

export function PracticeSessionProvider({
  score,
  children,
}: {
  score: PieceScore | undefined
  children: ReactNode
}) {
  const state = usePracticeSession(score)
  return (
    <PracticeSessionContext.Provider value={state}>
      {children}
    </PracticeSessionContext.Provider>
  )
}

export function usePracticeSessionStatus() {
  const state = useContext(PracticeSessionContext)
  if (!state) throw new Error('PracticeSessionStatus requires PracticeSessionProvider')
  return state
}
