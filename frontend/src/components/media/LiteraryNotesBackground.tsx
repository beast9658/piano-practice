import { useEffect, useRef } from 'react'

type InkParticle = {
  x: number
  y: number
  radius: number
  speed: number
  sway: number
  phase: number
  glyph: string
  glyphSize: number
  alpha: number
}

const GLYPHS = ['♩', '♪', '♫', '♬', '𝄞', '·']

export function LiteraryNotesBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0
    let height = 0
    let particles: InkParticle[] = []
    let frame = 0
    let lastTime = 0
    let visible = true
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
      if (!visible) cancelAnimationFrame(frame)
      else frame = requestAnimationFrame(step)
    })
    intersectionObserver.observe(canvas)

    const colorOf = (name: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return value || '#9c7049'
    }

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(width * pixelRatio))
      canvas.height = Math.max(1, Math.round(height * pixelRatio))
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

      const density = Math.max(26, Math.min(90, Math.round(width / 16)))
      particles = Array.from({ length: density }, (_, index) => spawnParticle(true, index))
    }

    const spawnParticle = (initial = false, seed = 0): InkParticle => {
      const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      return {
        x: Math.random() * width,
        y: initial ? Math.random() * height : height + 12,
        radius: 0.6 + Math.random() * 1.8,
        speed: 0.08 + Math.random() * 0.24,
        sway: 12 + Math.random() * 26,
        phase: seed + Math.random() * Math.PI * 2,
        glyph,
        glyphSize: 11 + Math.random() * 23,
        alpha: 0.08 + Math.random() * 0.22,
      }
    }

    const drawStaff = () => {
      const ink = colorOf('--foreground')
      const top = Math.max(52, height * 0.16)
      const gap = Math.max(9, height * 0.008)
      context.save()
      context.strokeStyle = ink
      context.globalAlpha = 0.045
      context.lineWidth = 1
      for (let line = 0; line < 5; line += 1) {
        const y = top + line * gap
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(width, y)
        context.stroke()
      }
      context.restore()
    }

    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      if (!visible || now - lastTime < 34) return
      const elapsed = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      const accent = colorOf('--primary')
      const ink = colorOf('--foreground')
      context.clearRect(0, 0, width, height)
      drawStaff()

      for (const particle of particles) {
        particle.y -= particle.speed * elapsed * 34
        const x = particle.x + Math.sin(now * 0.0005 + particle.phase) * particle.sway
        if (particle.y < -34) Object.assign(particle, spawnParticle(false))

        if (particle.glyph === '·') {
          context.save()
          context.globalAlpha = particle.alpha
          context.fillStyle = accent
          context.beginPath()
          context.arc(x, particle.y, particle.radius * 1.8, 0, Math.PI * 2)
          context.fill()
          context.restore()
          continue
        }

        context.save()
        context.globalAlpha = particle.alpha * 0.9
        context.fillStyle = particle.glyph === '𝄞' ? ink : accent
        context.font = `${particle.glyphSize}px "Songti SC", "Noto Serif SC", Georgia, serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(particle.glyph, x, particle.y)
        context.restore()
      }
    }

    const resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(canvas)
    resize()
    if (reducedMotion.matches) {
      visible = true
      step(performance.now())
    } else {
      frame = requestAnimationFrame(step)
    }

    return () => {
      cancelAnimationFrame(frame)
      intersectionObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />
}
