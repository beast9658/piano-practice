import { Bot, Database, FolderCog, HardDrive, Languages, Laptop, Moon, Palette, Piano, ShieldCheck, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { InputDeviceControl } from '../features/instrument/input/InputDeviceControl'
import { LlmSettingsPanel } from '../features/settings/LlmSettingsPanel'
import { useThemeStore, type ThemePreference } from '../features/settings/themeStore'
import { cn } from '@/lib/utils'
import { runtimeApi } from '../api/runtime'

const localRuntime = [
  {
    label: '应用数据',
    detail: '曲库和设置都保存在这里',
    icon: FolderCog,
  },
  {
    label: '本地数据库',
    value: 'SQLite',
    detail: '只在本机使用',
    icon: Database,
  },
  {
    label: '智能老师',
    value: 'DeepSeek',
    detail: '用于分段和指法建议',
    icon: Bot,
  },
]

export function SettingsPage() {
  const themePreference = useThemeStore((state) => state.preference)
  const setThemePreference = useThemeStore((state) => state.setPreference)
  const storageInfo = useQuery({
    queryKey: ['storage-info'],
    queryFn: runtimeApi.getStorageInfo,
    staleTime: Infinity,
  })

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground/90">
      <header className="flex min-h-24 shrink-0 items-center justify-between gap-6 border-b border-border px-8 py-5 max-[720px]:min-h-20 max-[720px]:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3 text-[9px] font-bold tracking-[0.35em] text-muted-foreground">
            <span className="h-px w-6 bg-border" />
            本地控制台
          </div>
          <div className="mt-2 flex min-w-0 items-baseline gap-4">
            <h1 className="shrink-0 font-title text-2xl font-bold text-foreground/95">本地设置</h1>
            <p className="truncate text-xs tracking-wide text-muted-foreground max-[640px]:hidden">
              管理输入设备和智能老师
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-bold tracking-[0.2em] text-primary">
          <ShieldCheck className="size-3.5" />
          本机配置
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_19rem] max-[920px]:grid-cols-1 max-[920px]:overflow-y-auto">
        <main className="min-h-0 min-w-0 overflow-y-auto max-[920px]:overflow-visible">
          <Accordion type="single" collapsible defaultValue="llm">
            <AccordionItem value="llm" className="data-[state=open]:border-l-2 data-[state=open]:border-primary data-[state=open]:bg-primary/[0.035]">
              <AccordionTrigger>
                <SettingsSectionTitle
                  index="01"
                  icon={Bot}
                  title="智能老师"
                  detail="选择 DeepSeek 模型"
                  status="DeepSeek"
                />
              </AccordionTrigger>
              <AccordionContent>
                <LlmSettingsPanel />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="input" className="data-[state=open]:border-l-2 data-[state=open]:border-primary data-[state=open]:bg-primary/[0.035]">
              <AccordionTrigger>
                <SettingsSectionTitle
                  index="02"
                  icon={Piano}
                  title="钢琴输入"
                  detail="选择用于演奏和练习的设备"
                  status="输入设备"
                />
              </AccordionTrigger>
              <AccordionContent>
                <div className="min-h-[460px]">
                  <InputDeviceControl showHeader={false} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="preferences" className="data-[state=open]:border-l-2 data-[state=open]:border-primary data-[state=open]:bg-primary/[0.035]">
              <AccordionTrigger>
                <SettingsSectionTitle
                  index="03"
                  icon={Palette}
                  title="主题与语言"
                  detail="调整界面显示"
                  status="显示设置"
                />
              </AccordionTrigger>
              <AccordionContent>
                <PreferencesPanel
                  themePreference={themePreference}
                  onThemeChange={setThemePreference}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-border max-[920px]:border-l-0 max-[920px]:border-t">
          <div className="border-b border-border px-6 py-5">
            <div className="flex items-center gap-3">
              <HardDrive className="size-4 text-muted-foreground" />
              <p className="text-[9px] font-bold tracking-[0.32em] text-muted-foreground">完全本地</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">数据和服务都在本机运行</p>
          </div>

          <dl className="flex-1 px-6 py-2">
            {localRuntime.map((item) => {
              const Icon = item.icon
              const value = item.label === '应用数据'
                ? storageInfo.data?.dataDirectory ?? '正在读取…'
                : item.value ?? ''
              return (
                <div key={item.label} className="border-b border-border py-5 last:border-b-0">
                  <dt className="flex items-center gap-3 text-[9px] font-bold tracking-[0.24em] text-muted-foreground">
                    <Icon className="size-3.5" />
                    {item.label}
                  </dt>
                  <dd data-selectable className="mt-3 break-words text-xs font-bold leading-5 text-foreground/65" title={value}>{value}</dd>
                  <dd className="mt-1 text-[10px] tracking-wide text-muted-foreground">{item.detail}</dd>
                </div>
              )
            })}
          </dl>

          <div className="border-t border-border px-6 py-5 text-[10px] leading-5 tracking-wide text-muted-foreground">
            输入设备设置会立即生效。MIDI 校准不会修改原始设备数据。
          </div>
        </aside>
      </div>
    </div>
  )
}

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: '跟随系统', icon: Laptop },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

function SettingsSectionTitle({
  index,
  icon: Icon,
  title,
  detail,
  status,
}: {
  index: string
  icon: LucideIcon
  title: string
  detail: string
  status: string
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-4">
      <span className="grid size-9 shrink-0 place-items-center border border-border text-muted-foreground transition group-data-[state=open]:border-primary/55 group-data-[state=open]:text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-3">
          <span className="text-[9px] font-bold tabular-nums text-muted-foreground">{index}</span>
          <span className="font-title text-sm font-bold text-foreground/90">{title}</span>
        </span>
        <span className="mt-1 block truncate text-[10px] text-muted-foreground">{detail}</span>
      </span>
      <span className="shrink-0 text-[9px] font-bold tracking-[0.18em] text-muted-foreground group-data-[state=open]:text-primary max-[560px]:hidden">
        {status}
      </span>
    </span>
  )
}

function PreferencesPanel({
  themePreference,
  onThemeChange,
}: {
  themePreference: ThemePreference
  onThemeChange: (preference: ThemePreference) => void
}) {
  return (
    <section aria-label="主题与语言设置" className="px-8 py-7 max-[720px]:px-5">
      <div className="grid max-w-2xl gap-5">
        <fieldset>
          <legend className="text-[9px] font-bold tracking-[0.28em] text-muted-foreground">主题偏好</legend>
          <div className="mt-2 grid grid-cols-3 gap-px border border-border bg-border max-[520px]:grid-cols-1">
            {themeOptions.map((option) => {
              const Icon = option.icon
              const selected = option.value === themePreference
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onThemeChange(option.value)}
                  className={cn(
                    'flex h-12 items-center justify-center gap-2 bg-background px-3 text-xs font-bold outline-none transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary',
                    selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div>
          <p className="text-[9px] font-bold tracking-[0.28em] text-muted-foreground">语言偏好</p>
          <button
            type="button"
            disabled
            className="mt-2 flex h-12 w-full items-center justify-between border border-border px-4 text-xs text-muted-foreground opacity-50"
          >
            <span className="flex items-center gap-3"><Languages className="size-3.5" />简体中文</span>
            <span className="text-[9px] font-bold tracking-[0.2em]">尚未开放</span>
          </button>
        </div>
      </div>
    </section>
  )
}
