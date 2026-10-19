import { useState } from 'react'
import { formatClock, shortId } from '../lib/data'
import { BOT_COLOR, HUMAN_COLOR } from '../lib/events'
import type { Journey } from '../lib/types'

const OUTCOME: Record<Journey['outcome'], string> = {
  killed: 'Killed by player',
  killedByBot: 'Killed by bot',
  storm: 'Storm death',
  survived: 'No death logged',
}

interface Props {
  journeys: Journey[]
  focus: number | null
  onFocus: (i: number | null) => void
}

/** Participants of the selected match; click one to isolate their journey. */
export default function PlayerList({ journeys, focus, onFocus }: Props) {
  const [open, setOpen] = useState(() => window.innerWidth > 860)
  const sorted = [...journeys].sort((a, b) => Number(a.bot) - Number(b.bot) || a.userId.localeCompare(b.userId))
  return (
    <div className="players">
      <div className="players-head">
        <button className="link players-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'} Players ({journeys.length})
        </button>
        {focus !== null && <button className="link" onClick={() => onFocus(null)}>Show all</button>}
      </div>
      {open && <ul>
        {sorted.map((j) => {
          const kills = j.events.filter((e) => e.code === 'K' || e.code === 'BK').length
          const loot = j.events.filter((e) => e.code === 'L').reduce((s, e) => s + e.count, 0)
          return (
            <li key={j.index}>
              <button className={focus === j.index ? 'on' : ''} onClick={() => onFocus(focus === j.index ? null : j.index)}>
                <span className="who" style={{ color: j.bot ? BOT_COLOR : HUMAN_COLOR }}>
                  {j.bot ? '■ Bot' : '● Human'} {shortId(j.userId)}
                </span>
                <span className="muted small">
                  {j.bot && j.outcome === 'killedByBot' ? 'Killed' : OUTCOME[j.outcome]} · {formatClock(j.t[j.t.length - 1])}
                  {kills > 0 && ` · ${kills} kill${kills > 1 ? 's' : ''}`}
                  {loot > 0 && ` · ${loot} loot`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>}
    </div>
  )
}
