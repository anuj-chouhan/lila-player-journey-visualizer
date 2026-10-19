import type { GameEvent, Journey, Manifest, MapData, MapManifest, Match, RawMapData } from './types'

const BASE = `${import.meta.env.BASE_URL}data/`

export const dataUrl = (path: string) => BASE + path

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch(dataUrl('manifest.json'))
  if (!res.ok) throw new Error(`Could not load manifest (${res.status})`)
  return res.json()
}

const cache = new Map<string, Promise<MapData>>()

export function loadMap(meta: MapManifest): Promise<MapData> {
  let p = cache.get(meta.id)
  if (!p) {
    p = fetch(dataUrl(meta.data))
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load ${meta.name} (${r.status})`)
        return r.json() as Promise<RawMapData>
      })
      .then((raw) => decode(meta, raw))
    p.catch(() => cache.delete(meta.id))
    cache.set(meta.id, p)
  }
  return p
}

/** Turn the compact JSON into typed arrays + normalised UV once, so rendering never parses. */
export function decode(meta: MapManifest, raw: RawMapData): MapData {
  const res = raw.uvRes
  const matches: Match[] = raw.matches.map((m, index) => ({ ...m, index, journeys: [] }))
  const journeys: Journey[] = raw.journeys.map((j, index) => {
    const n = j.p.length / 3
    const t = new Float64Array(n)
    const u = new Float32Array(n)
    const v = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      t[i] = j.p[i * 3]
      u[i] = j.p[i * 3 + 1] / res
      v[i] = j.p[i * 3 + 2] / res
    }
    const events: GameEvent[] = j.e.map(([et, code, eu, ev, count]) => ({
      t: et,
      code,
      u: eu / res,
      v: ev / res,
      count: count ?? 1,
      journey: index,
    }))
    const death = events.find((e) => e.code === 'D' || e.code === 'BD' || e.code === 'S')
    matches[j.m].journeys.push(index)
    return {
      index,
      match: j.m,
      userId: j.id,
      bot: j.bot,
      t,
      u,
      v,
      events,
      outcome: !death ? 'survived' : death.code === 'S' ? 'storm' : death.code === 'BD' ? 'killedByBot' : 'killed',
    }
  })
  return { meta, matches, journeys }
}

/** Index of the last sample with t <= time (or -1). */
export function lastIndexAtOrBefore(t: Float64Array, time: number): number {
  let lo = 0
  let hi = t.length - 1
  if (hi < 0 || t[0] > time) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (t[mid] <= time) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function formatStartTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}

export const shortId = (id: string) => (id.length > 12 ? id.slice(0, 8) : `#${id}`)
