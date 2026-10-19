// ---- Raw JSON shapes written by pipeline/build_data.py ----

export interface MapManifest {
  id: string
  name: string
  scale: number
  originX: number
  originZ: number
  data: string
  image: string
  width: number
  height: number
  matches: number
  journeys: number
  dates: string[]
}

export interface Manifest {
  generatedAt: string
  maps: MapManifest[]
}

export type EventCode = 'L' | 'K' | 'D' | 'BK' | 'BD' | 'S'

/** [tSeconds, code, u, v, count?] — u/v are integers in [0, uvRes], image space (top-left origin). */
type RawEvent = [number, EventCode, number, number, number?]

export interface RawMatch {
  id: string
  date: string
  start: number
  duration: number
  humans: number
  bots: number
  events: Record<EventCode, number>
}

export interface RawMapData {
  id: string
  uvRes: number
  matches: RawMatch[]
  journeys: { m: number; id: string; bot: boolean; p: number[]; e: RawEvent[] }[]
}

// ---- Runtime shapes (decoded once per map) ----

export interface GameEvent {
  t: number
  code: EventCode
  /** Normalised image coordinates in [0,1], origin top-left. */
  u: number
  v: number
  count: number
  journey: number
}

export interface Journey {
  index: number
  match: number
  userId: string
  bot: boolean
  /** Seconds since match start, ascending. */
  t: Float64Array
  u: Float32Array
  v: Float32Array
  events: GameEvent[]
  outcome: 'killed' | 'killedByBot' | 'storm' | 'survived'
}

export interface Match extends RawMatch {
  index: number
  journeys: number[]
}

export interface MapData {
  meta: MapManifest
  matches: Match[]
  journeys: Journey[]
}

export type HeatmapKind = 'none' | 'traffic' | 'kills' | 'deaths' | 'storm' | 'loot'

export type MarkerCategory = 'kills' | 'deaths' | 'storm' | 'loot'
