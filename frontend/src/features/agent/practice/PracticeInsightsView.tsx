import { useQuery } from '@tanstack/react-query'
import { Activity, Clock3, Gauge, Target } from 'lucide-react'
import { practiceApi } from '../../../api/practice'
import { usePracticeStore } from '../../practice/practiceStore'
import { usePracticeSessionStatus } from '../../practice/session/PracticeSessionProvider'

export function PracticeInsightsView({ pieceId }: { pieceId: string }) {
  const loopRange = usePracticeStore((state) => state.loopRange)
  const loopEnabled = usePracticeStore((state) => state.loopEnabled)
  const { snapshot } = usePracticeSessionStatus()
  const sessionsQuery = useQuery({
    queryKey: ['practice-sessions', pieceId],
    queryFn: () => practiceApi.listSessions(pieceId, 20),
    enabled: Boolean(pieceId),
  })
  const sessions = sessionsQuery.data ?? []
  const recent = sessions.slice(0, 5)
  const accuracyValues = recent
    .map((session) => session.summary.accuracy)
    .filter((value): value is number => value !== null)
  const recentAccuracy = accuracyValues.length > 0
    ? accuracyValues.reduce((total, value) => total + value, 0) / accuracyValues.length
    : null
  const averageDelayValues = recent
    .map((session) => session.summary.averageWaitDelayMs)
    .filter((value): value is number => value !== null)
  const recentDelay = averageDelayValues.length > 0
    ? Math.round(averageDelayValues.reduce((total, value) => total + value, 0) / averageDelayValues.length)
    : null

  return (
    <div>
      <section className="border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold tracking-[0.22em] text-muted-foreground">当前练习范围</p>
            <p className="mt-1 text-sm font-bold text-foreground/90">
              {loopEnabled && loopRange
                ? `第 ${loopRange.startMeasure}-${loopRange.endMeasure} 小节`
                : '全曲自由范围'}
            </p>
          </div>
          <span className={`mt-1 size-2 ${snapshot.recording ? 'bg-primary' : 'bg-foreground/20'}`} />
        </div>
        <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
          普通练习只观察演奏表现，不将结果归因到屏幕上的即时指法。
        </p>
      </section>

      <dl className="grid grid-cols-2 gap-px border-b border-border bg-border">
        <Metric icon={Activity} label="最近记录" value={`${sessions.length}`} />
        <Metric icon={Gauge} label="近期准确" value={recentAccuracy === null ? '—' : `${Math.round(recentAccuracy * 100)}%`} />
        <Metric icon={Clock3} label="平均等待" value={recentDelay === null ? '—' : `${recentDelay}ms`} />
        <Metric icon={Target} label="本次按键" value={`${snapshot.noteCount}`} />
      </dl>

      <section aria-labelledby="practice-observation-title" className="border-b border-border px-4 py-4">
        <p className="text-[9px] font-bold tracking-[0.22em] text-muted-foreground">练习观察</p>
        <h3 id="practice-observation-title" className="mt-1 text-xs font-bold text-foreground/90">
          {observationText(recentAccuracy, recentDelay, sessions.length)}
        </h3>
      </section>

      <section aria-label="最近练习记录">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground">最近记录</span>
          <span className="text-[9px] text-muted-foreground">最多显示 5 次</span>
        </div>
        {sessionsQuery.isLoading ? (
          <p className="px-4 py-8 text-center text-[10px] text-muted-foreground">正在读取练习记录</p>
        ) : recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-[10px] text-muted-foreground">尚无已保存的练习</p>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((session) => (
              <div key={session.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-foreground/85">
                    {formatScope(session.scope, session.startBeat, session.endBeat)}
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {new Date(session.startedAt).toLocaleString()} · {session.initialBpm} BPM
                  </p>
                </div>
                <div className="text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                  <p>{session.summary.accuracy === null ? '—' : `${Math.round(session.summary.accuracy * 100)}%`}</p>
                  <p className="mt-1">{session.summary.noteCount} 键</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="bg-background px-4 py-3">
      <dt className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 font-mono text-base font-bold tabular-nums text-foreground/80">{value}</dd>
    </div>
  )
}

function observationText(accuracy: number | null, delay: number | null, count: number) {
  if (count === 0) return '完成一次显式记录后，这里会形成你的近期基线。'
  if (accuracy !== null && accuracy < 0.8) return '先缩小循环范围，稳定音高匹配，再提高速度。'
  if (delay !== null && delay > 180) return '音高已经较稳定，下一步优先减少落键后的等待。'
  return '近期表现稳定，可以逐步扩大范围或小幅提高速度。'
}

function formatScope(
  scope: { startMeasure?: number; endMeasure?: number },
  startBeat: number | null,
  endBeat: number | null,
) {
  if (scope.startMeasure && scope.endMeasure) {
    return `第 ${scope.startMeasure}-${scope.endMeasure} 小节`
  }
  if (startBeat === null || endBeat === null) return '未形成有效节拍范围'
  return `节拍 ${startBeat.toFixed(1)}-${endBeat.toFixed(1)}`
}
