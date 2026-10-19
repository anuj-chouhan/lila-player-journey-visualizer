import { useMemo } from 'react'
import { formatClock } from '../lib/data'
import type { GameEvent } from '../lib/types'

interface Props {
  duration: number
  time: number
  playing: boolean
  speed: number
  events: GameEvent[]
  aggregate: boolean
  onTime: (t: number) => void
  onPlaying: (p: boolean) => void
  onSpeed: (s: number) => void
}

const SPEEDS = [1, 5, 10, 20, 60]
const BINS = 120

export default function Timeline({ duration, time, playing, speed, events, aggregate, onTime, onPlaying, onSpeed }: Props) {
  // Combat + storm density along the timeline, so designers can jump to the action.
  const bins = useMemo(() => {
    const out = new Array(BINS).fill(0)
    if (duration <= 0) return out
    for (const e of events) {
      if (e.code === 'L') continue
      out[Math.min(BINS - 1, Math.floor((e.t / duration) * BINS))] += 1
    }
    const max = Math.max(1, ...out)
    return out.map((n) => n / max)
  }, [events, duration])

  return (
    <div className="timeline">
      <button
        className="play"
        onClick={() => {
          if (!playing && time >= duration) onTime(0)
          onPlaying(!playing)
        }}
        title="Play / pause (Space)"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="scrub">
        <div className="density" aria-hidden>
          {bins.map((n, i) => (
            <span key={i} style={{ height: `${Math.round(n * 100)}%` }} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={1}
          value={Math.min(time, duration)}
          onChange={(e) => onTime(+e.target.value)}
          aria-label="Match time"
        />
      </div>
      <div className="clock">
        <strong>{formatClock(time)}</strong>
        <span className="muted"> / {formatClock(duration)}</span>
        <div className="muted small">{aggregate ? 'time since each match started' : 'match time'}</div>
      </div>
      <select value={speed} onChange={(e) => onSpeed(+e.target.value)} aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <option key={s} value={s}>{s}×</option>
        ))}
      </select>
    </div>
  )
}
