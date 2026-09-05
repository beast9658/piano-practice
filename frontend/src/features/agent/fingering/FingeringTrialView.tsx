import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  Check,
  CircleStop,
  Fingerprint,
  LoaderCircle,
  Play,
  Sparkles,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  fingeringApi,
  type FingeringAdherence,
  type FingeringCandidate,
  type FingeringTrial,
} from '../../../api/fingering'
import { pieceStagesApi } from '../../../api/pieceStages'
import type { PieceScore, PracticeMode } from '../../../shared/types/domain'
import { usePracticeStore } from '../../practice/practiceStore'
import { usePracticeSessionStatus } from '../../practice/session/PracticeSessionProvider'

type PracticeTrialMode = Exclude<PracticeMode, 'listen' | 'free'>

export function FingeringTrialView({ score }: { score?: PieceScore }) {
  const queryClient = useQueryClient()
  const pieceId = score?.pieceId ?? ''
  const mode = usePracticeStore((state) => state.mode)
  const bpm = usePracticeStore((state) => state.bpm)
  const setMode = usePracticeStore((state) => state.setMode)
  const setBpm = usePracticeStore((state) => state.setBpm)
  const setLoopRange = usePracticeStore((state) => state.setLoopRange)
  const setFingeringPreview = usePracticeStore((state) => state.setFingeringPreview)
  const trialSession = usePracticeStore((state) => state.fingeringTrialSession)
  const setTrialSession = usePracticeStore((state) => state.setFingeringTrialSession)
  const { snapshot, startRecording, stopRecording, flushSaves } = usePracticeSessionStatus()
  const [stageId, setStageId] = useState('')
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const [adherence, setAdherence] = useState<FingeringAdherence>('confirmed')
  const [comfort, setComfort] = useState<number | null>(null)

  const plansQuery = useQuery({
    queryKey: ['piece-stage-plans', pieceId],
    queryFn: () => pieceStagesApi.list(pieceId),
    enabled: Boolean(pieceId),
  })
  const activePlan = plansQuery.data?.find((plan) => plan.isActive) ?? plansQuery.data?.[0] ?? null
  const trialsKey = ['fingering-trials', pieceId] as const
  const trialsQuery = useQuery({
    queryKey: trialsKey,
    queryFn: () => fingeringApi.listTrials(pieceId),
    enabled: Boolean(pieceId),
  })
  const activeTrial = trialsQuery.data?.find((trial) => trial.status === 'running') ?? null
  const effectiveStageId = activeTrial?.stageId || stageId || activePlan?.stages[0]?.id || ''
  const selectedStage = activePlan?.stages.find((stage) => stage.id === effectiveStageId) ?? null
  const candidatesKey = ['fingering-candidates', pieceId, effectiveStageId] as const
  const candidatesQuery = useQuery({
    queryKey: candidatesKey,
    queryFn: () => fingeringApi.listCandidates(pieceId, effectiveStageId),
    enabled: Boolean(pieceId && effectiveStageId),
  })
  const candidates = useMemo(
    () => (candidatesQuery.data ?? []).filter(
      (candidate) => candidate.scoreFingerprint === score?.scoreFingerprint,
    ),
    [candidatesQuery.data, score?.scoreFingerprint],
  )
  const candidateById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  )
  const runningTrial = activeTrial
  const recentCompletedTrial = trialsQuery.data?.find(
    (trial) => trial.stageId === effectiveStageId && trial.status === 'completed',
  ) ?? null
  const nextPass = runningTrial?.passes.find((pass) => pass.status !== 'completed') ?? null
  const runningPass = runningTrial?.passes.find((pass) => pass.status === 'running') ?? null
  const activeTrialSession = trialSession
    && trialSession.trialId === runningTrial?.id
    && trialSession.passId === runningPass?.id
    ? trialSession
    : null

  const generate = useMutation({
    mutationFn: () => fingeringApi.generateCandidates(pieceId, activePlan?.id ?? '', effectiveStageId),
    onSuccess: (generated) => {
      queryClient.setQueryData(candidatesKey, generated)
      setSelectedCandidateIds(generated.slice(0, 2).map((candidate) => candidate.id))
    },
  })
  const createTrial = useMutation({
    mutationFn: () => fingeringApi.createTrial(
      pieceId,
      selectedCandidateIds as [string, string],
      practiceMode(mode, candidates),
      bpm,
    ),
    onSuccess: (trial) => {
      queryClient.setQueryData<FingeringTrial[]>(trialsKey, (current = []) => [
        trial,
        ...current.filter((item) => item.id !== trial.id),
      ])
    },
  })
  const startPass = useMutation({
    mutationFn: async ({ trial, candidate }: { trial: FingeringTrial; candidate: FingeringCandidate }) => {
      const pass = trial.passes.find((item) => item.status !== 'completed')
      if (!pass) throw new Error('三轮对比已经完成')
      setLoopRange({
        startBeat: trial.startBeat,
        endBeat: trial.endBeat,
        startMeasure: trial.startMeasure,
        endMeasure: trial.endMeasure,
      })
      setBpm(trial.bpm)
      setMode(trial.mode)
      setFingeringPreview(Object.fromEntries(
        candidate.assignments.map((item) => [item.noteId, item.label]),
      ))
      const updated = await fingeringApi.startTrialPass(trial.id, pass.id)
      const sessionId = startRecording()
      if (!sessionId) throw new Error('无法启动本轮演奏记录')
      setTrialSession({ trialId: trial.id, passId: pass.id, sessionId })
      return updated
    },
    onSuccess: (trial) => replaceTrial(queryClient, trialsKey, trial),
    onError: () => setFingeringPreview(null),
  })
  const completePass = useMutation({
    mutationFn: async () => {
      if (!runningTrial || !runningPass || !activeTrialSession) throw new Error('没有可提交的本轮练习')
      if (snapshot.recording) await stopRecording()
      await flushSaves()
      return fingeringApi.completeTrialPass(
        runningTrial.id,
        runningPass.id,
        activeTrialSession.sessionId,
        adherence,
        comfort,
      )
    },
    onSuccess: (trial) => {
      replaceTrial(queryClient, trialsKey, trial)
      setTrialSession(null)
      setAdherence('confirmed')
      setComfort(null)
      setFingeringPreview(null)
      void queryClient.invalidateQueries({ queryKey: ['practice-sessions', pieceId] })
    },
  })
  const adopt = useMutation({
    mutationFn: (candidateId: string) => fingeringApi.adoptCandidate(pieceId, candidateId),
    onSuccess: async () => {
      setFingeringPreview(null)
      await queryClient.invalidateQueries({ queryKey: ['piece-score', pieceId] })
    },
  })
  const cancelTrial = useMutation({
    mutationFn: (trialId: string) => fingeringApi.cancelTrial(trialId),
    onSuccess: (trial) => {
      replaceTrial(queryClient, trialsKey, trial)
      setTrialSession(null)
      setFingeringPreview(null)
    },
  })

  const error = generate.error ?? createTrial.error ?? startPass.error ?? completePass.error ?? adopt.error ?? cancelTrial.error

  return (
    <div>
      <section className="border-b border-border p-4">
        <label className="block">
          <span className="mb-2 block text-[9px] font-bold tracking-[0.2em] text-muted-foreground">对比范围</span>
          <select
            value={effectiveStageId}
            disabled={!activePlan || Boolean(runningTrial)}
            onChange={(event) => {
              setStageId(event.target.value)
              setSelectedCandidateIds([])
            }}
            className="h-9 w-full border border-border bg-background px-3 text-[11px] font-bold text-foreground outline-none focus:border-primary"
          >
            {activePlan?.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.startMeasure}-{stage.endMeasure} · {stage.label}
              </option>
            ))}
          </select>
        </label>
        {selectedStage ? (
          <p className="mt-3 text-[10px] leading-5 text-muted-foreground">{selectedStage.reason}</p>
        ) : null}
      </section>

      {runningTrial ? (
        <TrialRunner
          trial={runningTrial}
          candidates={candidateById}
          nextPass={nextPass}
          recording={snapshot.recording}
          recordedNoteCount={snapshot.noteCount}
          activeSessionId={activeTrialSession?.sessionId ?? null}
          adherence={adherence}
          comfort={comfort}
          busy={startPass.isPending || completePass.isPending || cancelTrial.isPending}
          onStart={(candidate) => startPass.mutate({ trial: runningTrial, candidate })}
          onStop={() => void stopRecording()}
          onAdherence={setAdherence}
          onComfort={setComfort}
          onSubmit={() => completePass.mutate()}
          onCancel={() => cancelTrial.mutate(runningTrial.id)}
        />
      ) : (
        <CandidateWorkspace
          candidates={candidates}
          selectedIds={selectedCandidateIds}
          loading={candidatesQuery.isLoading}
          generating={generate.isPending}
          creating={createTrial.isPending}
          canGenerate={Boolean(activePlan && effectiveStageId)}
          onGenerate={() => generate.mutate()}
          onToggle={(candidateId) => setSelectedCandidateIds((current) => {
            if (current.includes(candidateId)) return current.filter((id) => id !== candidateId)
            if (current.length >= 2) return [current[1], candidateId]
            return [...current, candidateId]
          })}
          onCreate={() => createTrial.mutate()}
        />
      )}

      {error ? <p className="border-t border-destructive/40 px-4 py-3 text-[10px] text-destructive">{errorMessage(error)}</p> : null}

      {recentCompletedTrial ? (
        <TrialResult
          trial={recentCompletedTrial}
          candidates={candidateById}
          adopting={adopt.isPending}
          onAdopt={(candidateId) => adopt.mutate(candidateId)}
        />
      ) : null}
    </div>
  )
}

