import { CATEGORIES } from './events'
import type { EventCode, GameEvent, HeatmapKind, Journey, MapData, MarkerCategory } from './types'

export interface Filters {
  mapId: string
  /** Empty = all dates. */
  dates: string[]
  /** null = all matches matching the date filter. */
  matchId: string | null
  humans: boolean
  bots: boolean
  paths: boolean
  markers: Record<MarkerCategory, boolean>
  heatmap: HeatmapKind
  /** Journey highlighted from the player list (index into MapData.journeys). */
  focusJourney: number | null
}

export const DEFAULT_FILTERS: Omit<Filters, 'mapId'> = {
  dates: [],
  matchId: null,
  humans: true,
  bots: true,
  paths: true,
  markers: { kills: true, deaths: true, storm: true, loot: false },
  heatmap: 'none',
  focusJourney: null,
}

export interface Selection {
  matches: number[]
  journeys: Journey[]
  events: GameEvent[]
  /** Longest match duration in the selection — the timeline length. */
  duration: number
}

export function select(data: MapData, f: Filters): Selection {
  const dateSet = new Set(f.dates)
  const matches = data.matches
    .filter((m) => (f.matchId ? m.id === f.matchId : dateSet.size === 0 || dateSet.has(m.date)))
    .map((m) => m.index)
  const journeys: Journey[] = []
  let duration = 0
  for (const mi of matches) {
    duration = Math.max(duration, data.matches[mi].duration)
    for (const ji of data.matches[mi].journeys) {
      const j = data.journeys[ji]
      if (j.bot ? f.bots : f.humans) journeys.push(j)
    }
  }
  const events = journeys.flatMap((j) => j.events)
  return { matches, journeys, events, duration }
}

const HEAT_CODES: Record<Exclude<HeatmapKind, 'none' | 'traffic'>, EventCode[]> = {
  kills: ['K', 'BK'],
  deaths: ['D', 'BD', 'S'],
  storm: ['S'],
  loot: ['L'],
}

export function heatCodes(kind: HeatmapKind): Set<EventCode> | null {
  return kind === 'none' || kind === 'traffic' ? null : new Set(HEAT_CODES[kind])
}

export const CODE_TO_CATEGORY = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.codes.map((code) => [code, c.id])),
) as Record<EventCode, MarkerCategory>

export function countByCategory(events: GameEvent[]): Record<MarkerCategory, number> {
  const out: Record<MarkerCategory, number> = { kills: 0, deaths: 0, storm: 0, loot: 0 }
  for (const e of events) out[CODE_TO_CATEGORY[e.code]] += 1
  return out
}

// ---- URL hash <-> filters, so any view can be shared as a link ----

export function filtersToHash(f: Filters): string {
  const p = new URLSearchParams()
  p.set('map', f.mapId)
  if (f.dates.length) p.set('dates', f.dates.join(','))
  if (f.matchId) p.set('match', f.matchId)
  if (!f.humans) p.set('humans', '0')
  if (!f.bots) p.set('bots', '0')
  if (!f.paths) p.set('paths', '0')
  const on = (Object.keys(f.markers) as MarkerCategory[]).filter((k) => f.markers[k])
  p.set('markers', on.join(',') || 'none')
  if (f.heatmap !== 'none') p.set('heat', f.heatmap)
  return p.toString()
}

const HEATMAPS: HeatmapKind[] = ['none', 'traffic', 'kills', 'deaths', 'storm', 'loot']

export function hashToFilters(hash: string, validMaps: string[]): Partial<Filters> {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const out: Partial<Filters> = {}
  const map = p.get('map')
  if (map && validMaps.includes(map)) out.mapId = map
  if (p.get('dates')) out.dates = p.get('dates')!.split(',').filter(Boolean)
  if (p.get('match')) out.matchId = p.get('match')
  if (p.get('humans') === '0') out.humans = false
  if (p.get('bots') === '0') out.bots = false
  if (p.get('paths') === '0') out.paths = false
  const markers = p.get('markers')
  if (markers) {
    const set = new Set(markers.split(','))
    out.markers = { kills: set.has('kills'), deaths: set.has('deaths'), storm: set.has('storm'), loot: set.has('loot') }
  }
  const heat = p.get('heat') as HeatmapKind | null
  if (heat && HEATMAPS.includes(heat)) out.heatmap = heat
  return out
}
