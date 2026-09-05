import { useEffect, useEffectEvent } from 'react'
import type { PracticeMode } from '../../shared/types/domain'
import { usePracticeStore } from './practiceStore'

const modeCycle: readonly PracticeMode[] = [
  'listen',
  'free',
  'right-hand',
  'left-hand',
  'both-hands',
]

export function usePracticeShortcuts(
  availableModes: ReadonlySet<PracticeMode>,
  toggleAgentPanel: () => void,
  toggleFullscreen: () => void,
  exitPractice: () => void,
  agentPanelOpen: boolean,
) {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat) return

    if (
      event.key === 'Escape' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      !agentPanelOpen &&
      !isEditableTarget(event.target)
    ) {
      event.preventDefault()
      exitPractice()
      return
    }

    if (
      event.code === 'KeyF' &&
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      !isEditableTarget(event.target)
    ) {
      event.preventDefault()
      toggleFullscreen()
      return
    }

    if (isInteractiveTarget(event.target)) return

    if (
      event.code === 'Space' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      if (usePracticeStore.getState().mode === 'free') return
      event.preventDefault()
      usePracticeStore.getState().togglePlayback()
      return
    }

    if (
      event.key === 'Tab' &&
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault()
      cycleMode(availableModes, event.shiftKey ? -1 : 1)
      return
    }

    if (
      event.code === 'KeyA' &&
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault()
      toggleAgentPanel()
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable="true"]',
  ))
}

function cycleMode(availableModes: ReadonlySet<PracticeMode>, direction: 1 | -1) {
  const state = usePracticeStore.getState()
  const currentIndex = modeCycle.indexOf(state.mode)
  for (let offset = 1; offset <= modeCycle.length; offset += 1) {
    const index = (currentIndex + direction * offset + modeCycle.length) % modeCycle.length
    const candidate = modeCycle[index]
    if (availableModes.has(candidate)) {
      state.setMode(candidate)
      return
    }
  }
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, button, a, [contenteditable="true"], [role="menuitem"], [role="slider"]',
  ))
}
