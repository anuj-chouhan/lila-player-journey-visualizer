import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AboutData from './components/AboutData'
import MapCanvas from './components/MapCanvas'
import PlayerList from './components/PlayerList'
import Sidebar from './components/Sidebar'
import Timeline from './components/Timeline'
import { loadManifest, loadMap } from './lib/data'
import { DEFAULT_FILTERS, countByCategory, filtersToHash, hashToFilters, heatCodes, select, type Filters } from './lib/filters'
import { buildHeatmap } from './lib/heatmap'
import type { MapData, Manifest } from './lib/types'

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters | null>(null)
  const [data, setData] = useState<MapData | null>(null)
  const [time, setTime] = useState(Infinity)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(20)
  const [heatOpacity, setHeatOpacity] = useState(0.7)
  const [about, setAbout] = useState(false)
  // A shared link may point at a moment in the match (#…&t=400).
  const linkTime = useRef<number | null>(null)

  // ---- load manifest + initial filters from the URL ----
  useEffect(() => {
    loadManifest()
      .then((m) => {
        setManifest(m)
        const fromHash = hashToFilters(window.location.hash, m.maps.map((x) => x.id))
        const tParam = Number(new URLSearchParams(window.location.hash.slice(1)).get('t'))
        if (tParam > 0) linkTime.current = tParam
        setFilters({ ...DEFAULT_FILTERS, mapId: m.maps[0].id, ...fromHash })
      })
      .catch((e) => setError(String(e)))
  }, [])

  const meta = manifest?.maps.find((m) => m.id === filters?.mapId)
  useEffect(() => {
    if (!meta) return
    let live = true
    setData((d) => (d?.meta.id === meta.id ? d : null))
    loadMap(meta).then((d) => live && setData(d)).catch((e) => setError(String(e)))
    return () => { live = false }
  }, [meta])

  const update = useCallback((patch: Partial<Filters>) => setFilters((f) => (f ? { ...f, ...patch } : f)), [])

  // A match id from a shared URL may not exist on this map.
  useEffect(() => {
    if (data && filters?.matchId && !data.matches.some((m) => m.id === filters.matchId)) update({ matchId: null })
  }, [data, filters?.matchId, update])

  const selection = useMemo(() => (data && filters && data.meta.id === filters.mapId ? select(data, filters) : null), [data, filters])
  const duration = selection?.duration ?? 0

  // Changing what is selected shows the full picture again.
  const selKey = `${filters?.mapId}|${filters?.matchId}|${filters?.dates.join()}`
  const ready = filters !== null
  useEffect(() => {
    if (!ready) return
    setPlaying(false)
    setTime(linkTime.current ?? Infinity)
    linkTime.current = null
  }, [selKey, ready])
  const t = Math.min(time, duration)

  // ---- keep the URL in sync so any view is shareable (time only while paused mid-match) ----
  const hash = filters ? filtersToHash(filters) + (!playing && duration > 0 && t < duration ? `&t=${Math.floor(t)}` : '') : null
  useEffect(() => {
    if (hash !== null) history.replaceState(null, '', `#${hash}`)
  }, [hash])

  // ---- playback ----
  const last = useRef(0)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    last.current = performance.now()
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000
      last.current = now
      setTime((prev) => {
        const next = Math.min(prev, duration) + dt * speed
        if (next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, duration])

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => {
          if (!p && t >= duration) setTime(0)
          return !p
        })
      } else if (e.code === 'ArrowRight') setTime(Math.min(duration, t + 10))
      else if (e.code === 'ArrowLeft') setTime(Math.max(0, t - 10))
      else if (e.code === 'Escape') { setAbout(false); update({ focusJourney: null }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t, duration, update])

  // Timestamps are whole seconds, so the heatmap can only change when the clock crosses one.
  const heatTime = Math.floor(t)
  const heat = useMemo(() => {
    if (!selection || !filters || filters.heatmap === 'none') return null
    return buildHeatmap(selection.journeys, selection.events, heatCodes(filters.heatmap), heatTime)
  }, [selection, filters, heatTime])

  const stats = useMemo(() => {
    if (!selection) return null
    const c = countByCategory(selection.events)
    return {
      matches: selection.matches.length,
      humans: new Set(selection.journeys.filter((j) => !j.bot).map((j) => j.userId)).size,
      bots: new Set(selection.journeys.filter((j) => j.bot).map((j) => j.userId)).size,
      ...c,
    }
  }, [selection])

  if (error) return <div className="fatal">Something went wrong loading the data: {error}</div>
  if (!manifest || !filters) return <div className="fatal">Loading…</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span> LILA BLACK <span className="muted">· Player Journey Explorer</span>
        </div>
        {stats && (
          <div className="stats">
            <Stat label="Matches" value={stats.matches} />
            <Stat label="Humans" value={stats.humans} color="var(--human)" />
            <Stat label="Bots" value={stats.bots} color="var(--bot)" />
            <Stat label="Kills" value={stats.kills} />
            <Stat label="Deaths" value={stats.deaths} />
            <Stat label="Storm deaths" value={stats.storm} />
            <Stat label="Loot" value={stats.loot} />
          </div>
        )}
        <button className="about-btn" onClick={() => setAbout(true)}>About the data</button>
      </header>

      <Sidebar
        manifest={manifest}
        data={data}
        filters={filters}
        selection={selection}
        heatOpacity={heatOpacity}
        onChange={update}
        onHeatOpacity={setHeatOpacity}
      />

      <main className="stage">
        {data && selection ? (
          <MapCanvas
            data={data}
            selection={selection}
            filters={filters}
            time={t}
            heatmap={heat?.canvas ?? null}
            heatOpacity={heatOpacity}
            onFocusJourney={(i) => update({ focusJourney: i })}
          />
        ) : (
          <div className="map-loading">Loading {meta?.name}…</div>
        )}
        {selection && filters.matchId && (
          <PlayerList journeys={selection.journeys} focus={filters.focusJourney} onFocus={(i) => update({ focusJourney: i })} />
        )}
        {selection && filters.heatmap !== 'none' && !heat && <div className="empty-note">No {filters.heatmap} events in this selection yet</div>}
        {selection && selection.journeys.length === 0 && <div className="empty-note">No players match these filters</div>}
      </main>

      <footer className="bottombar">
        <Timeline
          duration={duration}
          time={t}
          playing={playing}
          speed={speed}
          events={selection?.events ?? []}
          aggregate={!filters.matchId}
          onTime={(v) => { setTime(v); }}
          onPlaying={setPlaying}
          onSpeed={setSpeed}
        />
      </footer>

      {about && <AboutData onClose={() => setAbout(false)} />}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="stat">
      <strong style={color ? { color } : undefined}>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  )
}
