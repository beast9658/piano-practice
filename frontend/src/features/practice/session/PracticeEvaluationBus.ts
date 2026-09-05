import type { PianoInputEvent } from '../../instrument/input/types'
import type { PracticeJudgement } from '../PracticeEngine'

export type PracticeEvaluation = {
  event: PianoInputEvent
  judgement: PracticeJudgement | null
}

type Listener = (evaluation: PracticeEvaluation) => void

class PracticeEvaluationBus {
  private readonly listeners = new Set<Listener>()

  emit(evaluation: PracticeEvaluation) {
    for (const listener of this.listeners) listener(evaluation)
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const practiceEvaluationBus = new PracticeEvaluationBus()
