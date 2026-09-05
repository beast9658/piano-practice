import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Fingerprint,
  ListTree,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Fragment, useState, type ComponentProps } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { pieceStagesApi, type PieceStage, type PieceStagePlan } from '../../api/pieceStages'
import { buildMeasureTimings } from '../practice/measureTiming'
import { usePracticeStore, type LoopRange } from '../practice/practiceStore'
import type { PieceScore } from '../../shared/types/domain'
import { FingeringTrialView } from './fingering/FingeringTrialView'
import { PracticeInsightsView } from './practice/PracticeInsightsView'

type AgentPanelProps = {
  score?: PieceScore
}

type PlanDraft =
  | { mode: 'create'; name: string; prompt: string }
  | { mode: 'edit'; planId: string; name: string; prompt: string }

type AnalyzePlanInput = {
  planId?: string
  name: string
  prompt: string
}

type RenamePlanInput = {
  planId: string
  name: string
}

type AgentView = 'practice' | 'fingering' | 'structure'

const agentViews = [
  { id: 'practice', label: '练习', icon: Activity },
  { id: 'fingering', label: '指法', icon: Fingerprint },
  { id: 'structure', label: '结构', icon: ListTree },
] as const

export function AgentPanel({ score }: AgentPanelProps) {
  const [view, setView] = useState<AgentView>('practice')
  return (
    <aside className="bg-card">
      <nav aria-label="练习助手功能" className="grid grid-cols-3 gap-px border-b border-border bg-border">
        {agentViews.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setView(item.id)}
              className={`flex h-11 items-center justify-center gap-2 bg-background text-[10px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? 'text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </nav>
      {view === 'practice' ? <PracticeInsightsView pieceId={score?.pieceId ?? ''} /> : null}
      {view === 'fingering' ? <FingeringTrialView score={score} /> : null}
      {view === 'structure' ? <StructureView score={score} /> : null}
    </aside>
  )
}

function StructureView({ score }: AgentPanelProps) {
  const queryClient = useQueryClient()
  const setLoopRange = usePracticeStore((state) => state.setLoopRange)
  const pieceId = score?.pieceId ?? ''
  const plansQueryKey = ['piece-stage-plans', pieceId] as const
  const [selectedStageId, setSelectedStageId] = useState('')
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const plansQuery = useQuery({
    queryKey: plansQueryKey,
    queryFn: () => pieceStagesApi.list(pieceId),
    enabled: Boolean(pieceId),
  })
  const plans = plansQuery.data ?? []
  const activePlan = plans.find((plan) => plan.isActive) ?? plans[0] ?? null
  const editedPlan = draft?.mode === 'edit'
    ? plans.find((plan) => plan.id === draft.planId) ?? null
    : null
  const selectedStage = selectStage(activePlan, selectedStageId)

  const analyzePlan = useMutation({
    mutationFn: (input: AnalyzePlanInput) => pieceStagesApi.analyze(
      pieceId,
      input.planId,
      input.name,
      input.prompt,
    ),
    onSuccess: async (nextPlan) => {
      queryClient.setQueryData<PieceStagePlan[]>(plansQueryKey, (current = []) => {
        const remaining = current.filter((plan) => plan.id !== nextPlan.id)
        return [nextPlan, ...remaining.map((plan) => ({ ...plan, isActive: false }))]
      })
      setSelectedStageId('')
      setDraft(null)
      setConfirmingDelete(false)
      await queryClient.invalidateQueries({ queryKey: ['piece-score', pieceId] })
    },
  })
  const renamePlan = useMutation({
    mutationFn: (input: RenamePlanInput) => pieceStagesApi.rename(
      pieceId,
      input.planId,
      input.name,
    ),
    onSuccess: (renamedPlan) => {
      queryClient.setQueryData<PieceStagePlan[]>(plansQueryKey, (current = []) =>
        current.map((plan) => plan.id === renamedPlan.id ? renamedPlan : plan),
      )
      setDraft(null)
      setConfirmingDelete(false)
    },
  })
  const activatePlan = useMutation({
    mutationFn: (planId: string) => pieceStagesApi.activate(pieceId, planId),
    onSuccess: async (activated) => {
      queryClient.setQueryData<PieceStagePlan[]>(plansQueryKey, (current = []) =>
        current.map((plan) => ({ ...plan, isActive: plan.id === activated.id })),
      )
      setSelectedStageId('')
      setDraft(null)
      setConfirmingDelete(false)
      await queryClient.invalidateQueries({ queryKey: ['piece-score', pieceId] })
    },
  })
  const deletePlan = useMutation({
    mutationFn: (planId: string) => pieceStagesApi.delete(pieceId, planId),
    onSuccess: async () => {
      setSelectedStageId('')
      setDraft(null)
      setConfirmingDelete(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: plansQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['piece-score', pieceId] }),
      ])
    },
  })
  const selectStageById = (stageId: string) => {
    setSelectedStageId((selectedId) => selectedId === stageId ? '' : stageId)
  }
  const goToStage = (stage: PieceStage) => {
    const range = buildStageLoopRange(score, stage)
    if (range) setLoopRange(range)
  }
  const openCreate = () => {
    setDraft({ mode: 'create', name: `方案 ${plans.length + 1}`, prompt: '' })
    setConfirmingDelete(false)
    analyzePlan.reset()
    renamePlan.reset()
  }
  const openEdit = () => {
    if (!activePlan) return
    setDraft({
      mode: 'edit',
      planId: activePlan.id,
      name: activePlan.name,
      prompt: activePlan.segmentationPrompt,
    })
    setConfirmingDelete(false)
    analyzePlan.reset()
    renamePlan.reset()
  }
  const submitDraft = () => {
    if (!draft?.name.trim()) return
    const name = draft.name.trim()
    const prompt = draft.prompt.trim()
    if (draft.mode === 'edit') {
      if (!editedPlan) return
      if (prompt === editedPlan.segmentationPrompt.trim()) {
        if (name === editedPlan.name) {
          setDraft(null)
          return
        }
        renamePlan.mutate({ planId: editedPlan.id, name })
        return
      }
    }
    analyzePlan.mutate({
      planId: draft.mode === 'edit' ? editedPlan?.id : undefined,
      name,
      prompt,
    })
  }

  const busy = analyzePlan.isPending
    || renamePlan.isPending
    || activatePlan.isPending
    || deletePlan.isPending
  const error = analyzePlan.error
    ?? renamePlan.error
    ?? activatePlan.error
    ?? deletePlan.error
    ?? plansQuery.error

  return (
    <div>
      <TooltipProvider delayDuration={180}>
        <header className="border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <ListTree className="size-4 text-primary" aria-hidden="true" />
              <div>
                <p className="text-[9px] font-bold tracking-[0.24em] text-muted-foreground">结构分析与动作规划</p>
                <h2 className="mt-0.5 text-xs font-bold text-foreground">分段 Agent</h2>
              </div>
            </div>
            <span className="text-[8px] font-bold tabular-nums text-muted-foreground">
              {plans.length} 方案
            </span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_2rem_2rem] gap-1 border-t border-border p-2">
            <Select
              value={activePlan?.id ?? ''}
              disabled={!plans.length || busy}
              onValueChange={(planId) => {
                if (planId !== activePlan?.id) activatePlan.mutate(planId)
              }}
            >
              <SelectTrigger className="h-8 border-0 bg-accent/40 px-2.5 focus-visible:ring-1" aria-label="当前分段方案">
                <SelectValue placeholder={plansQuery.isLoading ? '正在读取方案' : '尚无分段方案'} />
              </SelectTrigger>
              <SelectContent align="start">
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} · G{plan.generation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <IconAction
              label="编辑当前方案"
              disabled={!activePlan || busy}
              onClick={openEdit}
            >
              <Pencil className="size-3.5" />
            </IconAction>
            <IconAction label="新建分段方案" disabled={!score || busy} onClick={openCreate}>
              <Plus className="size-3.5" />
            </IconAction>
          </div>
        </header>

        {draft ? (
          <PlanEditor
            draft={draft}
            plan={editedPlan}
            submitting={analyzePlan.isPending || renamePlan.isPending}
            analyzing={analyzePlan.isPending}
            deleting={deletePlan.isPending}
            confirmingDelete={confirmingDelete}
            onChange={setDraft}
            onSubmit={submitDraft}
            onCancel={() => {
              setDraft(null)
              setConfirmingDelete(false)
            }}
            onRequestDelete={() => setConfirmingDelete(true)}
            onDelete={() => editedPlan && deletePlan.mutate(editedPlan.id)}
          />
        ) : null}

        {error ? <ErrorLine error={error} /> : null}

        <StageList
          plan={activePlan}
          selectedStage={selectedStage}
          loading={plansQuery.isLoading || activatePlan.isPending}
          disabled={busy}
          onCreate={openCreate}
          onSelectStage={selectStageById}
          onGoToStage={goToStage}
        />
      </TooltipProvider>
    </div>
  )
}

function IconAction({
  label,
  children,
  ...props
}: ComponentProps<'button'> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="grid size-8 place-items-center border border-border text-muted-foreground outline-none transition hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-35"
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function PlanEditor({
  draft,
  plan,
  submitting,
  analyzing,
  deleting,
  confirmingDelete,
  onChange,
  onSubmit,
  onCancel,
  onRequestDelete,
  onDelete,
}: {
  draft: PlanDraft
  plan: PieceStagePlan | null
  submitting: boolean
  analyzing: boolean
  deleting: boolean
  confirmingDelete: boolean
  onChange: (draft: PlanDraft) => void
  onSubmit: () => void
  onCancel: () => void
  onRequestDelete: () => void
  onDelete: () => void
}) {
  const promptChanged = draft.mode === 'create'
    || draft.prompt.trim() !== plan?.segmentationPrompt.trim()

  return (
    <section aria-labelledby="plan-editor-title" className="border-b border-border bg-accent/20">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <p className="text-[8px] font-bold tracking-[0.2em] text-muted-foreground">
            {draft.mode === 'create'
              ? '新建方案'
              : `G${plan?.generation ?? 1} · ${promptChanged ? '重新生成' : '编辑方案'}`}
          </p>
          <h3 id="plan-editor-title" className="mt-0.5 text-[11px] font-bold text-foreground">
            {draft.mode === 'create' ? '分段方案配置' : plan?.name}
          </h3>
        </div>
        <IconAction label="关闭方案编辑" onClick={onCancel} disabled={submitting || deleting}>
          <X className="size-3.5" />
        </IconAction>
      </div>

      <div className="space-y-3 p-4">
        <label className="block">
          <span className="mb-1.5 block text-[9px] font-bold text-muted-foreground">方案名称</span>
          <input
            value={draft.name}
            maxLength={40}
            disabled={submitting || deleting}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            className="h-9 w-full border border-border bg-background px-3 text-xs text-foreground outline-none transition focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[9px] font-bold text-muted-foreground">分段 Prompt</span>
          <textarea
            value={draft.prompt}
            rows={4}
            maxLength={1000}
            disabled={submitting || deleting}
            placeholder="例如：优先按照节奏型变化分段"
            onChange={(event) => onChange({ ...draft, prompt: event.target.value })}
            className="w-full resize-none border border-border bg-background px-3 py-2 text-[11px] leading-5 text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </label>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          {draft.mode === 'edit' ? (
            confirmingDelete ? (
              <button
                type="button"
                disabled={submitting || deleting}
                onClick={onDelete}
                className="inline-flex h-8 items-center gap-1.5 border border-destructive px-2.5 text-[9px] font-bold text-destructive outline-none transition hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-40"
              >
                {deleting ? <LoaderCircle className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                确认删除
              </button>
            ) : (
              <IconAction label="删除当前方案" disabled={submitting} onClick={onRequestDelete}>
                <Trash2 className="size-3.5" />
              </IconAction>
            )
          ) : null}
          <button
            type="button"
            disabled={!draft.name.trim() || submitting || deleting}
            onClick={onSubmit}
            className="ml-auto inline-flex h-8 items-center gap-2 bg-foreground px-3 text-[9px] font-bold text-background outline-none transition hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
          >
            {submitting
              ? <LoaderCircle className="size-3 animate-spin" />
              : promptChanged
                ? <Sparkles className="size-3" />
                : <Check className="size-3" />}
            {submitting
              ? analyzing ? '正在分析' : '正在保存'
              : draft.mode === 'create'
                ? '创建并分析'
                : promptChanged ? '更新并分析' : '保存名称'}
          </button>
        </div>
      </div>
    </section>
  )
}

function StageList({
  plan,
  selectedStage,
  loading,
  disabled,
  onCreate,
  onSelectStage,
  onGoToStage,
}: {
  plan: PieceStagePlan | null
  selectedStage: PieceStage | null
  loading: boolean
  disabled: boolean
  onCreate: () => void
  onSelectStage: (stageId: string) => void
  onGoToStage: (stage: PieceStage) => void
}) {
  if (loading) {
    return (
      <div className="grid h-24 place-items-center text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-label="正在读取分段方案" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="px-4 py-8 text-center">
        <Sparkles className="mx-auto size-4 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-[10px] text-muted-foreground">尚无分段方案</p>
        <button
          type="button"
          disabled={disabled}
          onClick={onCreate}
          className="mt-4 inline-flex h-8 items-center gap-2 border border-border px-3 text-[9px] font-bold text-foreground outline-none transition hover:bg-foreground hover:text-background focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
        >
          <Plus className="size-3" />
          创建首个方案
        </button>
      </div>
    )
  }

  return (
    <section aria-label={`${plan.name}分段`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[8px] font-bold text-muted-foreground">G{plan.generation} · {plan.model}</span>
        <span className="text-[8px] font-bold tabular-nums text-muted-foreground">{plan.stages.length} 段</span>
      </div>
      <div className="divide-y divide-border">
        {plan.stages.map((stage, index) => {
          const selected = stage.id === selectedStage?.id
          return (
            <Fragment key={stage.id}>
              <button
                type="button"
                disabled={disabled}
                aria-expanded={selected}
                onClick={() => onSelectStage(stage.id)}
                className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 px-4 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-45 ${selected ? 'bg-foreground text-background' : 'hover:bg-accent'}`}
              >
                <span className={`pt-0.5 text-[9px] font-bold tabular-nums ${selected ? 'text-background/55' : 'text-muted-foreground'}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">{stage.label}</span>
                  <span className={`mt-1 block text-[9px] leading-4 ${selected ? 'text-background/65' : 'text-muted-foreground'}`}>
                    {stage.reason}
                  </span>
                </span>
                <span className="flex items-center gap-1 pt-0.5 text-[9px] font-bold tabular-nums">
                  {stage.startMeasure}-{stage.endMeasure}
                  <ChevronRight
                    className={`size-3 transition-transform ${selected ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                </span>
              </button>

              {selected ? (
                <StageScopePanel
                  stage={stage}
                  stageNumber={index + 1}
                  onGo={() => onGoToStage(stage)}
                />
              ) : null}
            </Fragment>
          )
        })}
      </div>
    </section>
  )
}

