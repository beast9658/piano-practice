import {
  memo,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { GripVertical } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { PieceScore } from '../../shared/types/domain'
import { usePracticeStore, type LoopRange } from './practiceStore'
import type { MeasureTiming } from './measureTiming'
import { buildMeasureTimings, formatPlaybackTime } from './measureTiming'

type MeasureProgressProps = {
  score?: PieceScore
  expanded?: boolean
  onToggleExpanded?: () => void
}

export function MeasureProgress({ score, expanded, onToggleExpanded }: MeasureProgressProps) {
  const currentBeat = usePracticeStore((state) => state.currentBeat)
  const bpm = usePracticeStore((state) => state.bpm)
  const requestSeek = usePracticeStore((state) => state.requestSeek)
  const loopEnabled = usePracticeStore((state) => state.loopEnabled)
  const loopRange = usePracticeStore((state) => state.loopRange)
  const setLoopRange = usePracticeStore((state) => state.setLoopRange)
  const trackRef = useRef<HTMLDivElement>(null)
  const draftRangeRef = useRef<LoopRange | null>(null)
  const [draftRange, setDraftRange] = useState<LoopRange | null>(null)
  const measures = useMemo(
    () => buildMeasureTimings(score?.totalBeats ?? 0, score?.timeSignature ?? '4/4'),
    [score?.timeSignature, score?.totalBeats],
  )
  const totalBeats = score?.totalBeats ?? 0
  const progressPercent = totalBeats > 0 ? Math.min(100, (currentBeat / totalBeats) * 100) : 0
  const secondsPerBeat = 60 / Math.max(1, bpm)
  const visibleLoopRange = draftRange ?? loopRange

  const previewLoopEdge = (edge: LoopEdge, clientX: number) => {
    const track = trackRef.current
    const currentRange = draftRangeRef.current ?? loopRange
    if (!track || !currentRange || measures.length === 0) return
    const bounds = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / Math.max(1, bounds.width)))
    const nextRange = updateLoopEdge(currentRange, measures, edge, ratio * totalBeats)
    draftRangeRef.current = nextRange
    setDraftRange(nextRange)
  }

  const commitLoopRange = () => {
    const nextRange = draftRangeRef.current
    if (nextRange) setLoopRange(nextRange)
    draftRangeRef.current = null
    setDraftRange(null)
  }

  const cancelLoopPreview = () => {
    draftRangeRef.current = null
    setDraftRange(null)
  }

  return (
    <div ref={trackRef} className="relative h-3 shrink-0 bg-muted">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 bg-primary/75"
        style={{ width: `${progressPercent}%` }}
      />

      {loopEnabled && visibleLoopRange && totalBeats > 0 ? (
        <div
          className="pointer-events-none absolute inset-y-0 z-20 border-x border-foreground/50 bg-foreground/20"
          style={{
            left: `${(visibleLoopRange.startBeat / totalBeats) * 100}%`,
            width: `${((visibleLoopRange.endBeat - visibleLoopRange.startBeat) / totalBeats) * 100}%`,
          }}
        />
      ) : null}

      <MeasureSegments
        measures={measures}
        secondsPerBeat={secondsPerBeat}
        pieceId={score?.pieceId ?? ''}
        requestSeek={requestSeek}
      />

      {loopEnabled && visibleLoopRange && totalBeats > 0 ? (
        <>
          <LoopProbe
            edge="start"
            range={visibleLoopRange}
            measures={measures}
            totalBeats={totalBeats}
            onPreview={previewLoopEdge}
            onCommit={commitLoopRange}
            onCancel={cancelLoopPreview}
          />
          <LoopProbe
            edge="end"
            range={visibleLoopRange}
            measures={measures}
            totalBeats={totalBeats}
            onPreview={previewLoopEdge}
            onCommit={commitLoopRange}
            onCancel={cancelLoopPreview}
          />
        </>
      ) : null}

      <span className="pointer-events-none absolute inset-y-0 left-3 z-20 flex items-center text-[8px] font-bold tracking-wider tabular-nums text-foreground/60">
        {formatPlaybackTime(currentBeat * secondsPerBeat)}
      </span>
      <span className="pointer-events-none absolute inset-y-0 right-3 z-20 flex items-center text-[8px] font-bold tracking-wider tabular-nums text-foreground/60">
        {formatPlaybackTime(totalBeats * secondsPerBeat)}
      </span>

      {onToggleExpanded ? (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="group absolute left-1/2 top-full z-30 h-4 w-24 -translate-x-1/2 cursor-pointer bg-transparent outline-none"
          aria-label={expanded ? '收起练习控制' : '展开练习控制'}
          title={expanded ? '收起练习控制' : '展开练习控制'}
        >
          <span className="absolute left-1/2 top-1 h-px w-9 -translate-x-1/2 bg-foreground/35 transition-all duration-300 ease-out group-hover:w-20 group-hover:bg-foreground/90 group-hover:shadow-[0_0_5px_color-mix(in_srgb,var(--foreground)_70%,transparent),0_0_14px_color-mix(in_srgb,var(--foreground)_35%,transparent)] group-focus-visible:w-20 group-focus-visible:bg-foreground/90" />
        </button>
      ) : null}
    </div>
  )
}

