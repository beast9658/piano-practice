import * as React from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex h-5 w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-px w-full grow overflow-hidden bg-white/15">
        <SliderPrimitive.Range className="absolute h-full bg-white" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-3 border border-white bg-[#080808] shadow-[0_0_8px_rgba(255,255,255,0.25)] outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-white/30" />
    </SliderPrimitive.Root>
  )
}

export { Slider }
