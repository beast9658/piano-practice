import { Activity, CircleStop, Gauge, Piano, Radio, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePracticeSessionStatus } from '../session/PracticeSessionProvider'
import { usePracticeStore } from '../practiceStore'

export function PracticeRecordingStatus() {
  const {
    snapshot,
    saveError,
    canRecord,
    startRecording,
    stopRecording,
  } = usePracticeSessionStatus()
  const mode = usePracticeStore((state) => state.mode)
  const accuracy = snapshot.accuracy === null ? null : Math.round(snapshot.accuracy * 100)

  if ((mode === 'listen' || mode === 'free') && !snapshot.recording) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-2 border border-border px-2.5 text-[9px] font-bold tracking-[0.16em] text-muted-foreground outline-none transition hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`打开演奏记录，已记录 ${snapshot.noteCount} 个按键`}
          title="打开演奏记录"
        >
          <span className="relative grid size-3 place-items-center" aria-hidden="true">
            <span className={`size-1.5 ${saveError ? 'bg-destructive' : snapshot.recording ? 'bg-primary' : 'bg-foreground/25'}`} />
            {snapshot.recording ? <span className="absolute size-3 animate-ping border border-primary/50" /> : null}
          </span>
          <span className="max-[620px]:hidden">记录</span>
          <span className="font-mono tabular-nums text-foreground/75">{snapshot.noteCount}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] text-muted-foreground">演奏事件</p>
            <p className="mt-1 text-xs font-bold text-foreground/85">
              {snapshot.recording ? '正在记录本次练习' : '尚未开始记录'}
            </p>
          </div>
          <Activity className="mt-0.5 size-4 text-primary" aria-hidden="true" />
        </div>

        <dl className="grid grid-cols-2 gap-px bg-border">
          <Metric icon={Piano} label="按键" value={`${snapshot.noteCount}`} />
          <Metric icon={Gauge} label="音高正确" value={accuracy === null ? '—' : `${accuracy}%`} />
          <Metric icon={Activity} label="提前" value={`${snapshot.earlyCount}`} />
          <Metric icon={Activity} label="延迟" value={`${snapshot.delayedCount}`} />
          <Metric icon={Gauge} label="平均等待" value={snapshot.averageWaitDelayMs === null ? '—' : `${snapshot.averageWaitDelayMs}ms`} />
          <Metric icon={Waves} label="平均力度" value={snapshot.averageVelocity?.toString() ?? '—'} />
        </dl>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[9px] font-bold tracking-wider text-muted-foreground">
          <span>{snapshot.pedalDown ? '延音踏板已踩下' : `踏板变化 ${snapshot.pedalChangeCount}`}</span>
          <span className="font-mono tabular-nums">{formatElapsed(snapshot.elapsedMs)}</span>
        </div>
        {saveError ? (
          <p className="border-t border-border px-4 py-3 text-[10px] leading-5 text-destructive">
            本地保存异常：{saveError}
          </p>
        ) : null}
        <div className="border-t border-border p-3">
          <button
            type="button"
            disabled={!snapshot.recording && !canRecord}
            onClick={() => {
              if (snapshot.recording) void stopRecording()
              else startRecording()
            }}
            className={`flex h-9 w-full items-center justify-center gap-2 border text-[10px] font-bold tracking-[0.16em] outline-none transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-35 ${snapshot.recording ? 'border-destructive/50 text-destructive hover:bg-destructive/10' : 'border-primary/50 text-primary hover:bg-primary/10'}`}
          >
            {snapshot.recording ? <CircleStop className="size-3.5" /> : <Radio className="size-3.5" />}
            {snapshot.recording ? '结束并保存' : '开始记录'}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="bg-background px-4 py-3">
      <dt className="flex items-center gap-2 text-[9px] font-bold tracking-[0.16em] text-muted-foreground">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 font-mono text-base font-bold tabular-nums text-foreground/80">{value}</dd>
    </div>
  )
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
