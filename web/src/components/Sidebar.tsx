import { useMemo, useState } from 'react'
import { formatClock, formatDate, formatStartTime } from '../lib/data'
import { BOT_COLOR, CATEGORIES, HUMAN_COLOR } from '../lib/events'
import { countByCategory, type Filters, type Selection } from '../lib/filters'
import { HEAT_GRADIENT_CSS } from '../lib/heatmap'
import type { HeatmapKind, MapData, Manifest } from '../lib/types'
import MarkerIcon, { PathSwatch } from './MarkerIcon'

interface Props {
  manifest: Manifest
  data: MapData | null
  filters: Filters
  selection: Selection | null
  heatOpacity: number
  onChange: (patch: Partial<Filters>) => void
  onHeatOpacity: (v: number) => void
}

const HEATMAPS: { id: HeatmapKind; label: string; hint: string }[] = [
  { id: 'none', label: 'Off', hint: '' },
  { id: 'traffic', label: 'Traffic', hint: 'Where players spend time (position samples)' },
  { id: 'kills', label: 'Kills', hint: 'Where kills happen (killer position)' },
  { id: 'deaths', label: 'Deaths', hint: 'Where players die (combat + storm)' },
  { id: 'storm', label: 'Storm', hint: 'Where players die to the storm' },
  { id: 'loot', label: 'Loot', hint: 'Where items are picked up' },
]

export default function Sidebar({ manifest, data, filters, selection, heatOpacity, onChange, onHeatOpacity }: Props) {
  const [sort, setSort] = useState<'players' | 'time'>('players')
  const dates = useMemo(() => {
    const all = Array.from(new Set(manifest.maps.flatMap((m) => m.dates))).sort()
    const counts = new Map<string, number>()
    for (const m of data?.matches ?? []) counts.set(m.date, (counts.get(m.date) ?? 0) + 1)
    return all.map((d) => ({ d, n: counts.get(d) ?? 0 }))
  }, [manifest, data])

  const matchList = useMemo(() => {
    if (!data) return []
    const set = new Set(filters.dates)
    const list = data.matches.filter((m) => set.size === 0 || set.has(m.date))
    return [...list].sort((a, b) =>
      sort === 'players' ? b.humans + b.bots - (a.humans + a.bots) || a.start - b.start : a.start - b.start,
    )
  }, [data, filters.dates, sort])

  const counts = useMemo(() => countByCategory(selection?.events ?? []), [selection])
  const toggleDate = (d: string) => {
    const set = new Set(filters.dates)
    if (set.has(d)) set.delete(d)
    else set.add(d)
    onChange({ dates: [...set].sort(), matchId: null, focusJourney: null })
  }

  return (
    <aside className="sidebar">
      <section>
        <h2>Map</h2>
        <div className="segmented">
          {manifest.maps.map((m) => (
            <button
              key={m.id}
              className={filters.mapId === m.id ? 'on' : ''}
              onClick={() => onChange({ mapId: m.id, matchId: null, focusJourney: null })}
            >
              {m.name}
              <small>{m.matches} matches</small>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Date <span className="muted">(UTC)</span></h2>
        <div className="chips">
          <button className={filters.dates.length === 0 ? 'chip on' : 'chip'} onClick={() => onChange({ dates: [], matchId: null, focusJourney: null })}>
            All days
          </button>
          {dates.map(({ d, n }) => (
            <button
              key={d}
              className={filters.dates.includes(d) ? 'chip on' : 'chip'}
              onClick={() => toggleDate(d)}
              disabled={n === 0}
              title={`${n} matches${d === '2026-02-14' ? ' (partial day)' : ''}`}
            >
              {formatDate(d)}
              {d === '2026-02-14' && '*'} <small>{n}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="match-section">
        <div className="section-head">
          <h2>Match</h2>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'players' | 'time')} aria-label="Sort matches">
            <option value="players">Most players first</option>
            <option value="time">Chronological</option>
          </select>
        </div>
        <div className="match-list" role="listbox" aria-label="Matches">
          <button
            role="option"
            aria-selected={filters.matchId === null}
            className={filters.matchId === null ? 'match on' : 'match'}
            onClick={() => onChange({ matchId: null, focusJourney: null })}
          >
            <span className="match-title">All matches</span>
            <span className="muted">{matchList.length} overlaid, aligned at match start</span>
          </button>
          {matchList.map((m) => (
            <button
              key={m.id}
              role="option"
              aria-selected={filters.matchId === m.id}
              className={filters.matchId === m.id ? 'match on' : 'match'}
              onClick={() => onChange({ matchId: m.id, focusJourney: null })}
            >
              <span className="match-title">
                {formatDate(m.date)} · {formatStartTime(m.start)}
                <span className="match-dur">{formatClock(m.duration)}</span>
              </span>
              <span className="match-meta">
                <span style={{ color: HUMAN_COLOR }}>● {m.humans}</span>
                <span style={{ color: BOT_COLOR }}>■ {m.bots}</span>
                {m.events.K + m.events.BK > 0 && <span>▲ {m.events.K + m.events.BK}</span>}
                {m.events.S > 0 && <span style={{ color: '#a855f7' }}>◆ {m.events.S}</span>}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Show</h2>
        <label className="toggle">
          <input type="checkbox" checked={filters.humans} onChange={(e) => onChange({ humans: e.target.checked })} />
          <PathSwatch color={HUMAN_COLOR} /> Humans
        </label>
        <label className="toggle">
          <input type="checkbox" checked={filters.bots} onChange={(e) => onChange({ bots: e.target.checked })} />
          <PathSwatch color={BOT_COLOR} dashed /> Bots
        </label>
        <label className="toggle">
          <input type="checkbox" checked={filters.paths} onChange={(e) => onChange({ paths: e.target.checked })} />
          Movement paths
        </label>
      </section>

      <section>
        <h2>Event markers</h2>
        {CATEGORIES.map((c) => (
          <label className="toggle" key={c.id}>
            <input
              type="checkbox"
              checked={filters.markers[c.id]}
              onChange={(e) => onChange({ markers: { ...filters.markers, [c.id]: e.target.checked } })}
            />
            <MarkerIcon code={c.codes[c.codes.length - 1]} />
            {c.label}
            <span className="count">{counts[c.id].toLocaleString()}</span>
          </label>
        ))}
        <p className="hint">▲ with a white dot = PvP kill · white ✕ = killed by bot · red ✕ = killed by a player</p>
      </section>

      <section>
        <h2>Heatmap</h2>
        <div className="chips">
          {HEATMAPS.map((h) => (
            <button
              key={h.id}
              className={filters.heatmap === h.id ? 'chip on' : 'chip'}
              onClick={() => onChange({ heatmap: h.id })}
              title={h.hint}
            >
              {h.label}
            </button>
          ))}
        </div>
        {filters.heatmap !== 'none' && (
          <>
            <p className="hint">{HEATMAPS.find((h) => h.id === filters.heatmap)?.hint}</p>
            <div className="heat-legend">
              <span>low</span>
              <div style={{ background: HEAT_GRADIENT_CSS }} />
              <span>high</span>
            </div>
            <label className="slider">
              Opacity
              <input type="range" min={0.2} max={1} step={0.05} value={heatOpacity} onChange={(e) => onHeatOpacity(+e.target.value)} />
            </label>
          </>
        )}
      </section>
    </aside>
  )
}
