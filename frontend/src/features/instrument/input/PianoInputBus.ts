import type { PianoInputEvent } from './types'

type Listener = (event: PianoInputEvent) => void

class PianoInputBus {
  private listeners = new Set<Listener>()

  emit(event: PianoInputEvent) {
    for (const listener of this.listeners) listener(event)
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const pianoInputBus = new PianoInputBus()
