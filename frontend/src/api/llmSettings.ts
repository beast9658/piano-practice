import { requestRpc } from './http'

export type LlmSettings = {
  baseUrl: string
  model: string
  updatedAt: string
  apiKeyConfigured: boolean
}

export type LlmConnectionResult = {
  connected: boolean
  model: string
  latencyMs: number
}

export type LlmSettingsInput = {
  baseUrl: string
  model: string
  apiKey: string
}

export const llmSettingsApi = {
  get() {
    return requestRpc<LlmSettings>('llm_get_settings')
  },
  save(input: LlmSettingsInput) {
    return requestRpc<LlmSettings>('llm_save_settings', {
      base_url: input.baseUrl,
      model: input.model,
      api_key: input.apiKey,
    })
  },
  clearApiKey() {
    return requestRpc<{ apiKeyConfigured: boolean }>('llm_clear_api_key')
  },
  testConnection(input: LlmSettingsInput) {
    return requestRpc<LlmConnectionResult>('llm_test_connection', {
      base_url: input.baseUrl,
      model: input.model,
      api_key: input.apiKey,
    })
  },
}
