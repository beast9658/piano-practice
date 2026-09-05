import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Bot, Maximize2, Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { instrumentOutput } from '../api/instrument'
import { scoreApi } from '../api/score'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useSidebar } from '@/components/ui/sidebar'
import { AgentPanel } from '../features/agent/AgentPanel'
import { FallingNotes } from '../features/performance/FallingNotes'
import { MeasureProgress } from '../features/practice/MeasureProgress'
import { PlaybackCluster, TransportControls } from '../features/practice/TransportControls'
import { usePracticeStore } from '../features/practice/practiceStore'
import { usePracticeShortcuts } from '../features/practice/usePracticeShortcuts'
import { buildMeasureTimings } from '../features/practice/measureTiming'
import { PracticeRecordingStatus } from '../features/practice/ui/PracticeRecordingStatus'
import { PracticeSessionProvider } from '../features/practice/session/PracticeSessionProvider'
import type { LoopRange } from '../features/practice/practiceStore'
import type { PracticeMode, ScoreNote } from '../shared/types/domain'

export function PracticePage() {
  const navigate = useNavigate()
  const { mode: sidebarMode, setMode: setSidebarMode, toggleFullscreen } = useSidebar()
  const sessionPieceId = usePracticeStore((state) => state.session?.pieceId)
  const setBpm = usePracticeStore((state) => state.setBpm)
  const mode = usePracticeStore((state) => state.mode)
  const setMode = usePracticeStore((state) => state.setMode)
  const pausePlayback = usePracticeStore((state) => state.pausePlayback)
  const endSession = usePracticeStore((state) => state.endSession)
  const [consoleExpanded, setConsoleExpanded] = useState(true)
  const [agentPanelOpen, setAgentPanelOpen] = useState(false)
  const fullscreen = sidebarMode === 'fullscreen'

  const pieceId = sessionPieceId
  const { data: score, refetch: refetchScore } = useQuery({
    queryKey: ['piece-score', pieceId],
    queryFn: () => scoreApi.getPieceScore(pieceId ?? ''),
    enabled: Boolean(pieceId),
  })

  useEffect(() => {
    if (score?.tempoBpm) setBpm(score.tempoBpm)
  }, [score?.tempoBpm, setBpm])

  useEffect(() => {
    if (mode !== 'listen' && pieceId) void refetchScore()
  }, [mode, pieceId, refetchScore])

  const availableModes = useMemo(
    () => buildAvailableModes(score?.notes ?? []),
    [score?.notes],
  )
  const defaultLoopRange = useMemo(
    () => buildDefaultLoopRange(score?.totalBeats ?? 0, score?.timeSignature ?? '4/4'),
    [score?.timeSignature, score?.totalBeats],
  )
  const exitPractice = useCallback(() => {
    void instrumentOutput.stopAll().catch((error: unknown) => {
      console.error('Unable to stop audio output', error)
    })
    endSession()
    navigate('/library', { replace: true, viewTransition: true })
  }, [endSession, navigate])
  usePracticeShortcuts(
    availableModes,
    () => setAgentPanelOpen((open) => !open),
    toggleFullscreen,
    exitPractice,
    agentPanelOpen,
  )

  useEffect(() => {
    if (!availableModes.has(mode)) setMode('listen')
  }, [availableModes, mode, setMode])

  useEffect(() => () => pausePlayback(), [pausePlayback])
  useEffect(() => () => setSidebarMode('normal'), [setSidebarMode])

  if (!sessionPieceId) return <Navigate to="/library" replace />

  return (
    <PracticeSessionProvider score={score}>
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-30 shrink-0 border-b border-border bg-background/95 backdrop-blur-md">
        {consoleExpanded ? (
        <div className="relative flex min-h-16 items-center px-5 lg:px-8">
          <div className="flex min-w-0 max-w-[28%] items-center gap-3">
            <button
              type="button"
              onClick={exitPractice}
              className="grid size-8 shrink-0 place-items-center text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="结束练习并返回曲库"
              title="结束练习"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-muted-foreground">
                练习演奏
              </p>
              <h1 className="mt-1 truncate font-title text-lg font-bold tracking-tight text-foreground/90">
                {score?.title ?? '下落音符练习'}
              </h1>
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 max-[860px]:hidden">
            <PlaybackCluster defaultLoopRange={defaultLoopRange} />
          </div>

          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            <PracticeRecordingStatus />
            <div className="flex items-center gap-2 max-[860px]:hidden">
              <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
              <TransportControls compact availableModes={availableModes} />
            </div>
            <Sheet open={agentPanelOpen} onOpenChange={setAgentPanelOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="grid size-8 place-items-center border border-border text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
                  aria-label="打开智能助手"
                  title="打开智能助手"
                >
                  <Bot className="size-3.5" />
                </button>
              </SheetTrigger>
              <SheetContent className="gap-0 border-l border-border bg-background/95 p-0 text-foreground backdrop-blur-xl sm:max-w-md">
                <SheetHeader className="border-b border-border px-6 py-5">
                  <p className="text-[9px] font-bold tracking-[0.3em] text-muted-foreground">练习助手</p>
                  <SheetTitle className="font-title text-base text-foreground/90">演奏分析</SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground">练习辅助与演奏表现记录</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <AgentPanel score={score} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        ) : null}

        {consoleExpanded ? (
          <div className="hidden border-t border-border px-5 py-3 max-[860px]:block">
            <div className="flex items-center gap-2">
              <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
              <TransportControls compact availableModes={availableModes} />
            </div>
          </div>
        ) : null}
        <MeasureProgress
          score={score}
          expanded={consoleExpanded}
          onToggleExpanded={() => setConsoleExpanded((expanded) => !expanded)}
        />
      </header>

      <main className="min-h-0 flex-1">
        <FallingNotes score={score} />
      </main>
    </div>
    </PracticeSessionProvider>
  )
}

function FullscreenButton({ fullscreen, onToggle }: { fullscreen: boolean; onToggle: () => void }) {
  const Icon = fullscreen ? Minimize2 : Maximize2
  const label = fullscreen ? '退出全屏练习' : '进入全屏练习'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={fullscreen}
      aria-label={`${label}，快捷键 Ctrl+F`}
      title={`${label} (Ctrl+F)`}
      className="grid size-8 shrink-0 place-items-center border border-border text-muted-foreground outline-none transition hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Icon className="size-3.5" />
    </button>
  )
}

function buildDefaultLoopRange(totalBeats: number, timeSignature: string): LoopRange | null {
  if (totalBeats <= 0) return null
  const measures = buildMeasureTimings(totalBeats, timeSignature)
  return {
    startBeat: 0,
    endBeat: totalBeats,
    startMeasure: 1,
    endMeasure: measures.at(-1)?.number ?? 1,
  }
}

function buildAvailableModes(notes: ScoreNote[]) {
  const modes = new Set<PracticeMode>(['listen', 'free'])
  if (notes.some((note) => note.hand === 'left')) modes.add('left-hand')
  if (notes.some((note) => note.hand === 'right')) modes.add('right-hand')
  if (notes.length > 0) modes.add('both-hands')
  return modes
}
