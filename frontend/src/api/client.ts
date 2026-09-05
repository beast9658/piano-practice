import type {
  MidiScanReport,
  Piece,
  PieceScore,
} from '../shared/types/domain'
import { requestRpc, uploadMidiFile } from './http'

export const apiClient = {
  getStorageInfo() {
    return requestRpc<{ databasePath: string; dataDirectory: string }>('app_get_storage_info')
  },
  listPieces() {
    return requestRpc<Piece[]>('music_list_pieces')
  },
  getPiece(pieceId: string) {
    return requestRpc<Piece>('music_get_piece', { piece_id: pieceId })
  },
  getPieceScore(pieceId: string) {
    return requestRpc<PieceScore>('music_get_piece_score', { piece_id: pieceId })
  },
  deletePiece(pieceId: string) {
    return requestRpc<{ deleted: boolean }>('music_delete_piece', { piece_id: pieceId })
  },
  listWatchPaths() {
    return requestRpc<{ paths: string[] }>('music_list_watch_paths')
  },
  selectWatchDirectories() {
    return Promise.resolve([])
  },
  addWatchPath(path: string) {
    return requestRpc<MidiScanReport>('music_add_watch_path', { path })
  },
  addWatchPaths(paths: string[]) {
    return requestRpc<MidiScanReport>('music_add_watch_paths', { paths })
  },
  removeWatchPath(path: string) {
    return requestRpc<{ removed: boolean }>('music_remove_watch_path', { path })
  },
  refreshLocalLibrary() {
    return requestRpc<MidiScanReport>('music_refresh_library')
  },
  async importMidiFile(file: File) {
    return uploadMidiFile(file)
  },
}
