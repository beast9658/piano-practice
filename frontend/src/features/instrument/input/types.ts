export type PianoInputEvent =
  | { type: 'noteOn'; sourceId: string; channel: number; pitch: number; rawPitch?: number; velocity: number; timestamp: number }
  | { type: 'noteOff'; sourceId: string; channel: number; pitch: number; rawPitch?: number; velocity: number; timestamp: number }
  | { type: 'controlChange'; sourceId: string; channel: number; controller: number; value: number; timestamp: number }

export type PianoInputDeviceDescriptor = {
  id: string
  kind: 'computer-keyboard' | 'midi-keyboard'
  name: string
  keyCount: number | null
  lowestPitch: number | null
  highestPitch: number | null
  pitchOffset: number
  supportsVelocity: boolean
  supportsSustain: boolean
  calibrated: boolean
}
