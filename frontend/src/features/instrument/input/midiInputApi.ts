import type { PianoInputEvent } from './types'

let accessPromise: Promise<MIDIAccess | null> | null = null
let activeDeviceId: string | null = null
const eventListeners = new Set<(event: PianoInputEvent) => void>()

function requestMidiAccess(): Promise<MIDIAccess | null> {
  if (accessPromise) return accessPromise
  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
    accessPromise = Promise.resolve(null)
    return accessPromise
  }
  accessPromise = navigator.requestMIDIAccess({ sysex: false }).catch(() => null)
  return accessPromise
}

function midiMessageToEvent(input: MIDIInput, message: MIDIMessageEvent): PianoInputEvent | null {
  const data = message.data
  if (!data || data.length < 3) return null
  const status = data[0]
  const kind = status & 0xf0
  const channel = status & 0x0f
  const timestamp = performance.now()
  if (kind === 0x90 && data[2] > 0) {
    return {
      type: 'noteOn',
      sourceId: input.id,
      channel,
      pitch: data[1],
      velocity: data[2],
      timestamp,
    }
  }
  if ((kind === 0x80 || kind === 0x90) && data.length >= 3) {
    return {
      type: 'noteOff',
      sourceId: input.id,
      channel,
      pitch: data[1],
      velocity: data[2],
      timestamp,
    }
  }
  if (kind === 0xb0) {
    return {
      type: 'controlChange',
      sourceId: input.id,
      channel,
      controller: data[1],
      value: data[2],
      timestamp,
    }
  }
  return null
}

async function attachToActiveInput() {
  const access = await requestMidiAccess()
  if (!access || activeDeviceId === null) return
  const input = [...access.inputs.values()].find((device) => device.id === activeDeviceId)
  if (!input) return
  input.onmidimessage = (message) => {
    if (input.id !== activeDeviceId) return
    const event = midiMessageToEvent(input, message)
    if (!event) return
    for (const listener of eventListeners) listener(event)
  }
}

async function clearActiveInput() {
  const access = await requestMidiAccess()
  if (!access) return
  for (const input of access.inputs.values()) {
    input.onmidimessage = null
  }
}

export async function listMidiInputs() {
  const access = await requestMidiAccess()
  if (!access) return []
  return [...access.inputs.values()].map((input) => ({
    id: input.id,
    name: input.name || 'MIDI 键盘',
  }))
}

export async function connectMidiInput(deviceId: string) {
  const access = await requestMidiAccess()
  if (!access) {
    throw new Error('浏览器不支持 Web MIDI，或未授权 MIDI 设备访问')
  }
  const input = [...access.inputs.values()].find((device) => device.id === deviceId)
  if (!input) {
    throw new Error('MIDI 输入设备已断开')
  }
  await clearActiveInput()
  activeDeviceId = deviceId
  await attachToActiveInput()
}

export async function disconnectMidiInput() {
  activeDeviceId = null
  await clearActiveInput()
}

export async function listenToMidiInput(listener: (event: PianoInputEvent) => void) {
  eventListeners.add(listener)
  const access = await requestMidiAccess()
  if (access && activeDeviceId === null) {
    // Pre-wire input handlers so a later connect starts receiving immediately.
    for (const input of access.inputs.values()) {
      input.onmidimessage = (message) => {
        if (input.id !== activeDeviceId) return
        const event = midiMessageToEvent(input, message)
        if (!event) return
        for (const current of eventListeners) current(event)
      }
    }
  } else if (access && activeDeviceId !== null) {
    await attachToActiveInput()
  }
  return () => {
    eventListeners.delete(listener)
  }
}
