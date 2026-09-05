export type MeasureTiming = {
  number: number
  startBeat: number
  durationBeats: number
}

export function parseBeatsPerMeasure(timeSignature: string) {
  const [numeratorText, denominatorText] = timeSignature.split('/')
  const numerator = Number(numeratorText)
  const denominator = Number(denominatorText)

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 4
  }

  return numerator * (4 / denominator)
}

export function buildMeasureTimings(totalBeats: number, timeSignature: string) {
  const beatsPerMeasure = parseBeatsPerMeasure(timeSignature)
  const measureCount = Math.max(1, Math.ceil(totalBeats / beatsPerMeasure))

  return Array.from({ length: measureCount }, (_, index): MeasureTiming => {
    const startBeat = index * beatsPerMeasure
    return {
      number: index + 1,
      startBeat,
      durationBeats: Math.min(beatsPerMeasure, Math.max(0, totalBeats - startBeat)) || beatsPerMeasure,
    }
  })
}

export function formatPlaybackTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}
