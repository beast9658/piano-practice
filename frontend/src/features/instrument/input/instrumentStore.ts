import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PianoInputDeviceDescriptor } from './types'
import { normalizeCalibratedRange } from './midiPitchMapping'

export const computerKeyboardDevice: PianoInputDeviceDescriptor = {
  id: 'computer-keyboard-61',
  kind: 'computer-keyboard',
  name: '电脑键盘',
  keyCount: 61,
  lowestPitch: 36,
  highestPitch: 96,
  pitchOffset: 0,
  supportsVelocity: false,
  supportsSustain: false,
  calibrated: true,
}

type InstrumentState = {
  devices: PianoInputDeviceDescriptor[]
  activeDeviceId: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  setMidiDevices: (devices: PianoInputDeviceDescriptor[]) => void
  setActiveDevice: (deviceId: string) => void
  setStatus: (status: InstrumentState['status']) => void
  calibrateDevice: (deviceId: string, lowestPitch: number, highestPitch: number) => void
}

export const useInstrumentStore = create<InstrumentState>()(persist((set) => ({
  devices: [computerKeyboardDevice],
  activeDeviceId: computerKeyboardDevice.id,
  status: 'connected',
  setMidiDevices: (midiDevices) =>
    set((state) => ({
      devices: [
        computerKeyboardDevice,
        ...midiDevices.map((device) => {
          const profile = state.devices.find((item) => item.id === device.id)
          if (profile?.calibrated && profile.lowestPitch !== null && profile.highestPitch !== null) {
            const range = normalizeCalibratedRange(
              profile.lowestPitch,
              profile.highestPitch,
              profile.pitchOffset,
            )
            return {
              ...device,
              keyCount: range.highestPitch - range.lowestPitch + 1,
              lowestPitch: range.lowestPitch,
              highestPitch: range.highestPitch,
              pitchOffset: range.pitchOffset,
              calibrated: true,
            }
          }
          return device
        }),
      ],
      activeDeviceId: [computerKeyboardDevice, ...midiDevices].some(
        (device) => device.id === state.activeDeviceId,
      )
        ? state.activeDeviceId
        : computerKeyboardDevice.id,
    })),
  setActiveDevice: (activeDeviceId) => set({ activeDeviceId }),
  setStatus: (status) => set({ status }),
  calibrateDevice: (deviceId, lowestPitch, highestPitch) =>
    set((state) => {
      const range = normalizeCalibratedRange(lowestPitch, highestPitch)
      return {
        devices: state.devices.map((device) =>
          device.id === deviceId
            ? {
                ...device,
                lowestPitch: range.lowestPitch,
                highestPitch: range.highestPitch,
                pitchOffset: range.pitchOffset,
                keyCount: range.highestPitch - range.lowestPitch + 1,
                calibrated: true,
              }
            : device,
        ),
      }
    }),
}), {
  name: 'agent-piano-input-v1',
  partialize: (state) => ({
    devices: state.devices,
    activeDeviceId: state.activeDeviceId,
    status: 'disconnected' as const,
  }),
}))