function StageScopePanel({
  stage,
  stageNumber,
  onGo,
}: {
  stage: PieceStage
  stageNumber: number
  onGo: () => void
}) {
  return (
    <section
      aria-labelledby={`stage-scope-title-${stage.id}`}
      className="border-l-2 border-primary bg-accent/35 px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListTree className="size-4 text-primary" aria-hidden="true" />
          <div>
            <p className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground">
              分段 {String(stageNumber).padStart(2, '0')} / 练习范围
            </p>
            <h3 id={`stage-scope-title-${stage.id}`} className="mt-0.5 text-xs font-bold text-foreground">
              定位到本段
            </h3>
          </div>
        </div>
        <span className="text-[9px] font-bold text-muted-foreground">L1-L5 · R1-R5</span>
      </div>

      <div className="mt-4 border-l-2 border-primary pl-3">
        <p className="truncate text-xs font-bold text-foreground">{stage.label}</p>
        <p className="mt-1 text-[9px] font-bold tabular-nums text-muted-foreground">
          第 {stage.startMeasure}-{stage.endMeasure} 小节
        </p>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onGo}
          aria-label={`将循环范围设置为第 ${stage.startMeasure} 至 ${stage.endMeasure} 小节`}
          title="将训练循环定位到本段"
          className="flex h-10 w-full items-center justify-center gap-2 border border-border text-[9px] font-bold text-muted-foreground outline-none transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          设置循环范围
          <ArrowRight className="size-3" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

function ErrorLine({ error }: { error: unknown }) {
  return (
    <p className="m-4 flex gap-2 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-[10px] leading-5 text-destructive">
      <AlertTriangle className="mt-1 size-3 shrink-0" />
      {errorMessage(error)}
    </p>
  )
}

function selectStage(
  plan: PieceStagePlan | null,
  selectedStageId: string,
) {
  if (!plan?.stages.length) return null
  return plan.stages.find((stage) => stage.id === selectedStageId) ?? null
}

function buildStageLoopRange(score: PieceScore | undefined, stage: PieceStage): LoopRange | null {
  if (!score || score.totalBeats <= 0) return null
  const measures = buildMeasureTimings(score.totalBeats, score.timeSignature)
  const start = measures[stage.startMeasure - 1]
  const end = measures[stage.endMeasure - 1]
  if (!start || !end) return null
  return {
    startBeat: start.startBeat,
    endBeat: end.startBeat + end.durationBeats,
    startMeasure: start.number,
    endMeasure: end.number,
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Agent 操作失败'
}
