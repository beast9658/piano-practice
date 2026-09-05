type RpcResponse<T> = {
  id?: unknown
  ok: boolean
  result?: T
  error?: string
}

let nextRequestId = 1

const apiBase = (import.meta.env.VITE_PIANO_API_BASE as string | undefined) ?? ''

export async function requestRpc<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${apiBase}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: String(nextRequestId),
      method,
      params,
    }),
  })
  if (!response.ok) {
    throw new Error(`后端请求失败：HTTP ${response.status}`)
  }
  const payload = await response.json() as RpcResponse<T>
  if (!payload.ok) {
    throw new Error(payload.error ?? '未知后端错误')
  }
  return payload.result as T
}

export async function uploadMidiFile(file: File): Promise<Record<string, unknown>> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize))),
    )
  }
  const content = btoa(chunks.join(''))
  return requestRpc<Record<string, unknown>>('music_import_midi_bytes', {
    file_name: file.name,
    content,
  })
}
