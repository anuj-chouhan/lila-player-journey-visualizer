import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dataUrl, formatClock, lastIndexAtOrBefore, shortId } from '../lib/data'
import { BOT_COLOR, EVENTS, HUMAN_COLOR, drawMarker } from '../lib/events'
import { CODE_TO_CATEGORY, type Filters, type Selection } from '../lib/filters'
import type { GameEvent, MapData } from '../lib/types'

interface Props {
  data: MapData
  selection: Selection
  filters: Filters
  time: number
  heatmap: HTMLCanvasElement | null
  heatOpacity: number
  onFocusJourney: (index: number | null) => void
}

interface View { k: number; x: number; y: number }

const MIN_ZOOM_FACTOR = 0.5
const MAX_ZOOM = 12
// Draw order: frequent/small markers first so rare, important ones end up on top.
const MARKER_ORDER = ['L', 'BK', 'K', 'BD', 'D', 'S'] as const

export default function MapCanvas({ data, selection, filters, time, heatmap, heatOpacity, onFocusJourney }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View>({ k: 1, x: 0, y: 0 })
  const fitKRef = useRef(1)
  // Until the user pans or zooms, keep the map fitted to the container as it resizes.
  const userMovedRef = useRef(false)
  const sizeRef = useRef({ w: 0, h: 0 })
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [hover, setHover] = useState<{ e: GameEvent; x: number; y: number } | null>(null)
  const [, forceRender] = useState(0)
  const frame = useRef(0)

  const W = data.meta.width
  const H = data.meta.height

  // ---- image ----
  useEffect(() => {
    setImage(null)
    const img = new Image()
    img.src = dataUrl(data.meta.image)
    img.onload = () => setImage(img)
  }, [data.meta.image])

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current
    if (!w || !h) return
    const k = Math.min(w / W, h / H) * 0.96
    fitKRef.current = k
    userMovedRef.current = false
    viewRef.current = { k, x: (w - W * k) / 2, y: (h - H * k) / 2 }
  }, [W, H])

  // ---- drawing ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const { w, h } = sizeRef.current
    const { k, x, y } = viewRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y)
    // Everything below is drawn in minimap pixel space (0..W, 0..H).

    if (image) ctx.drawImage(image, 0, 0, W, H)
    else {
      ctx.fillStyle = '#111827'
      ctx.fillRect(0, 0, W, H)
    }

    if (heatmap) {
      ctx.save()
      ctx.globalAlpha = heatOpacity
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(heatmap, 0, 0, W, H)
      ctx.restore()
    }

    const px = 1 / k // one screen pixel in map units
    const focus = filters.focusJourney
    const many = selection.journeys.length > 30

    if (filters.paths) {
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      const drawPath = (j: (typeof selection.journeys)[number], emphasised: boolean) => {
        const last = lastIndexAtOrBefore(j.t, time)
        if (last < 0) return
        ctx.strokeStyle = j.bot ? BOT_COLOR : HUMAN_COLOR
        // Under a heatmap the paths become context, not the main signal.
        const base = (many ? 0.35 : 0.9) * (heatmap ? 0.4 : 1)
        ctx.globalAlpha = focus === null ? base : emphasised ? 1 : 0.12
        ctx.lineWidth = (emphasised && focus !== null ? 3 : many ? 1.2 : 2) * px
        ctx.setLineDash(j.bot ? [5 * px, 4 * px] : [])
        ctx.beginPath()
        ctx.moveTo(j.u[0] * W, j.v[0] * H)
        for (let i = 1; i <= last; i++) ctx.lineTo(j.u[i] * W, j.v[i] * H)
        const head = interpolate(j, last, time)
        if (head) ctx.lineTo(head[0] * W, head[1] * H)
        ctx.stroke()
      }
      for (const j of selection.journeys) if (j.index !== focus) drawPath(j, false)
      const fj = focus !== null ? selection.journeys.find((j) => j.index === focus) : undefined
      if (fj) drawPath(fj, true)
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    // Event markers
    const visible = selection.events.filter((e) => e.t <= time && filters.markers[CODE_TO_CATEGORY[e.code]])
    // Shrink markers when thousands overlap so clusters stay readable.
    const markerScale = visible.length > 2000 ? 0.6 : visible.length > 400 ? 0.75 : 1
    for (const code of MARKER_ORDER) {
      for (const e of visible) {
        if (e.code !== code) continue
        ctx.globalAlpha = focus === null || e.journey === focus ? 1 : 0.25
        drawMarker(ctx, e.code, e.u * W, e.v * H, (e.code === 'L' ? 3.5 : 6) * markerScale * px)
      }
    }
    ctx.globalAlpha = 1

    // Live position heads for players still alive at `time` (only meaningful mid-playback).
    if (filters.paths) {
      for (const j of selection.journeys) {
        const n = j.t.length
        if (time < j.t[0] || time >= j.t[n - 1]) continue
        const head = interpolate(j, lastIndexAtOrBefore(j.t, time), time)
        if (!head) continue
        ctx.globalAlpha = focus === null || focus === j.index ? 1 : 0.3
        ctx.fillStyle = j.bot ? BOT_COLOR : HUMAN_COLOR
        ctx.strokeStyle = '#0b1020'
        ctx.lineWidth = 1.5 * px
        ctx.beginPath()
        const r = 5 * px
        if (j.bot) ctx.rect(head[0] * W - r, head[1] * H - r, r * 2, r * 2)
        else ctx.arc(head[0] * W, head[1] * H, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
  }, [image, heatmap, heatOpacity, selection, filters, time, W, H])

  // `draw` changes on every playback tick. Keep the latest one in a ref so `schedule` and the
  // resize observer stay stable; re-creating the observer each tick reset (= cleared) the canvas.
  const drawRef = useRef(draw)
  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => drawRef.current())
  }, [])

  // Props changed: paint now (no frame of lag); pan/zoom go through schedule().
  useLayoutEffect(() => {
    drawRef.current = draw
    draw()
  }, [draw])

  // ---- sizing ----
  useEffect(() => {
    const wrap = wrapRef.current!
    const canvas = canvasRef.current!
    const ro = new ResizeObserver(() => {
      const { width, height } = wrap.getBoundingClientRect()
      sizeRef.current = { w: width, h: height }
      const dpr = window.devicePixelRatio || 1
      const pw = Math.round(width * dpr)
      const ph = Math.round(height * dpr)
      // Assigning canvas.width clears the bitmap, so only do it when the size really changed.
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }
      if (!userMovedRef.current) fit()
      drawRef.current() // repaint in the same frame as the resize: no blank flash
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [fit])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // Re-fit when the map changes.
  useEffect(() => {
    fit()
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.meta.id])

  // ---- interaction ----
  const zoomAt = useCallback(
    (sx: number, sy: number, factor: number) => {
      const v = viewRef.current
      const k = clamp(v.k * factor, fitKRef.current * MIN_ZOOM_FACTOR, fitKRef.current * MAX_ZOOM)
      const f = k / v.k
      viewRef.current = { k, x: sx - (sx - v.x) * f, y: sy - (sy - v.y) * f }
      userMovedRef.current = true
      setHover(null)
      schedule()
      forceRender((n) => n + 1)
    },
    [schedule],
  )

  useEffect(() => {
    const canvas = canvasRef.current!
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const r = canvas.getBoundingClientRect()
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * 0.0015))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const hitTest = (sx: number, sy: number): GameEvent | null => {
    const { k, x, y } = viewRef.current
    let best: GameEvent | null = null
    let bestD = 10 * 10 // px²
    for (const e of selection.events) {
      if (e.t > time || !filters.markers[CODE_TO_CATEGORY[e.code]]) continue
      const dx = e.u * W * k + x - sx
      const dy = e.v * H * k + y - sy
      const d = dx * dx + dy * dy
      // Prefer rarer, more important events when markers overlap.
      if (d < bestD || (best && d <= bestD + 1 && best.code === 'L' && e.code !== 'L')) {
        best = e
        bestD = d
      }
    }
    return best
  }

  const onPointerDown = (ev: React.PointerEvent) => {
    drag.current = { x: ev.clientX, y: ev.clientY, moved: false }
    ;(ev.target as Element).setPointerCapture(ev.pointerId)
  }
  const onPointerMove = (ev: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    const sx = ev.clientX - r.left
    const sy = ev.clientY - r.top
    if (drag.current) {
      const dx = ev.clientX - drag.current.x
      const dy = ev.clientY - drag.current.y
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true
      if (drag.current.moved) {
        const v = viewRef.current
        viewRef.current = { ...v, x: v.x + dx, y: v.y + dy }
        userMovedRef.current = true
        drag.current.x = ev.clientX
        drag.current.y = ev.clientY
        setHover(null)
        schedule()
        return
      }
    }
    const e = hitTest(sx, sy)
    setHover(e ? { e, x: sx, y: sy } : null)
  }
  const onPointerUp = (ev: React.PointerEvent) => {
    const wasClick = drag.current && !drag.current.moved
    drag.current = null
    if (!wasClick) return
    const r = canvasRef.current!.getBoundingClientRect()
    const e = hitTest(ev.clientX - r.left, ev.clientY - r.top)
    onFocusJourney(e ? e.journey : null)
  }

  const hoverJourney = hover ? data.journeys[hover.e.journey] : null
  const hoverMatch = hoverJourney ? data.matches[hoverJourney.match] : null
  const { w } = sizeRef.current

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={hover ? 'map-canvas pointer' : 'map-canvas'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => { fit(); schedule(); forceRender((n) => n + 1) }}
        aria-label={`${data.meta.name} minimap with player journeys`}
        role="img"
      />
      {!image && <div className="map-loading">Loading minimap…</div>}
      <div className="zoom-controls">
        <button onClick={() => zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, 1.5)} title="Zoom in">+</button>
        <button onClick={() => zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, 1 / 1.5)} title="Zoom out">−</button>
        <button onClick={() => { fit(); schedule(); forceRender((n) => n + 1) }} title="Reset view (double-click map)">⤢</button>
      </div>
      {hover && hoverJourney && hoverMatch && (
        <div
          className="tooltip"
          style={{ left: Math.min(hover.x + 14, w - 230), top: hover.y + 14 }}
        >
          <div className="tooltip-title">
            <span className="dot" style={{ background: EVENTS[hover.e.code].color }} />
            {EVENTS[hover.e.code].label}
            {hover.e.count > 1 && <span className="muted"> ×{hover.e.count}</span>}
          </div>
          <div>{EVENTS[hover.e.code].describe(hoverJourney.bot)}</div>
          <div className="muted">
            {hoverJourney.bot ? 'Bot' : 'Human'} {shortId(hoverJourney.userId)} · {formatClock(hover.e.t)} into match
          </div>
          <div className="muted">Click to follow this player</div>
        </div>
      )}
    </div>
  )
}

function interpolate(j: { t: Float64Array; u: Float32Array; v: Float32Array }, last: number, time: number): [number, number] | null {
  if (last < 0) return null
  const n = j.t.length
  if (last >= n - 1 || j.t[last + 1] === j.t[last]) return [j.u[last], j.v[last]]
  const f = (time - j.t[last]) / (j.t[last + 1] - j.t[last])
  return [j.u[last] + (j.u[last + 1] - j.u[last]) * f, j.v[last] + (j.v[last + 1] - j.v[last]) * f]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

