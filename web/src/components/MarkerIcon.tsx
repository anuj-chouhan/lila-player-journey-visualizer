import { useEffect, useRef } from 'react'
import { drawMarker } from '../lib/events'
import type { EventCode } from '../lib/types'

/** Legend swatch rendered with the exact same drawing code as the map. */
export default function MarkerIcon({ code, size = 16 }: { code: EventCode; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const dpr = window.devicePixelRatio || 1
    c.width = size * dpr
    c.height = size * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    drawMarker(ctx, code, size / 2, size / 2, code === 'L' ? size * 0.32 : size * 0.36)
  }, [code, size])
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />
}

export function PathSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="22" height="10" aria-hidden>
      <line x1="1" y1="5" x2="21" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? '4 3' : undefined} strokeLinecap="round" />
    </svg>
  )
}
