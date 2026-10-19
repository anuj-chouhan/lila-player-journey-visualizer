import { lastIndexAtOrBefore } from './data'
import type { EventCode, GameEvent, Journey } from './types'

/** Grid resolution across the minimap. ~13 world units per cell on Ambrose Valley. */
export const GRID = 160

/**
 * Bin points into a GRID x GRID density grid (normalised image space), blur, and paint it
 * into an RGBA canvas using a perceptual ramp. Returns null when there is nothing to show.
 */
export function buildHeatmap(
  journeys: Journey[],
  events: GameEvent[],
  codes: Set<EventCode> | null,
  time: number,
): { canvas: HTMLCanvasElement; total: number } | null {
  const grid = new Float32Array(GRID * GRID)
  let total = 0
  const add = (u: number, v: number, w: number) => {
    const x = Math.min(GRID - 1, Math.max(0, Math.floor(u * GRID)))
    const y = Math.min(GRID - 1, Math.max(0, Math.floor(v * GRID)))
    grid[y * GRID + x] += w
    total += w
  }
  if (codes === null) {
    // Traffic: every position sample (~5 s of presence each).
    for (const j of journeys) {
      const last = lastIndexAtOrBefore(j.t, time)
      for (let i = 0; i <= last; i++) add(j.u[i], j.v[i], 1)
    }
  } else {
    for (const e of events) if (e.t <= time && codes.has(e.code)) add(e.u, e.v, 1)
  }
  if (total === 0) return null

  // Sparse event layers (a few dozen storm deaths) need a wider kernel than traffic.
  const blurred = gaussianBlur(grid, codes === null ? 1.4 : total < 200 ? 2.6 : 1.8)
  let max = 0
  for (const x of blurred) if (x > max) max = x

  const canvas = document.createElement('canvas')
  canvas.width = GRID
  canvas.height = GRID
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(GRID, GRID)
  for (let i = 0; i < blurred.length; i++) {
    // sqrt compresses the long tail so secondary hotspots stay visible next to the main one.
    const n = Math.sqrt(blurred[i] / max)
    if (n < 0.04) continue
    const [r, g, b] = ramp(n)
    img.data[i * 4] = r
    img.data[i * 4 + 1] = g
    img.data[i * 4 + 2] = b
    img.data[i * 4 + 3] = Math.round(255 * Math.min(1, 0.25 + n * 0.85))
  }
  ctx.putImageData(img, 0, 0)
  return { canvas, total }
}

function gaussianBlur(src: Float32Array, sigma: number): Float32Array {
  const radius = Math.ceil(sigma * 3)
  const kernel: number[] = []
  let sum = 0
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(w)
    sum += w
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let acc = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k
        if (xx >= 0 && xx < GRID) acc += src[y * GRID + xx] * kernel[k + radius]
      }
      tmp[y * GRID + x] = acc
    }
  }
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let acc = 0
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k
        if (yy >= 0 && yy < GRID) acc += tmp[yy * GRID + x] * kernel[k + radius]
      }
      out[y * GRID + x] = acc
    }
  }
  return out
}

// Dark-blue -> teal -> yellow -> orange -> red, readable on dark and bright minimaps.
const STOPS: [number, [number, number, number]][] = [
  [0, [30, 64, 175]],
  [0.3, [20, 184, 166]],
  [0.55, [250, 204, 21]],
  [0.8, [249, 115, 22]],
  [1, [220, 38, 38]],
]

function ramp(n: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i]
    if (n <= p1) {
      const [p0, c0] = STOPS[i - 1]
      const k = (n - p0) / (p1 - p0)
      return [0, 1, 2].map((c) => Math.round(c0[c] + (c1[c] - c0[c]) * k)) as [number, number, number]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

export const HEAT_GRADIENT_CSS = `linear-gradient(90deg, ${STOPS.map(([p, c]) => `rgb(${c.join(',')}) ${p * 100}%`).join(', ')})`