const MeasureSegments = memo(function MeasureSegments({
  measures,
  secondsPerBeat,
  pieceId,
  requestSeek,
}: {
  measures: MeasureTiming[]
  secondsPerBeat: number
  pieceId: string
  requestSeek: (pieceId: string, beat: number) => void
}) {
  return (
    <TooltipProvider delayDuration={180}>
      <div className="absolute inset-0 z-20 flex">
        {measures.map((measure) => {
          const startSeconds = measure.startBeat * secondsPerBeat
          const durationSeconds = measure.durationBeats * secondsPerBeat
          return (
            <Tooltip key={measure.number}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => requestSeek(pieceId, measure.startBeat)}
                  aria-label={`跳转到第 ${measure.number} 小节`}
                  className="relative h-full cursor-pointer border-r border-foreground/20 outline-none last:border-r-0 hover:bg-foreground/10 focus-visible:bg-foreground/20"
                  style={{ flexGrow: measure.durationBeats, flexBasis: 0 }}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="rounded-none border border-border bg-foreground px-2 py-1 text-[10px] font-bold text-background shadow-2xl">
                {measure.number} · {formatPlaybackTime(startSeconds)} · {durationSeconds.toFixed(1)}s
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
})

type LoopEdge = 'start' | 'end'

function LoopProbe({
  edge,
  range,
  measures,
  totalBeats,
  onPreview,
  onCommit,
  onCancel,
}: {
  edge: LoopEdge
  range: LoopRange
  measures: MeasureTiming[]
  totalBeats: number
  onPreview: (edge: LoopEdge, clientX: number) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const beat = edge === 'start' ? range.startBeat : range.endBeat
  const measure = edge === 'start' ? range.startMeasure : range.endMeasure
  const label = edge === 'start' ? '循环起点' : '循环终点'

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    onPreview(edge, event.clientX)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!direction) return
    event.preventDefault()
    const nextRange = moveLoopEdge(range, measures, edge, direction)
    if (nextRange === range) return
    const nextBeat = edge === 'start' ? nextRange.startBeat : nextRange.endBeat
    const track = event.currentTarget.parentElement
    if (!track) return
    const bounds = track.getBoundingClientRect()
    onPreview(edge, bounds.left + (nextBeat / totalBeats) * bounds.width)
    onCommit()
  }

  return (
    <button
      type="button"
      role="slider"
      aria-label={`${label}，第 ${measure} 小节`}
      aria-valuemin={1}
      aria-valuemax={measures.length}
      aria-valuenow={measure}
      aria-orientation="horizontal"
      title={`${label} · 第 ${measure} 小节`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => {
        event.stopPropagation()
        onCommit()
      }}
      onPointerCancel={onCancel}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      className={`group/probe absolute top-0 z-50 h-9 w-8 touch-none cursor-ew-resize outline-none ${edge === 'end' ? '-translate-x-full' : ''}`}
      style={{ left: `${(beat / totalBeats) * 100}%` }}
    >
      <span
        className={`absolute top-0 h-5 w-px bg-primary shadow-[0_0_6px_color-mix(in_srgb,var(--primary)_45%,transparent)] transition-[width,background-color] group-hover/probe:w-0.5 group-focus-visible/probe:w-0.5 ${edge === 'start' ? 'left-0' : 'right-0'}`}
      />
      <span
        className={`absolute top-4 flex h-5 min-w-7 items-center justify-center gap-px border border-primary/65 bg-background px-1 text-[8px] font-bold leading-none tabular-nums text-primary shadow-[0_2px_8px_color-mix(in_srgb,var(--background)_75%,transparent)] transition-[background-color,color,border-color,transform] group-hover/probe:border-primary group-hover/probe:bg-primary group-hover/probe:text-primary-foreground group-focus-visible/probe:border-primary group-focus-visible/probe:bg-primary group-focus-visible/probe:text-primary-foreground group-active/probe:scale-95 ${edge === 'start' ? 'left-0' : 'right-0'}`}
      >
        <GripVertical className="size-2.5 shrink-0" aria-hidden="true" />
        <span>{measure}</span>
      </span>
    </button>
  )
}

function updateLoopEdge(
  range: LoopRange,
  measures: MeasureTiming[],
  edge: LoopEdge,
  targetBeat: number,
) {
  const availableMeasures = edge === 'start'
    ? measures.filter((measure) => measure.number <= range.endMeasure)
    : measures.filter((measure) => measure.number >= range.startMeasure)
  const closest = availableMeasures.reduce((best, measure) => {
    const boundary = edge === 'start'
      ? measure.startBeat
      : measure.startBeat + measure.durationBeats
    const bestBoundary = edge === 'start'
      ? best.startBeat
      : best.startBeat + best.durationBeats
    return Math.abs(boundary - targetBeat) < Math.abs(bestBoundary - targetBeat) ? measure : best
  })
  return rangeWithEdge(range, closest, edge)
}

function moveLoopEdge(
  range: LoopRange,
  measures: MeasureTiming[],
  edge: LoopEdge,
  direction: number,
) {
  const currentIndex = (edge === 'start' ? range.startMeasure : range.endMeasure) - 1
  const limitIndex = (edge === 'start' ? range.endMeasure : range.startMeasure) - 1
  const nextIndex = edge === 'start'
    ? Math.min(limitIndex, Math.max(0, currentIndex + direction))
    : Math.max(limitIndex, Math.min(measures.length - 1, currentIndex + direction))
  if (nextIndex === currentIndex) return range
  return rangeWithEdge(range, measures[nextIndex], edge)
}

function rangeWithEdge(range: LoopRange, measure: MeasureTiming, edge: LoopEdge): LoopRange {
  return edge === 'start'
    ? { ...range, startBeat: measure.startBeat, startMeasure: measure.number }
    : {
        ...range,
        endBeat: measure.startBeat + measure.durationBeats,
        endMeasure: measure.number,
      }
}
