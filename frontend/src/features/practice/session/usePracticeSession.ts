import { useCallback, useEffect, useRef, useState } from 'react'
import { practiceApi } from '../../../api/practice'
import type { PieceScore, PracticeMode } from '../../../shared/types/domain'
import { usePracticeStore } from '../practiceStore'
import { practiceEvaluationBus } from './PracticeEvaluationBus'
import { PracticeSessionRecorder } from './PracticeSessionRecorder'
import type { PracticeSessionRecord, PracticeSessionSnapshot } from './types'

const emptySnapshot: PracticeSessionSnapshot = {
  recording: false,
  pedalDown: false,
  startedAt: null,
  elapsedMs: 0,
  inputCount: 0,
  noteCount: 0,
  correctCount: 0,
  wrongCount: 0,
  earlyCount: 0,
  delayedCount: 0,
  averageWaitDelayMs: null,
  pedalChangeCount: 0,
  averageVelocity: null,
  accuracy: null,
}

const practiceModes = new Set<PracticeMode>([
  'left-hand',
  'right-hand',
  'both-hands',
])

export function usePracticeSession(score: PieceScore | undefined) {
  const [snapshot, setSnapshot] = useState<PracticeSessionSnapshot>(emptySnapshot)
  const [saveError, setSaveError] = useState<string | null>(null)
  const recorderRef = useRef<PracticeSessionRecorder | null>(null)
  const recordingPieceIdRef = useRef<string | null>(null)
  const unsubscribeRef = useRef<() => void>(() => undefined)
  const snapshotTimerRef = useRef(0)
  const checkpointTimerRef = useRef(0)
  const lastCheckpointInputCountRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const scoreIdentity = score?.pieceId
  const mode = usePracticeStore((state) => state.mode)
  const canRecord = Boolean(scoreIdentity && practiceModes.has(mode))

  const clearRecordingResources = useCallback(() => {
    window.clearInterval(snapshotTimerRef.current)
    window.clearInterval(checkpointTimerRef.current)
    unsubscribeRef.current()
    unsubscribeRef.current = () => undefined
    snapshotTimerRef.current = 0
    checkpointTimerRef.current = 0
  }, [])

  const enqueueSave = useCallback((session: PracticeSessionRecord) => {
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      try {
        await practiceApi.saveSession(session)
        setSaveError(null)
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : '练习记录保存失败')
        console.error('Unable to save practice session', error)
      }
    })
    return saveQueueRef.current
  }, [])
  const flushSaves = useCallback(() => saveQueueRef.current, [])

  const saveFinal = useCallback((recorder: PracticeSessionRecorder) => {
    const session = recorder.finish()
    if (session.events.length === 0) return Promise.resolve()
    return enqueueSave(session)
  }, [enqueueSave])

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return null
    recorderRef.current = null
    recordingPieceIdRef.current = null
    clearRecordingResources()
    const finishedSnapshot = recorder.snapshot()
    setSnapshot({ ...finishedSnapshot, recording: false })
    await saveFinal(recorder)
    return recorder.id
  }, [clearRecordingResources, saveFinal])

  const startRecording = useCallback(() => {
    if (recorderRef.current || !scoreIdentity || !score) return null
    const state = usePracticeStore.getState()
    if (!practiceModes.has(state.mode)) return null

    const startedAtMs = performance.now()
    const scope = state.loopEnabled && state.loopRange
      ? state.loopRange
      : {
          startBeat: 0,
          endBeat: score.totalBeats,
          startMeasure: 1,
          endMeasure: scoreMeasureCount(score.totalBeats, score.timeSignature),
        }
    const recorder = new PracticeSessionRecorder({
      id: crypto.randomUUID(),
      pieceId: scoreIdentity,
      startedAt: new Date().toISOString(),
      startedAtMs,
      initialMode: state.mode,
      initialBpm: state.bpm,
      scope: {
        arrangementId: score.arrangementId,
        scoreFingerprint: score.scoreFingerprint,
        ...scope,
      },
    })
    recorderRef.current = recorder
    recordingPieceIdRef.current = scoreIdentity
    lastCheckpointInputCountRef.current = 0
    setSnapshot(recorder.snapshot(startedAtMs))
    setSaveError(null)

    unsubscribeRef.current = practiceEvaluationBus.subscribe(({ event, judgement }) => {
      const transport = usePracticeStore.getState()
      recorder.recordEvaluation(event, {
        beat: transport.currentBeat,
        bpm: transport.bpm,
        mode: transport.mode,
        isPlaying: transport.isPlaying,
      }, judgement)
    })
    snapshotTimerRef.current = window.setInterval(() => {
      setSnapshot(recorder.snapshot())
    }, 200)
    checkpointTimerRef.current = window.setInterval(() => {
      const nextSnapshot = recorder.snapshot()
      if (nextSnapshot.inputCount === lastCheckpointInputCountRef.current) return
      lastCheckpointInputCountRef.current = nextSnapshot.inputCount
      void enqueueSave(recorder.checkpoint())
    }, 10_000)
    return recorder.id
  }, [enqueueSave, score, scoreIdentity])

  useEffect(() => {
    if (canRecord || !recorderRef.current) return
    void stopRecording()
  }, [canRecord, stopRecording])

  useEffect(() => {
    if (
      recorderRef.current
      && recordingPieceIdRef.current !== scoreIdentity
    ) void stopRecording()
  }, [scoreIdentity, stopRecording])

  useEffect(() => () => {
    const recorder = recorderRef.current
    if (!recorder) return
    recorderRef.current = null
    recordingPieceIdRef.current = null
    clearRecordingResources()
    void saveFinal(recorder)
  }, [clearRecordingResources, saveFinal])

  return {
    snapshot,
    saveError,
    canRecord,
    startRecording,
    stopRecording,
    flushSaves,
  }
}

function scoreMeasureCount(totalBeats: number, timeSignature: string) {
  const [numeratorText, denominatorText] = timeSignature.split('/')
  const numerator = Number(numeratorText)
  const denominator = Number(denominatorText)
  const beatsPerMeasure = numerator > 0 && denominator > 0
    ? numerator * (4 / denominator)
    : 4
  return Math.max(1, Math.ceil(totalBeats / beatsPerMeasure))
}