function CandidateWorkspace({
  candidates,
  selectedIds,
  loading,
  generating,
  creating,
  canGenerate,
  onGenerate,
  onToggle,
  onCreate,
}: {
  candidates: FingeringCandidate[]
  selectedIds: string[]
  loading: boolean
  generating: boolean
  creating: boolean
  canGenerate: boolean
  onGenerate: () => void
  onToggle: (candidateId: string) => void
  onCreate: () => void
}) {
  return (
    <section aria-label="指法方案">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground">指法方案</p>
          <p className="mt-1 text-xs font-bold text-foreground/90">选择两套指法</p>
        </div>
        <button
          type="button"
          disabled={!canGenerate || generating}
          onClick={onGenerate}
          className="grid size-8 place-items-center border border-border text-muted-foreground outline-none transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-35"
          aria-label="生成指法方案"
          title="生成方案"
        >
          {generating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        </button>
      </div>
      {loading ? (
        <p className="px-4 py-8 text-center text-[10px] text-muted-foreground">正在读取指法方案</p>
      ) : candidates.length === 0 ? (
        <p className="px-4 py-8 text-center text-[10px] text-muted-foreground">为当前范围生成指法方案后开始比较</p>
      ) : (
        <div className="divide-y divide-border">
          {candidates.map((candidate) => {
            const selected = selectedIds.includes(candidate.id)
            return (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggle(candidate.id)}
                className={`w-full px-4 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${selected ? 'bg-foreground text-background' : 'hover:bg-accent'}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`grid size-4 shrink-0 place-items-center border ${selected ? 'border-background/45' : 'border-border'}`}>
                      {selected ? <Check className="size-3" /> : null}
                    </span>
                    <span className="truncate text-[11px] font-bold">{candidate.name}</span>
                  </span>
                  <span className={`text-[8px] font-bold ${selected ? 'text-background/60' : 'text-muted-foreground'}`}>{candidate.assignments.length} 音</span>
                </span>
                <span className={`mt-2 grid grid-cols-3 gap-2 text-[8px] ${selected ? 'text-background/65' : 'text-muted-foreground'}`}>
                  <span>换位 {candidate.features.positionShifts}</span>
                  <span>跨指 {candidate.features.thumbCrossings}</span>
                  <span>跨度 {candidate.features.maxSpan}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      <div className="border-t border-border p-3">
        <button
          type="button"
          disabled={selectedIds.length !== 2 || creating}
          onClick={onCreate}
          className="flex h-9 w-full items-center justify-center gap-2 bg-foreground text-[10px] font-bold text-background outline-none transition hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-35"
        >
          {creating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Fingerprint className="size-3.5" />}
          开始三轮指法对比
        </button>
      </div>
    </section>
  )
}

function TrialRunner({
  trial,
  candidates,
  nextPass,
  recording,
  recordedNoteCount,
  activeSessionId,
  adherence,
  comfort,
  busy,
  onStart,
  onStop,
  onAdherence,
  onComfort,
  onSubmit,
  onCancel,
}: {
  trial: FingeringTrial
  candidates: Map<string, FingeringCandidate>
  nextPass: FingeringTrial['passes'][number] | null
  recording: boolean
  recordedNoteCount: number
  activeSessionId: string | null
  adherence: FingeringAdherence
  comfort: number | null
  busy: boolean
  onStart: (candidate: FingeringCandidate) => void
  onStop: () => void
  onAdherence: (value: FingeringAdherence) => void
  onComfort: (value: number) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const candidate = nextPass ? candidates.get(nextPass.candidateId) : null
  const awaitingFeedback = nextPass?.status === 'running' && !recording && Boolean(activeSessionId)
  const foreignRecording = recording && !activeSessionId
  return (
    <section aria-label="三轮指法对比">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground">三轮指法对比 · {trial.bpm} BPM</p>
            <p className="mt-1 text-sm font-bold text-foreground/90">第 {trial.startMeasure}-{trial.endMeasure} 小节</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {trial.passes.filter((pass) => pass.status === 'completed').length}/3
            </span>
            <button
              type="button"
              disabled={recording || busy}
              onClick={onCancel}
              className="grid size-7 place-items-center border border-border text-muted-foreground outline-none transition hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-30"
              aria-label="结束当前指法对比"
              title="结束对比"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-px bg-border">
          {trial.passes.map((pass) => (
            <div key={pass.id} className={`px-2 py-2 text-center text-[9px] font-bold ${pass.status === 'completed' ? 'bg-primary text-primary-foreground' : pass.status === 'running' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground'}`}>
              第 {pass.position} 轮
            </div>
          ))}
        </div>
      </div>

      {awaitingFeedback ? (
        <div className="space-y-4 p-4">
          {recordedNoteCount === 0 ? (
            <button
              type="button"
              disabled={!candidate || busy}
              onClick={() => candidate && onStart(candidate)}
              className="flex h-9 w-full items-center justify-center gap-2 border border-primary/50 text-[10px] font-bold text-primary disabled:opacity-35"
            >
              <Play className="size-3.5" />
              本轮没有有效按键，重新演奏
            </button>
          ) : null}
          <div>
            <p className="text-[9px] font-bold text-muted-foreground">指法遵循</p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {([
                ['confirmed', '完整遵循'],
                ['partial', '部分遵循'],
                ['not-followed', '未遵循'],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => onAdherence(value)} className={`h-8 border text-[9px] font-bold ${adherence === value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground">舒适度</p>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => onComfort(value)} className={`h-8 border font-mono text-[10px] font-bold ${comfort === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
                  {value}
                </button>
              ))}
            </div>
          </div>
          <button type="button" disabled={busy || comfort === null || recordedNoteCount === 0} onClick={onSubmit} className="flex h-9 w-full items-center justify-center gap-2 bg-foreground text-[10px] font-bold text-background disabled:opacity-35">
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            确认本轮结果
          </button>
        </div>
      ) : (
        <div className="p-4">
          <p className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground">当前方案</p>
          <p className="mt-1 text-sm font-bold text-foreground/90">{candidate?.name ?? '对比已完成'}</p>
          <button
            type="button"
            disabled={!candidate || busy || foreignRecording}
            onClick={recording ? onStop : () => candidate && onStart(candidate)}
            className={`mt-4 flex h-10 w-full items-center justify-center gap-2 border text-[10px] font-bold outline-none transition disabled:opacity-35 ${recording ? 'border-destructive/50 text-destructive hover:bg-destructive/10' : 'border-primary/50 text-primary hover:bg-primary/10'}`}
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : recording ? <CircleStop className="size-3.5" /> : <Play className="size-3.5" />}
            {foreignRecording
              ? '请先结束普通练习记录'
              : recording ? '结束本轮' : `开始第 ${nextPass?.position ?? 1} 轮`}
          </button>
        </div>
      )}
    </section>
  )
}

function TrialResult({ trial, candidates, adopting, onAdopt }: { trial: FingeringTrial; candidates: Map<string, FingeringCandidate>; adopting: boolean; onAdopt: (id: string) => void }) {
  const scores = trial.candidateIds.map((candidateId) => {
    const passes = trial.passes.filter((pass) => pass.candidateId === candidateId && pass.adherence !== 'not-followed')
    const accuracies = passes.map((pass) => pass.summary?.accuracy).filter((value): value is number => value !== null && value !== undefined)
    const comforts = passes.map((pass) => pass.comfortRating).filter((value): value is number => value !== null)
    return {
      candidateId,
      score: (accuracies.length ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : 0) * 0.7
        + (comforts.length ? comforts.reduce((a, b) => a + b, 0) / comforts.length / 5 : 0) * 0.3,
    }
  })
  const winner = scores.toSorted((a, b) => b.score - a.score)[0]
  const candidate = winner ? candidates.get(winner.candidateId) : null
  if (!candidate) return null
  return (
    <section className="border-t border-border px-4 py-4">
      <p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground">最近对比结果</p>
      <p className="mt-1 text-xs font-bold text-foreground/90">当前更适合：{candidate.name}</p>
      <button type="button" disabled={adopting} onClick={() => onAdopt(candidate.id)} className="mt-3 flex h-9 w-full items-center justify-center gap-2 border border-primary/50 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:opacity-35">
        {adopting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        确认采用此指法
      </button>
    </section>
  )
}

function practiceMode(mode: PracticeMode, candidates: FingeringCandidate[]): PracticeTrialMode {
  if (mode === 'left-hand' || mode === 'right-hand' || mode === 'both-hands') return mode
  const hands = new Set(candidates.flatMap((candidate) => candidate.assignments.map((item) => item.hand)))
  if (hands.size > 1) return 'both-hands'
  return hands.has('left') ? 'left-hand' : 'right-hand'
}

function replaceTrial(queryClient: QueryClient, key: readonly unknown[], trial: FingeringTrial) {
  queryClient.setQueryData<FingeringTrial[]>(key, (current = []) => [
    trial,
    ...current.filter((item) => item.id !== trial.id),
  ])
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '指法对比操作失败'
}
