import { apiClient } from './client'

export const scoreApi = {
  listPieces: apiClient.listPieces,
  getPiece: apiClient.getPiece,
  getPieceScore: apiClient.getPieceScore,
  deletePiece: apiClient.deletePiece,
  importMidiFile: apiClient.importMidiFile,
  listWatchPaths: apiClient.listWatchPaths,
  selectWatchDirectories: apiClient.selectWatchDirectories,
  addWatchPath: apiClient.addWatchPath,
  addWatchPaths: apiClient.addWatchPaths,
  removeWatchPath: apiClient.removeWatchPath,
  refreshLocalLibrary: apiClient.refreshLocalLibrary,
}
