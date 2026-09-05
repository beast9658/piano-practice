import { useEffect, useRef } from 'react'
import { pianoInputBus } from './input/PianoInputBus'
import { computerKeyboardPitchByKey } from './computerKeyboardLayout'

const computerKeyboardVelocity = 100

export function useComputerKeyboard(
  enabled: boolean,
) {
  const pressedKeysRef = useRef(new Map<string, number>())

  useEffect(() => {
    if (!enabled) return
    const pressedKeys = pressedKeysRef.current

    const releaseAll = () => {
      if (pressedKeys.size === 0) return
      for (const pitch of pressedKeys.values()) {
        pianoInputBus.emit({
          type: 'noteOff', sourceId: 'computer-keyboard-61', channel: 0,
          pitch, velocity: 0, timestamp: performance.now(),
        })
      }
      pressedKeys.clear()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return
      const pitch = computerKeyboardPitchByKey.get(event.key)
      if (pitch === undefined || pressedKeys.has(event.code)) return
      event.preventDefault()
      pressedKeys.set(event.code, pitch)
      pianoInputBus.emit({
        type: 'noteOn', sourceId: 'computer-keyboard-61', channel: 0,
        pitch, velocity: computerKeyboardVelocity, timestamp: performance.now(),
      })
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      const pitch = pressedKeys.get(event.code)
      if (pitch === undefined) return
      event.preventDefault()
      pressedKeys.delete(event.code)
      pianoInputBus.emit({
        type: 'noteOff', sourceId: 'computer-keyboard-61', channel: 0,
        pitch, velocity: 0, timestamp: performance.now(),
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [enabled])
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}
