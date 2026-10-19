import type { EventCode, MarkerCategory } from './types'

export const HUMAN_COLOR = '#38bdf8'
export const BOT_COLOR = '#fb923c'

interface EventMeta {
  /** Short name; depends on whether the journey's owner is a bot. */
  label: (bot: boolean) => string
  /** Explanation from the perspective of the journey's owner. */
  describe: (bot: boolean) => string
  category: MarkerCategory
  color: string
}

// Events are logged by the file's owner. In a human's file BotKill/BotKilled mean "killed a bot" /
// "killed by a bot" (per the data README). In a bot's own file they mean the bot got a kill / died;
// cross-checking files shows its victims and killers are mostly other bots, sometimes the human.
export const EVENTS: Record<EventCode, EventMeta> = {
  K: { label: () => 'PvP kill', describe: () => 'Killed a human player', category: 'kills', color: '#f43f5e' },
  BK: { label: () => 'Bot kill', describe: (bot) => (bot ? 'This bot got a kill' : 'Killed a bot'), category: 'kills', color: '#f43f5e' },
  D: { label: () => 'Killed by player', describe: () => 'Killed by a human player', category: 'deaths', color: '#f8fafc' },
  BD: { label: (bot) => (bot ? 'Bot died' : 'Killed by bot'), describe: (bot) => (bot ? 'This bot was killed' : 'Killed by a bot'), category: 'deaths', color: '#f8fafc' },
  S: { label: () => 'Storm death', describe: () => 'Died to the storm', category: 'storm', color: '#a855f7' },
  L: { label: () => 'Loot', describe: () => 'Picked up an item', category: 'loot', color: '#facc15' },
}

export const CATEGORIES: { id: MarkerCategory; label: string; codes: EventCode[]; color: string }[] = [
  { id: 'kills', label: 'Kills', codes: ['K', 'BK'], color: EVENTS.K.color },
  { id: 'deaths', label: 'Deaths', codes: ['D', 'BD'], color: EVENTS.D.color },
  { id: 'storm', label: 'Storm deaths', codes: ['S'], color: EVENTS.S.color },
  { id: 'loot', label: 'Loot', codes: ['L'], color: EVENTS.L.color },
]

/** Draw one marker centred on (x, y) in the current canvas space. `r` is the radius in canvas units. */
export function drawMarker(ctx: CanvasRenderingContext2D, code: EventCode, x: number, y: number, r: number) {
  drawMarkers(ctx, code, [x], [y], r)
}

/**
 * Draw many markers of one type with a single path per pass (a handful of draw calls instead of
 * one per marker — the difference between ~18 and 60 fps with all loot visible).
 */
export function drawMarkers(ctx: CanvasRenderingContext2D, code: EventCode, xs: ArrayLike<number>, ys: ArrayLike<number>, r: number) {
  const n = xs.length
  if (n === 0) return
  const { category, color } = EVENTS[code]
  ctx.beginPath()
  switch (category) {
    case 'kills':
      // Upward triangle; PvP kills get a filled white core so they stand out.
      for (let i = 0; i < n; i++) {
        const x = xs[i], y = ys[i]
        ctx.moveTo(x, y - r * 1.15)
        ctx.lineTo(x + r, y + r * 0.75)
        ctx.lineTo(x - r, y + r * 0.75)
        ctx.closePath()
      }
      break
    case 'storm':
      for (let i = 0; i < n; i++) {
        const x = xs[i], y = ys[i]
        ctx.moveTo(x, y - r * 1.2)
        ctx.lineTo(x + r, y)
        ctx.lineTo(x, y + r * 1.2)
        ctx.lineTo(x - r, y)
        ctx.closePath()
      }
      break
    case 'loot': {
      const s = r * 0.7
      for (let i = 0; i < n; i++) ctx.rect(xs[i] - s, ys[i] - s, s * 2, s * 2)
      break
    }
    case 'deaths': {
      // Bold X with a dark outline. Killed-by-player is red, killed-by-bot is white.
      const a = r * 0.9
      for (let i = 0; i < n; i++) {
        const x = xs[i], y = ys[i]
        ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a)
        ctx.moveTo(x + a, y - a); ctx.lineTo(x - a, y + a)
      }
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'
      ctx.lineWidth = r * 0.9
      ctx.stroke()
      ctx.strokeStyle = code === 'D' ? '#f43f5e' : color
      ctx.lineWidth = r * 0.45
      ctx.stroke()
      ctx.lineCap = 'butt'
      return
    }
  }
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'
  ctx.lineWidth = r * 0.35
  ctx.stroke()
  if (code === 'K') {
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      ctx.moveTo(xs[i] + r * 0.35, ys[i] + r * 0.1)
      ctx.arc(xs[i], ys[i] + r * 0.1, r * 0.35, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#fff'
    ctx.fill()
  }
}
