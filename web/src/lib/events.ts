import type { EventCode, MarkerCategory } from './types'

export const HUMAN_COLOR = '#38bdf8'
export const BOT_COLOR = '#fb923c'

interface EventMeta {
  label: string
  /** Explanation from the perspective of the journey's owner. */
  describe: (bot: boolean) => string
  category: MarkerCategory
  color: string
}

// Event names are logged from the file owner's point of view, and the "Bot" prefix names the
// *opponent*: in a bot's own file BotKill means it killed another bot (see ARCHITECTURE.md).
export const EVENTS: Record<EventCode, EventMeta> = {
  K: { label: 'PvP kill', describe: () => 'Killed a human player', category: 'kills', color: '#f43f5e' },
  BK: { label: 'Bot kill', describe: (bot) => (bot ? 'Killed another bot' : 'Killed a bot'), category: 'kills', color: '#f43f5e' },
  D: { label: 'Killed by player', describe: () => 'Killed by a human player', category: 'deaths', color: '#f8fafc' },
  BD: { label: 'Killed by bot', describe: () => 'Killed by a bot', category: 'deaths', color: '#f8fafc' },
  S: { label: 'Storm death', describe: () => 'Died to the storm', category: 'storm', color: '#a855f7' },
  L: { label: 'Loot', describe: () => 'Picked up an item', category: 'loot', color: '#facc15' },
}

export const CATEGORIES: { id: MarkerCategory; label: string; codes: EventCode[]; color: string }[] = [
  { id: 'kills', label: 'Kills', codes: ['K', 'BK'], color: EVENTS.K.color },
  { id: 'deaths', label: 'Deaths', codes: ['D', 'BD'], color: EVENTS.D.color },
  { id: 'storm', label: 'Storm deaths', codes: ['S'], color: EVENTS.S.color },
  { id: 'loot', label: 'Loot', codes: ['L'], color: EVENTS.L.color },
]

/** Draw a marker centred on (x, y) in the current canvas space. `r` is the radius in canvas units. */
export function drawMarker(ctx: CanvasRenderingContext2D, code: EventCode, x: number, y: number, r: number) {
  const { category, color } = EVENTS[code]
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'
  ctx.lineWidth = r * 0.35
  ctx.beginPath()
  switch (category) {
    case 'kills': {
      // Upward triangle; PvP kills get a filled white core so they stand out.
      ctx.moveTo(x, y - r * 1.15)
      ctx.lineTo(x + r, y + r * 0.75)
      ctx.lineTo(x - r, y + r * 0.75)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      if (code === 'K') {
        ctx.beginPath()
        ctx.fillStyle = '#fff'
        ctx.arc(x, y + r * 0.1, r * 0.35, 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }
    case 'deaths': {
      // Bold X. Killed-by-player uses a red outline to separate it from killed-by-bot.
      const a = r * 0.9
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'
      ctx.lineWidth = r * 0.9
      ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a)
      ctx.moveTo(x + a, y - a); ctx.lineTo(x - a, y + a)
      ctx.stroke()
      ctx.beginPath()
      ctx.strokeStyle = code === 'D' ? '#f43f5e' : color
      ctx.lineWidth = r * 0.45
      ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a)
      ctx.moveTo(x + a, y - a); ctx.lineTo(x - a, y + a)
      ctx.stroke()
      ctx.lineCap = 'butt'
      return
    }
    case 'storm': {
      ctx.moveTo(x, y - r * 1.2)
      ctx.lineTo(x + r, y)
      ctx.lineTo(x, y + r * 1.2)
      ctx.lineTo(x - r, y)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      return
    }
    case 'loot': {
      const s = r * 0.7
      ctx.rect(x - s, y - s, s * 2, s * 2)
      ctx.fill()
      ctx.stroke()
      return
    }
  }
}
