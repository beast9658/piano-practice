import type { PianoInputDeviceDescriptor, PianoInputEvent } from './types'

const canonicalStartPitchByKeyCount = new Map([
  [25, 48],
  [32, 41],
  [37, 48],
  [49, 36],
  [61, 36],
  [76, 28],
  [88, 21],
])

export type CalibratedPitchRange = {
  lowestPitch: number
  highestPitch: number
  pitchOffset: number
}

export function normalizeCalibratedRange(
  lowestPitch: number,
  highestPitch: number,
  savedPitchOffset?: number,
): CalibratedPitchRange {
  if (savedPitchOffset !== undefined) {
    return { lowestPitch, highestPitch, pitchOffset: savedPitchOffset }
  }

  const keyCount = highestPitch - lowestPitch + 1
  const legacyOffset = lowestPitch === 0
    ? (canonicalStartPitchByKeyCount.get(keyCount) ?? 0)
    : 0

  return {
    lowestPitch: lowestPitch + legacyOffset,
    highestPitch: highestPitch + legacyOffset,
    pitchOffset: legacyOffset,
  }
}

export function normalizeMidiInputEvent(
  event: PianoInputEvent,
  device: PianoInputDeviceDescriptor | undefined,
): PianoInputEvent {
  if (event.type === 'controlChange') return event

  const pitchOffset = device?.pitchOffset ?? 0
  return {
    ...event,
    rawPitch: event.pitch,
    pitch: Math.max(0, Math.min(127, event.pitch + pitchOffset)),
  }
}
