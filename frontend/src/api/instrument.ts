type MidiChannelEvent = { channel: number }

export type MidiEvent =
  | (MidiChannelEvent & { type: 'noteOn'; note: number; velocity: number })
  | (MidiChannelEvent & { type: 'noteOff'; note: number; velocity: number })
  | (MidiChannelEvent & { type: 'controlChange'; controller: number; value: number })
  | (MidiChannelEvent & { type: 'programChange'; program: number })
  | (MidiChannelEvent & { type: 'pitchBend'; value: number })

export type AudioOutputStatus = {
  available: boolean
  backend: string
  detail: string
}

type ActiveVoice = {
  gain: GainNode
  oscillators: OscillatorNode[]
}

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
const voices = new Map<string, ActiveVoice>()
const heldBySustain = new Map<string, ActiveVoice>()
let sustainOn = false
let availableDetail = '音频引擎尚未初始化'

function noteKey(channel: number, note: number) {
  return `${channel}:${note}`
}

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12)
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    availableDetail = '当前浏览器不支持 Web Audio'
    return null
  }
  if (!audioContext) {
    audioContext = new AudioContext({ latencyHint: 'interactive' })
    masterGain = audioContext.createGain()
    masterGain.gain.value = 0.9
    masterGain.connect(audioContext.destination)
    availableDetail = 'Web Audio 钢琴合成已加载'
  }
  return audioContext
}

function resumeAudio() {
  const context = audioContext
  if (context?.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }
}

function startVoice(channel: number, note: number, velocity: number) {
  const context = ensureAudioContext()
  if (!context || !masterGain) return
  resumeAudio()
  const key = noteKey(channel, note)
  const current = voices.get(key)
  if (current) releaseVoice(key, current)

  const now = context.currentTime
  const amplitude = Math.min(1, Math.max(0.02, velocity / 127)) * 0.18
  const frequency = midiToFrequency(note)
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), now + 0.012)
  gain.gain.setValueAtTime(Math.max(0.0002, amplitude), now + 0.2)
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, amplitude * 0.18),
    now + 2.6,
  )
  gain.connect(masterGain)

  const partials: Array<{ ratio: number; level: number; type: OscillatorType }> = [
    { ratio: 1, level: 1, type: 'sine' },
    { ratio: 2, level: 0.28, type: 'triangle' },
    { ratio: 3, level: 0.1, type: 'sine' },
  ]
  const oscillators = partials.map((partial) => {
    const oscillator = context.createOscillator()
    oscillator.type = partial.type
    oscillator.frequency.value = frequency * partial.ratio
    oscillator.detune.value = (note % 12 === 0 ? 4 : -3) + (Math.random() - 0.5) * 6
    const partialGain = context.createGain()
    partialGain.gain.value = partial.level
    oscillator.connect(partialGain)
    partialGain.connect(gain)
    oscillator.start(now)
    return oscillator
  })
  voices.set(key, { gain, oscillators })
}

function releaseVoice(key: string, voice: ActiveVoice, sustainHold = false) {
  if (sustainHold && sustainOn) {
    heldBySustain.set(key, voice)
    return
  }
  const context = audioContext
  const gain = voice.gain
  if (context) {
    const now = context.currentTime
    try {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    } catch {
      gain.gain.value = 0
    }
    const stopAt = now + 0.4
    for (const oscillator of voice.oscillators) {
      try {
        oscillator.stop(stopAt)
      } catch {
        oscillator.stop()
      }
    }
  } else {
    for (const oscillator of voice.oscillators) {
      try {
        oscillator.stop()
      } catch {
        // oscillator was never started
      }
    }
  }
  voices.delete(key)
  heldBySustain.delete(key)
}

function releaseAllVoices() {
  for (const [key, voice] of voices) {
    releaseVoice(key, voice)
  }
  for (const [key, voice] of heldBySustain) {
    releaseVoice(key, voice)
  }
  voices.clear()
  heldBySustain.clear()
}

function handleControlChange(controller: number, value: number) {
  if (controller === 64) {
    sustainOn = value >= 64
    if (!sustainOn) {
      for (const [key, voice] of heldBySustain) {
        releaseVoice(key, voice)
      }
      heldBySustain.clear()
    }
    return
  }
  if (controller === 123 || controller === 120) {
    sustainOn = false
    releaseAllVoices()
  }
}

async function sendEvents(events: MidiEvent[]) {
  for (const event of events) {
    if (event.type === 'noteOn') {
      startVoice(event.channel, event.note, event.velocity)
    } else if (event.type === 'noteOff') {
      const key = noteKey(event.channel, event.note)
      const voice = voices.get(key)
      if (voice) releaseVoice(key, voice, true)
    } else if (event.type === 'controlChange') {
      handleControlChange(event.controller, event.value)
    }
  }
}

export const instrumentOutput = {
  status: async (): Promise<AudioOutputStatus> => {
    ensureAudioContext()
    return {
      available: audioContext !== null,
      backend: 'Web Audio',
      detail: availableDetail,
    }
  },
  send: (events: MidiEvent[]) => sendEvents(events),
  sendComputerInput: (events: MidiEvent[]) => sendEvents(events),
  sendMidiInput: (events: MidiEvent[]) => sendEvents(events),
  stopAll: async () => {
    sustainOn = false
    releaseAllVoices()
  },
  restart: async (events: MidiEvent[]) => {
    sustainOn = false
    releaseAllVoices()
    await sendEvents(events)
  },
}
