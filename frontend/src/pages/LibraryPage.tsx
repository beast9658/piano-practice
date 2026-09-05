import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Info, Library, RefreshCw, Upload, X } from 'lucide-react'
import { scoreApi } from '../api/score'
import { PieceCard } from '../features/library/PieceCard'
import { LiteraryNotesBackground } from '../components/media/LiteraryNotesBackground'
import type { Piece } from '../shared/types/domain'

const midiAccept = '.mid,.midi,audio/midi,audio/x-midi'

export function LibraryPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmingPieceId, setConfirmingPieceId] = useState<string | null>(null)

  const { data: pieces = [], isError, error, refetch } = useQuery({
    queryKey: ['pieces'],
    queryFn: scoreApi.listPieces,
  })

  const importFiles = useMutation({
    mutationFn: async (files: File[]) => {
      const results: Piece[] = []
      for (const file of files) {
        const imported = await scoreApi.importMidiFile(file)
        results.push(imported as Piece)
      }
      return results
    },
    onSuccess: (imported) => {
      setMessage(
        imported.length === 1
          ? `已导入《${imported[0]?.title ?? ''}》`
          : `已导入 ${imported.length} 个 MIDI 文件`,
      )
      void queryClient.invalidateQueries({ queryKey: ['pieces'] })
      void queryClient.invalidateQueries({ queryKey: ['piece-score'] })
    },
    onError: (importError) => {
      setMessage(importError instanceof Error ? importError.message : '导入失败')
    },
  })

  const removePiece = useMutation({
    mutationFn: (piece: Piece) => scoreApi.deletePiece(piece.id),
    onMutate: async (removedPiece) => {
      await queryClient.cancelQueries({ queryKey: ['pieces'] })
      const previousPieces = queryClient.getQueryData<Piece[]>(['pieces'])
      queryClient.setQueryData<Piece[]>(
        ['pieces'],
        (current) => current?.filter((piece) => piece.id !== removedPiece.id) ?? [],
      )
      return { previousPieces }
    },
    onSuccess: (_result, removedPiece) => {
      setConfirmingPieceId(null)
      setMessage('已从曲库中移除。')
      queryClient.removeQueries({ queryKey: ['piece-score', removedPiece.id] })
    },
    onError: (removeError, _removedPiece, context) => {
      if (context?.previousPieces) {
        queryClient.setQueryData(['pieces'], context.previousPieces)
      }
      setMessage(removeError instanceof Error ? removeError.message : '移除失败')
    },
  })

  const requestRemove = (piece: Piece) => {
    if (confirmingPieceId === piece.id) {
      removePiece.mutate(piece)
      return
    }
    setConfirmingPieceId(piece.id)
    setMessage(null)
  }

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setMessage(null)
    importFiles.mutate(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const queryErrorMessage = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '同步故障'

  return (
    <div
      className="relative flex h-full w-full overflow-hidden bg-background font-sans text-foreground/90"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        handleFilesSelected(event.dataTransfer.files)
      }}
    >
      <LiteraryNotesBackground className="pointer-events-none absolute inset-0 size-full text-foreground" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-background/70 to-background/20" />

      <div className="relative z-10 flex size-full justify-between pl-14 pr-14 xl:pl-20 xl:pr-20">
        <main className="flex h-full w-[40%] min-w-[360px] max-w-[480px] shrink-0 flex-col py-16 pr-8">
          <div className="flex flex-col">
            <div className="ink-reveal mb-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.5em] text-muted-foreground">
              <span className="block h-[1px] w-6 bg-foreground/10" />
              <span>个人琴房 · Piano</span>
            </div>
            <h1 className="ink-reveal ink-reveal-delay-1 font-title text-6xl font-semibold leading-none tracking-[0.04em] text-foreground sm:text-7xl">
              琴 谱
              <span className="mt-2 block text-[15px] font-normal tracking-[0.7em] text-muted-foreground sm:text-base">
                PIANO PRACTICE
              </span>
            </h1>
            <p className="ink-reveal ink-reveal-delay-2 mt-7 max-w-sm text-sm font-medium leading-7 tracking-wide text-muted-foreground">
              把谱面留在此处，像翻开一本乐谱那样开始练习。
              <br />
              导入一首 MIDI，琴声便会落进这间纸上的琴房。
            </p>
          </div>

          <section className="mt-auto flex w-full flex-col gap-7">
            <div className="ink-reveal ink-reveal-delay-3 flex items-end justify-between gap-5">
              <div className="min-w-0">
                <h2 className="font-title text-lg font-bold tracking-tight text-foreground">
                  导入新谱
                </h2>
                <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-muted-foreground">
                  从电脑里取一份 .mid / .midi 乐谱
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={midiAccept}
                multiple
                className="hidden"
                onChange={(event) => handleFilesSelected(event.target.files)}
              />
              <button
                type="button"
                disabled={importFiles.isPending}
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 shrink-0 items-center justify-center gap-2 border border-foreground/30 bg-transparent px-4 text-[10px] font-bold uppercase tracking-widest text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60"
              >
                <Upload className="size-3.5" />
                <span>{importFiles.isPending ? '导入中…' : '导入 MIDI'}</span>
              </button>
            </div>

            {(message || isError) && (
              <div className="flex items-start gap-2.5 text-[11px] leading-relaxed">
                <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/80" />
                <p className="flex-1 text-muted-foreground">{message || queryErrorMessage}</p>
                {message && (
                  <button
                    type="button"
                    onClick={() => setMessage(null)}
                    className="opacity-40 hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            )}

            <footer className="flex items-center justify-between pt-1">
              <button
                type="button"
                disabled={importFiles.isPending}
                onClick={() => {
                  setMessage(null)
                  void refetch()
                }}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw className="size-3.5" />
                <span>刷新曲库</span>
              </button>
              <div className="flex items-baseline gap-2 uppercase">
                <span className="font-title text-xl font-bold text-foreground">{pieces.length}</span>
                <span className="text-[9px] font-bold tracking-[0.22em] text-muted-foreground">份乐谱</span>
              </div>
            </footer>
          </section>
        </main>

        <aside className="flex h-full w-[360px] shrink-0 flex-col py-16 xl:w-[400px]">
          <header className="flex shrink-0 items-center justify-between pb-6 border-b border-border/20">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-muted-foreground/70">
                Repertoire
              </p>
              <h2 className="mt-1.5 font-title text-2xl font-semibold tracking-[0.12em] text-foreground/90">
                谱架
              </h2>
            </div>
            <span className="rounded-full bg-foreground/[0.03] px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground border border-border/20">
              {pieces.length} 首
            </span>
          </header>

          <div className="flex-1 overflow-y-auto no-scrollbar pt-6">
            {pieces.length > 0 ? (
              <div className="flex flex-col gap-4">
                {pieces.map((piece) => (
                  <PieceCard
                    key={piece.id}
                    piece={piece}
                    onRemove={requestRemove}
                    onCancelRemove={() => setConfirmingPieceId(null)}
                    confirmingRemove={confirmingPieceId === piece.id}
                    removing={
                      removePiece.isPending &&
                      removePiece.variables?.id === piece.id
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center opacity-60">
                <div className="mb-6 rounded-full border border-border bg-foreground/[0.03] p-4">
                  <Library className="size-6 text-muted-foreground" />
                </div>
                <h3 className="font-title text-base tracking-[0.2em] text-foreground/60">
                  曲库空白
                </h3>
                <p className="mt-3 max-w-[220px] text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                  点击左侧「导入 MIDI」<br />
                  或直接把文件拖进窗口
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
