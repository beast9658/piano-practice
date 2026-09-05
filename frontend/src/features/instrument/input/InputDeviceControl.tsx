import { Check, Keyboard, LoaderCircle, Piano, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { connectMidiInput, disconnectMidiInput } from './midiInputApi'
import { useInstrumentStore } from './instrumentStore'
import { pianoInputBus } from './PianoInputBus'

export function InputDeviceControl({ showHeader = true }: { showHeader?: boolean }) {
  const devices = useInstrumentStore((state) => state.devices)
  const activeDeviceId = useInstrumentStore((state) => state.activeDeviceId)
  const status = useInstrumentStore((state) => state.status)
  const setActiveDevice = useInstrumentStore((state) => state.setActiveDevice)
  const setStatus = useInstrumentStore((state) => state.setStatus)
  const calibrateDevice = useInstrumentStore((state) => state.calibrateDevice)
  const [calibrating, setCalibrating] = useState(false)
  const [observedRange, setObservedRange] = useState<[number, number] | null>(null)
  const [lastPitch, setLastPitch] = useState<number | null>(null)
  const activeDevice = devices.find((device) => device.id === activeDeviceId) ?? devices[0]

  const selectDevice = async (deviceId: string) => {
    const device = devices.find((item) => item.id === deviceId)
    if (!device) return
    setCalibrating(false)
    setObservedRange(null)
    setLastPitch(null)
    setStatus('connecting')
    try {
      if (device.kind === 'midi-keyboard') await connectMidiInput(device.id)
      else await disconnectMidiInput()
      setActiveDevice(device.id)
      setStatus('connected')
    } catch (error) {
      setStatus('error')
      console.error('Unable to select piano input', error)
    }
  }

  useEffect(() => {
    return pianoInputBus.subscribe((event) => {
      if (event.type !== 'noteOn' || event.sourceId !== activeDevice.id) return
      setLastPitch(event.pitch)
      if (!calibrating) return
      const rawPitch = event.rawPitch ?? event.pitch
      setObservedRange((range) =>
        range
          ? [Math.min(range[0], rawPitch), Math.max(range[1], rawPitch)]
          : [rawPitch, rawPitch],
      )
    })
  }, [activeDevice.id, calibrating])

  const finishCalibration = () => {
    if (!observedRange || observedRange[0] === observedRange[1]) return
    calibrateDevice(activeDevice.id, observedRange[0], observedRange[1])
    setCalibrating(false)
    setObservedRange(null)
  }

  const cancelCalibration = () => {
    setCalibrating(false)
    setObservedRange(null)
  }

  const startCalibration = () => {
    setObservedRange(null)
    setLastPitch(null)
    setCalibrating(true)
  }

  const Icon = activeDevice.kind === 'midi-keyboard' ? Piano : Keyboard
  const specification = activeDevice.keyCount ? `${activeDevice.keyCount} 键` : '范围未校准'
  const connectionLabel = status === 'connecting'
    ? '正在连接'
    : status === 'error'
      ? '连接异常'
      : activeDevice.kind === 'computer-keyboard'
        ? '本地映射'
        : '设备已连接'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showHeader ? (
        <section className="flex shrink-0 items-start gap-4 border-b border-border px-8 py-6 max-[720px]:px-5">
          <div className="grid size-10 shrink-0 place-items-center border border-primary/50 text-primary">
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h2 className="font-title text-base font-bold text-foreground/90">钢琴输入设备</h2>
              <span className={cn(
                'text-[9px] font-bold tracking-[0.22em]',
                status === 'error' ? 'text-destructive' : 'text-primary',
              )}>
                {connectionLabel}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              选择后用于演奏和练习。
            </p>
          </div>
        </section>
      ) : null}

      <section className="grid shrink-0 grid-cols-[minmax(0,1fr)_12rem] gap-8 border-b border-border px-8 py-6 max-[720px]:grid-cols-1 max-[720px]:gap-4 max-[720px]:px-5">
        <div className="min-w-0">
          <label id="input-device-label" className="text-[9px] font-bold tracking-[0.28em] text-muted-foreground">
            输入端口
          </label>
          <Select value={activeDevice.id} onValueChange={(value) => void selectDevice(value)} disabled={status === 'connecting'}>
            <SelectTrigger aria-labelledby="input-device-label" className="mt-2">
              <SelectValue placeholder="选择输入设备" />
            </SelectTrigger>
            <SelectContent align="start">
              {devices.map((device) => (
                <SelectItem key={device.id} value={device.id}>{device.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-2 border-l border-border pl-6 text-xs max-[720px]:border-l-0 max-[720px]:border-t max-[720px]:pl-0 max-[720px]:pt-4">
          <dt className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground">规格</dt>
          <dd className="text-right font-bold text-foreground/75">{specification}</dd>
          <dt className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground">输入</dt>
          <dd className="truncate text-right font-bold text-foreground/55">
            {activeDevice.kind === 'midi-keyboard'
              ? lastPitch === null ? '等待按键' : `MIDI ${lastPitch}`
              : 'C2–C7'}
          </dd>
        </dl>
      </section>

      <section className="flex min-h-0 flex-1 flex-col justify-center px-8 py-8 max-[720px]:px-5">
        {activeDevice.kind === 'midi-keyboard' ? (
          <div className="w-full max-w-2xl border border-border">
            <div className="flex items-start justify-between gap-5 border-b border-border px-5 py-4">
              <div>
                <p className="text-[9px] font-bold tracking-[0.28em] text-muted-foreground">键盘范围校准</p>
                <p className="mt-2 text-sm font-bold text-foreground/85">
                  {calibrating ? '正在采集键盘边界' : activeDevice.calibrated ? '范围已经保存' : '尚未校准范围'}
                </p>
              </div>
              <span className={cn(
                'mt-0.5 size-2 shrink-0',
                calibrating ? 'animate-pulse bg-primary' : activeDevice.calibrated ? 'bg-primary' : 'bg-foreground/15',
              )} />
            </div>
            <div className="px-5 py-5">
              {calibrating ? (
                <div className="grid grid-cols-2 gap-px bg-border">
                  <CalibrationValue label="最低音" value={observedRange?.[0]} />
                  <CalibrationValue label="最高音" value={observedRange?.[1]} />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-px bg-border max-[560px]:grid-cols-1">
                  <CalibrationValue label="最低音" value={activeDevice.lowestPitch ?? undefined} />
                  <CalibrationValue label="最高音" value={activeDevice.highestPitch ?? undefined} />
                  <CalibrationValue label="键数" value={activeDevice.keyCount ?? undefined} suffix=" 键" />
                </div>
              )}
              <p className="mt-4 text-[10px] leading-5 tracking-wide text-muted-foreground">
                {calibrating
                  ? '依次按下实体键盘最左和最右的琴键。系统会自动记录边界。'
                  : '校准用于匹配虚拟键盘的显示音域，不会改变设备发送的力度数据。'}
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {calibrating ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={cancelCalibration} className="rounded-none text-xs text-foreground/50 hover:bg-accent hover:text-foreground">
                      <X className="size-3.5" />取消
                    </Button>
                    <Button size="sm" onClick={finishCalibration} disabled={!observedRange || observedRange[0] === observedRange[1]} className="rounded-none text-xs">
                      <Check className="size-3.5" />完成并保存
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={startCalibration} className="rounded-none border-border bg-transparent text-xs text-foreground/70 shadow-none hover:border-foreground/35 hover:bg-foreground hover:text-background">
                    <RotateCcw className="size-3.5" />{activeDevice.calibrated ? '重新校准' : '开始校准'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-2xl items-center gap-5 border border-border px-5 py-6">
            {status === 'connecting' ? <LoaderCircle className="size-5 animate-spin text-primary" /> : <Keyboard className="size-5 text-muted-foreground" />}
            <div>
              <p className="text-sm font-bold text-foreground/80">61 键电脑键盘映射</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">映射范围固定为 MIDI 36–96，无需额外校准。</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function CalibrationValue({ label, value, suffix = '' }: { label: string; value?: number; suffix?: string }) {
  return (
    <div className="bg-background px-4 py-4">
      <p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-lg text-foreground/80">{value === undefined ? '—' : `${value}${suffix}`}</p>
    </div>
  )
}
