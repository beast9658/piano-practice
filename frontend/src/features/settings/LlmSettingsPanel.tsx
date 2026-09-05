import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  PlugZap,
  Save,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import {
  llmSettingsApi,
  type LlmConnectionResult,
  type LlmSettings,
  type LlmSettingsInput,
} from '../../api/llmSettings'
import { cn } from '@/lib/utils'

const deepSeekBaseUrl = 'https://api.deepseek.com'

const modelPresets = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat', model: 'deepseek-chat' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', model: 'deepseek-reasoner' },
] as const

export function LlmSettingsPanel() {
  const settingsQuery = useQuery({
    queryKey: ['llm-settings'],
    queryFn: llmSettingsApi.get,
  })

  return (
    <section aria-label="DeepSeek 模型配置" className="px-8 py-7 max-[720px]:px-5">
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-4 text-[9px] font-bold text-muted-foreground">
        <span>DeepSeek</span>
        <span className={settingsQuery.data?.apiKeyConfigured ? 'text-primary' : undefined}>
          密钥 · {settingsQuery.data?.apiKeyConfigured ? '后端已加密' : '未配置'}
        </span>
      </div>

      {settingsQuery.data ? (
        <LlmSettingsForm initialSettings={settingsQuery.data} />
      ) : settingsQuery.isError ? (
        <StatusLine tone="error" message={errorMessage(settingsQuery.error)} />
      ) : (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-label="正在读取模型配置" />
        </div>
      )}
    </section>
  )
}

function LlmSettingsForm({ initialSettings }: { initialSettings: LlmSettings }) {
  const queryClient = useQueryClient()
  const [baseUrl] = useState(deepSeekBaseUrl)
  const [model, setModel] = useState(
    modelPresets.some((preset) => preset.model === initialSettings.model)
      ? initialSettings.model
      : modelPresets[0].model,
  )
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  const saveMutation = useMutation({
    mutationFn: (input: LlmSettingsInput) => llmSettingsApi.save(input),
    onSuccess: (settings) => {
      setApiKey('')
      queryClient.setQueryData(['llm-settings'], settings)
    },
  })
  const testMutation = useMutation({
    mutationFn: (input: LlmSettingsInput) => llmSettingsApi.testConnection(input),
  })
  const clearKeyMutation = useMutation({
    mutationFn: llmSettingsApi.clearApiKey,
    onSuccess: () => {
      setApiKey('')
      queryClient.setQueryData<LlmSettings>(['llm-settings'], (settings) =>
        settings ? { ...settings, apiKeyConfigured: false } : settings,
      )
    },
  })

  const input = (): LlmSettingsInput => ({
    baseUrl,
    model,
    apiKey: apiKey.trim(),
  })
  const activePreset = modelPresets.find(
    (preset) => baseUrl === deepSeekBaseUrl && preset.model === model,
  )?.id
  const busy = saveMutation.isPending || testMutation.isPending || clearKeyMutation.isPending

  const selectModel = (nextModel: string) => {
    setModel(nextModel)
    saveMutation.reset()
    testMutation.reset()
    clearKeyMutation.reset()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    testMutation.reset()
    clearKeyMutation.reset()
    saveMutation.mutate(input())
  }

  const testConnection = () => {
    saveMutation.reset()
    clearKeyMutation.reset()
    testMutation.mutate(input())
  }

  const clearApiKey = () => {
    saveMutation.reset()
    testMutation.reset()
    clearKeyMutation.mutate()
  }

  return (
    <form onSubmit={submit} className="max-w-3xl">
      <fieldset disabled={busy}>
        <legend className="text-[9px] font-bold tracking-[0.28em] text-muted-foreground">模型</legend>
        <div className="mt-2 grid grid-cols-2 gap-px border border-border bg-border max-[620px]:grid-cols-1">
          {modelPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={activePreset === preset.id}
              onClick={() => selectModel(preset.model)}
              className={cn(
                'h-11 bg-background px-3 text-[10px] font-bold outline-none transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary',
                activePreset === preset.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="API Key" icon={KeyRound} className="mt-6">
        <div className="flex">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            disabled={busy}
            autoComplete="new-password"
            placeholder={initialSettings.apiKeyConfigured ? '已保存，留空则保持不变' : '输入 API Key'}
            className="h-11 min-w-0 flex-1 border border-r-0 border-border bg-background px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowApiKey((visible) => !visible)}
            disabled={busy}
            aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
            title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
            className="grid size-11 shrink-0 place-items-center border border-border text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </Field>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 border border-primary bg-primary px-4 text-[10px] font-bold text-primary-foreground outline-none transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
        >
          {saveMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存配置
        </button>
        <button
          type="button"
          disabled={busy || (!apiKey.trim() && !initialSettings.apiKeyConfigured)}
          onClick={testConnection}
          className="inline-flex h-9 items-center gap-2 border border-border px-4 text-[10px] font-bold text-muted-foreground outline-none transition hover:border-foreground/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
        >
          {testMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
          测试连接
        </button>
        {initialSettings.apiKeyConfigured ? (
          <button
            type="button"
            disabled={busy}
            onClick={clearApiKey}
            aria-label="移除已保存的 API Key"
            title="移除已保存的 API Key"
            className="ml-auto grid size-9 place-items-center border border-border text-muted-foreground outline-none transition hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      <MutationStatus
        saveMutation={saveMutation}
        testMutation={testMutation}
        clearKeyMutation={clearKeyMutation}
        selectedModel={model}
      />
    </form>
  )
}

function Field({
  label,
  icon: Icon,
  className,
  children,
}: {
  label: string
  icon: LucideIcon
  className?: string
  children: ReactNode
}) {
  return (
    <label className={className}>
      <span className="mb-2 flex items-center gap-2 text-[9px] font-bold tracking-[0.22em] text-muted-foreground">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </span>
      {children}
    </label>
  )
}

function MutationStatus({
  saveMutation,
  testMutation,
  clearKeyMutation,
  selectedModel,
}: {
  saveMutation: UseMutationResult<LlmSettings, Error, LlmSettingsInput>
  testMutation: UseMutationResult<LlmConnectionResult, Error, LlmSettingsInput>
  clearKeyMutation: UseMutationResult<{ apiKeyConfigured: boolean }, Error, void>
  selectedModel: string
}) {
  const error = saveMutation.error ?? testMutation.error ?? clearKeyMutation.error
  if (error) return <StatusLine tone="error" message={errorMessage(error)} />
  if (testMutation.data) {
    return (
      <StatusLine
        tone="success"
        message={`连接正常 · 已请求 ${selectedModel} · ${testMutation.data.latencyMs}ms`}
      />
    )
  }
  if (saveMutation.data) {
    return (
      <StatusLine
        tone="success"
        message={saveMutation.data.apiKeyConfigured
          ? '模型配置已保存 · API Key 已加密保存在后端本地数据库'
          : '模型配置已保存 · API Key 尚未配置'}
      />
    )
  }
  if (clearKeyMutation.isSuccess) return <StatusLine tone="success" message="API Key 已移除" />
  return null
}

function StatusLine({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  return (
    <p className={cn(
      'mt-4 flex items-start gap-2 border-l-2 px-3 py-2 text-[10px] leading-5',
      tone === 'success'
        ? 'border-primary bg-primary/5 text-foreground/70'
        : 'border-destructive bg-destructive/5 text-destructive',
    )}>
      {tone === 'success' ? <Check className="mt-1 size-3 shrink-0" /> : null}
      {message}
    </p>
  )
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '模型配置操作失败'
}
