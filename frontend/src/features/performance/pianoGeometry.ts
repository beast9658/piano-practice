export type PianoKeyGeometry = {
  pitch: number
  isBlack: boolean
  leftPercent: number
  widthPercent: number
}

export type PianoKeyLayout = PianoKeyGeometry & {
  leftPx: number
  widthPx: number
}

export const keyboardStartPitch = 36
export const keyboardKeyCount = 61
export const keyboardEndPitch = keyboardStartPitch + keyboardKeyCount - 1
export const visibleWhiteKeyLengthRatio = 3.6
export const blackKeyLengthRatio = 0.64

const blackPitchClasses = new Set([1, 3, 6, 8, 10])
const blackKeyWidthRatio = 0.58

export const pianoKeys = buildPianoKeyGeometry(keyboardStartPitch, keyboardEndPitch)
export const whitePianoKeys = pianoKeys.filter((key) => !key.isBlack)
export const blackPianoKeys = pianoKeys.filter((key) => key.isBlack)

export function keyGeometryForPitch(pitch: number) {
  if (pitch < keyboardStartPitch || pitch > keyboardEndPitch) return null
  return pianoKeys[pitch - keyboardStartPitch]
}

export function buildPitchGuides(pitchClass: number) {
  return pianoKeys.filter((key) => key.pitch % 12 === pitchClass && !key.isBlack)
}

export function buildPianoKeyGeometry(startPitch: number, endPitch: number): PianoKeyGeometry[] {
  const keys: PianoKeyGeometry[] = []
  const whitePitchToIndex = new Map<number, number>()
  let whiteKeyCount = 0

  for (let pitch = startPitch; pitch <= endPitch; pitch += 1) {
    if (!isBlackPitch(pitch)) {
      whitePitchToIndex.set(pitch, whiteKeyCount)
      whiteKeyCount += 1
    }
  }

  const whiteWidth = 100 / whiteKeyCount
  const blackWidth = whiteWidth * blackKeyWidthRatio

  for (let pitch = startPitch; pitch <= endPitch; pitch += 1) {
    const isBlack = isBlackPitch(pitch)
    if (!isBlack) {
      const whiteIndex = whitePitchToIndex.get(pitch) ?? 0
      keys.push({
        pitch,
        isBlack: false,
        leftPercent: whiteIndex * whiteWidth,
        widthPercent: whiteWidth,
      })
      continue
    }

    const previousWhiteIndex = whitePitchToIndex.get(pitch - 1)
    if (previousWhiteIndex === undefined) continue

    keys.push({
      pitch,
      isBlack: true,
      leftPercent: (previousWhiteIndex + 1) * whiteWidth - blackWidth / 2,
      widthPercent: blackWidth,
    })
  }

  return keys
}

export function layoutPianoKeys(
  keys: readonly PianoKeyGeometry[],
  width: number,
): PianoKeyLayout[] {
  return keys.map((key) => ({
    ...key,
    leftPx: (key.leftPercent / 100) * width,
    widthPx: (key.widthPercent / 100) * width,
  }))
}

function isBlackPitch(pitch: number) {
  return blackPitchClasses.has(pitch % 12)
}
