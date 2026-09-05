import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { scoreApi } from '../api/score'
import { usePracticeStore } from '../features/practice/practiceStore'

export function PieceDetailPage() {
  const navigate = useNavigate()
  const startSession = usePracticeStore((state) => state.startSession)
  const { pieceId = '' } = useParams()
  const { data: piece } = useQuery({
    queryKey: ['piece', pieceId],
    queryFn: () => scoreApi.getPiece(pieceId),
  })

  if (!piece) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="p-6 max-[720px]:p-4">
      <Link className="text-sm font-bold text-muted-foreground hover:text-foreground" to="/library" viewTransition>
        返回曲库
      </Link>
      <header className="mt-5 rounded-lg bg-card p-5 shadow-medium">
        <p className="text-xs font-bold uppercase tracking-[1.8px] text-muted-foreground">
          Piece Detail
        </p>
        <h1 className="mt-2 font-title text-2xl font-bold text-foreground">
          {piece.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{piece.composer}</p>
      </header>

      <section className="mt-4 grid grid-cols-[1fr_18rem] gap-4 max-[900px]:grid-cols-1">
        <div className="rounded-lg bg-card p-5 shadow-medium">
          <h2 className="font-title text-lg font-bold text-foreground">错误热点</h2>
          <div className="mt-4 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-1">
            {Array.from({ length: 24 }, (_, index) => {
              const measure = index + 1
              const isHot = piece.mistakeHotspots.includes(measure)
              return (
                <div
                  key={measure}
                  className={[
                    'grid aspect-square place-items-center rounded-sm text-xs font-bold',
                    isHot
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground',
                  ].join(' ')}
                >
                  {measure}
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-lg bg-card p-5 shadow-medium">
          <h2 className="font-title text-lg font-bold text-foreground">练习设置</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">调性</dt>
              <dd className="font-bold text-foreground">{piece.keySignature}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">目标速度</dt>
              <dd className="font-bold text-foreground">{piece.bpm} BPM</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">最近练习</dt>
              <dd className="font-bold text-foreground">{piece.lastPracticedAt}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => {
              startSession({ id: piece.id, title: piece.title })
              navigate('/practice', { viewTransition: true })
            }}
            className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-bold uppercase tracking-[1.4px] text-primary-foreground hover:bg-primary-hover"
          >
            开始练习
          </button>
        </div>
      </section>
    </div>
  )
}
