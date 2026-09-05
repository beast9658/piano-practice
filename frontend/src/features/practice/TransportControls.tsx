import { ChevronDown, Ear, Gauge, Hand, KeyboardMusic, Pause, Play, Repeat2, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import type { PracticeMode } from '../../shared/types/domain'
import { usePracticeStore, type LoopRange } from './practiceStore'

const modes: Array<{ value: PracticeMode; label: string; description: string; icon: LucideIcon }> = [
  { value: 'listen', label: '聆听', description: '完整自动演奏', icon: Ear },
  { value: 'free', label: '自由', description: '不跟随曲谱进度', icon: KeyboardMusic },
  { value: 'right-hand', label: '右手', description: '右手等待输入', icon: Hand },
  { value: 'left-hand', label: '左手', description: '左手等待输入', icon: Hand },
  { value: 'both-hands', label: '双手', description: '全部音符等待输入', icon: Users },
]

export function PlaybackCluster({ defaultLoopRange }: { defaultLoopRange: LoopRange | null }) {
  const bpm = usePracticeStore((state) => state.bpm)
  const isPlaying = usePracticeStore((state) => state.isPlaying)
  const loopEnabled = usePracticeStore((state) => state.loopEnabled)
  const mode = usePracticeStore((state) => state.mode)
  const setBpm = usePracticeStore((state) => state.setBpm)
  const togglePlayback = usePracticeStore((state) => state.togglePlayback)
  const toggleLoop = usePracticeStore((state) => state.toggleLoop)
  const timedMode = mode !== 'free'

  return (
    <div className="flex h-11 items-center gap-2">
      <HoverPopover
        trigger={
          <button type="button" disabled={!timedMode} className="grid size-9 place-items-center text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-20" aria-label={`调整速度，当前每分钟 ${bpm} 拍`}>
            <Gauge className="size-4" />
          </button>
        }
      >
        <div className="w-64 p-4">
          <div className="flex items-end justify-between border-b border-border pb-3">
            <div><p className="text-[9px] font-bold tracking-[0.24em] text-muted-foreground">演奏速度</p><p className="mt-1 text-[10px] text-muted-foreground">拖动滑块调整每分钟拍数</p></div>
            <span className="font-title text-xl font-bold tabular-nums">{bpm}</span>
          </div>
          <Slider className="mt-4" min={40} max={140} step={1} value={[bpm]} onValueChange={([value]) => setBpm(value)} aria-label="演奏速度" />
          <div className="mt-1 flex justify-between text-[8px] font-bold text-muted-foreground"><span>40</span><span>140</span></div>
        </div>
      </HoverPopover>

      <button type="button" onClick={togglePlayback} disabled={!timedMode} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_16px_color-mix(in_srgb,var(--primary)_18%,transparent)] transition hover:scale-105 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none" aria-label={timedMode ? (isPlaying ? '暂停' : '播放') : '自由模式不自动播放'}>
        {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
      </button>

      <button
        type="button"
        disabled={!timedMode || !defaultLoopRange}
        onClick={() => defaultLoopRange && toggleLoop(defaultLoopRange)}
        aria-pressed={loopEnabled}
        aria-label={loopEnabled ? '关闭循环练习' : '开启循环练习'}
        title={loopEnabled ? '关闭循环练习' : '开启循环练习'}
        className={`grid size-9 place-items-center outline-none transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-20 ${loopEnabled ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Repeat2 className="size-4" />
      </button>
    </div>
  )
}

export function TransportControls({ availableModes = defaultModes }: { compact?: boolean; availableModes?: ReadonlySet<PracticeMode> }) {
  const mode = usePracticeStore((state) => state.mode)
  const setMode = usePracticeStore((state) => state.setMode)
  const currentMode = modes.find((item) => item.value === mode) ?? modes[0]
  const CurrentModeIcon = currentMode.icon

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-8 w-[108px] items-center gap-2 border border-border bg-foreground/[0.04] px-2.5 text-[10px] font-bold text-foreground/85 transition hover:border-foreground/50 hover:bg-foreground/[0.08]" aria-label={`切换练习模式，当前${currentMode.label}`}>
          <ModeIcon icon={CurrentModeIcon} hand={mode === 'left-hand' ? '左' : mode === 'right-hand' ? '右' : undefined} />
          <span className="min-w-0 flex-1 truncate text-left">{currentMode.label}</span><ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="border-b border-border px-1 pb-3"><p className="text-[9px] font-bold tracking-[0.24em] text-muted-foreground">练习模式</p><p className="mt-1 text-[10px] text-muted-foreground">选择自动演奏与等待输入的方式</p></div>
        <div className="mt-3 grid border-l border-t border-border" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {modes.map((item) => {
            const disabled = !availableModes.has(item.value)
            const ItemIcon = item.icon
            return (
              <button key={item.value} type="button" disabled={disabled} onClick={() => setMode(item.value)} className={`flex h-16 items-center gap-3 border-b border-r border-border px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-20 ${mode === item.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`} style={item.value === 'both-hands' ? { gridColumn: '1 / -1' } : undefined}>
                <ModeIcon icon={ItemIcon} hand={item.value === 'left-hand' ? '左' : item.value === 'right-hand' ? '右' : undefined} size="large" />
                <span className="grid min-w-0 gap-1"><span className="text-[11px] font-bold tracking-wider">{item.label}</span><span className={`truncate text-[9px] ${mode === item.value ? 'text-background/70' : 'text-muted-foreground'}`}>{item.description}</span></span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function HoverPopover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true) }
  const hide = () => { closeTimer.current = setTimeout(() => setOpen(false), 140) }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span onMouseEnter={show} onMouseLeave={hide}><PopoverTrigger asChild>{trigger}</PopoverTrigger></span>
      <PopoverContent side="bottom" align="center" className="p-0" onMouseEnter={show} onMouseLeave={hide} onOpenAutoFocus={(event) => event.preventDefault()}>{children}</PopoverContent>
    </Popover>
  )
}

function ModeIcon({ icon: Icon, hand, size = 'small' }: { icon: LucideIcon; hand?: '左' | '右'; size?: 'small' | 'large' }) {
  return <span className={`relative grid shrink-0 place-items-center ${size === 'large' ? 'size-6' : 'size-4'}`}><Icon className={size === 'large' ? 'size-5' : 'size-4'} />{hand ? <span className="absolute -bottom-1 -right-1 grid size-3 place-items-center bg-current text-[7px] font-bold"><span className="text-background">{hand}</span></span> : null}</span>
}

const defaultModes: ReadonlySet<PracticeMode> = new Set(['listen', 'free'])
