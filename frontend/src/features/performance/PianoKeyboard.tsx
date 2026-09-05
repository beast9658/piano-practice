import { memo, useImperativeHandle, useState } from 'react'
import type { Ref } from 'react'
import { cn } from '@/lib/utils'
import { blackKeyLengthRatio, visibleWhiteKeyLengthRatio } from './pianoGeometry'
import type { PianoKeyLayout } from './pianoGeometry'
import type { PianoKeyState } from './pianoState'

export type PianoKeyboardHandle = {
  applyKeyStates: (changes: ReadonlyMap<number, PianoKeyState>) => void
  reset: () => void
}

export const PianoKeyboard = memo(function PianoKeyboard({
  ref,
  keyLabels,
  keys,
  width,
}: {
  ref?: Ref<PianoKeyboardHandle>
  keyLabels?: ReadonlyMap<number, string>
  keys: readonly PianoKeyLayout[]
  width: number
}) {
  const [keyStates, setKeyStates] = useState<ReadonlyMap<number, PianoKeyState>>(() => new Map())
  const whiteKeys = keys.filter((key) => !key.isBlack)
  const blackKeys = keys.filter((key) => key.isBlack)

  useImperativeHandle(
    ref,
    () => ({
      applyKeyStates(changes) {
        setKeyStates((currentStates) => applyChanges(currentStates, changes))
      },
      reset() {
        setKeyStates(new Map())
      },
    }),
    [],
  )

  return (
    <div
      className="relative isolate w-full shrink-0 overflow-hidden border-t border-border bg-card [contain:paint]"
      style={{
        aspectRatio: `${whiteKeys.length} / ${visibleWhiteKeyLengthRatio}`,
        width: `${width}px`,
      }}
    >
      {whiteKeys.map((key) => (
        <PianoKey
          key={key.pitch}
          geometry={key}
          state={keyStates.get(key.pitch) ?? 'idle'}
          label={keyLabels?.get(key.pitch)}
        />
      ))}
      {blackKeys.map((key) => (
        <PianoKey
          key={key.pitch}
          geometry={key}
          state={keyStates.get(key.pitch) ?? 'idle'}
          label={keyLabels?.get(key.pitch)}
        />
      ))}
    </div>
  )
})

function applyChanges(
  currentStates: ReadonlyMap<number, PianoKeyState>,
  changes: ReadonlyMap<number, PianoKeyState>,
) {
  let nextStates: Map<number, PianoKeyState> | null = null
  for (const [pitch, state] of changes) {
    const currentState = currentStates.get(pitch) ?? 'idle'
    if (currentState === state) continue
    nextStates ??= new Map(currentStates)
    if (state === 'idle') nextStates.delete(pitch)
    else nextStates.set(pitch, state)
  }
  return nextStates ?? currentStates
}

const PianoKey = memo(function PianoKey({
  geometry,
  state,
  label,
}: {
  geometry: PianoKeyLayout
  state: PianoKeyState
  label?: string
}) {
  const { isBlack, leftPx, widthPx } = geometry
  return (
    <div
      className={cn(
        'absolute',
        isBlack
          ? 'piano-key-black top-0 z-10'
          : 'piano-key-white inset-y-0',
      )}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        height: isBlack ? `${blackKeyLengthRatio * 100}%` : '100%',
        backgroundColor: pianoKeyStateColor(state, isBlack)
          ?? (isBlack ? 'var(--piano-key-black)' : 'var(--piano-key-white)'),
      }}
    >
      {state === 'guided' ? (
        <span
          className={cn(
            'pointer-events-none absolute left-1/2 size-[clamp(4px,0.55vw,8px)] -translate-x-1/2 rounded-full bg-primary',
            label
              ? isBlack
                ? 'bottom-[35%]'
                : 'bottom-[25%]'
              : isBlack
                ? 'bottom-[18%]'
                : 'bottom-[14%]',
          )}
        />
      ) : null}
      {label ? (
        <span
          className={cn(
            'pointer-events-none absolute bottom-[8%] left-1/2 -translate-x-1/2 text-[clamp(7px,0.65vw,10px)] font-bold leading-none',
          )}
          style={{
            color: isBlack
              ? 'var(--piano-key-black-label)'
              : 'var(--piano-key-white-label)',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  )
})

function pianoKeyStateColor(state: PianoKeyState, isBlack: boolean) {
  if (state === 'valid') {
    return isBlack
      ? 'var(--piano-key-valid-black)'
      : 'var(--piano-key-valid-white)'
  }
  if (state === 'invalid') {
    return isBlack
      ? 'var(--piano-key-invalid-black)'
      : 'var(--piano-key-invalid-white)'
  }
  return undefined
}
