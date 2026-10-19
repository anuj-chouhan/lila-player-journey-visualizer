import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decode, formatClock, lastIndexAtOrBefore, shortId } from './data'
import { DEFAULT_FILTERS, countByCategory, filtersToHash, hashToFilters, heatCodes, select, type Filters } from './filters'
import type { Manifest, MapManifest, RawMapData } from './types'

const META: MapManifest = {
  id: 'Test', name: 'Test', scale: 100, originX: 0, originZ: 0, data: 'Test.json',
  image: 'x.webp', width: 1000, height: 1000, matches: 2, journeys: 3, dates: ['2026-02-10', '2026-02-11'],
}

// Two matches: match 0 (Feb 10) has a human and a bot, match 1 (Feb 11) has one human.
const RAW: RawMapData = {
  id: 'Test',
  uvRes: 10000,
  matches: [
    { id: 'm0', date: '2026-02-10', start: 100, duration: 60, humans: 1, bots: 1, events: { L: 1, K: 0, D: 0, BK: 1, BD: 0, S: 0 } },
    { id: 'm1', date: '2026-02-11', start: 900, duration: 120, humans: 1, bots: 0, events: { L: 0, K: 0, D: 0, BK: 0, BD: 0, S: 1 } },
  ],
  journeys: [
    { m: 0, id: 'aaaaaaaa-0000-0000-0000-000000000000', bot: false, p: [0, 1000, 2000, 30, 5000, 5000, 60, 9000, 9000], e: [[30, 'L', 5000, 5000, 3], [60, 'BK', 9000, 9000]] },
    { m: 0, id: '1440', bot: true, p: [0, 0, 0, 60, 10000, 10000], e: [] },
    { m: 1, id: 'bbbbbbbb-0000-0000-0000-000000000000', bot: false, p: [0, 0, 0, 120, 5000, 5000], e: [[120, 'S', 5000, 5000]] },
  ],
}

const data = decode(META, RAW)
const filters = (patch: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, mapId: 'Test', ...patch })

describe('decode', () => {
  it('turns quantised UV into [0,1] and keeps time order', () => {
    const j = data.journeys[0]
    expect(Array.from(j.t)).toEqual([0, 30, 60])
    expect(j.u[0]).toBeCloseTo(0.1)
    expect(j.v[2]).toBeCloseTo(0.9)
  })
  it('expands loot counts and links events to their journey', () => {
    const loot = data.journeys[0].events.find((e) => e.code === 'L')!
    expect(loot.count).toBe(3)
    expect(loot.journey).toBe(0)
  })
  it('derives outcomes from the first death event', () => {
    expect(data.journeys.map((j) => j.outcome)).toEqual(['survived', 'survived', 'storm'])
  })
  it('indexes journeys under their match', () => {
    expect(data.matches[0].journeys).toEqual([0, 1])
    expect(data.matches[1].journeys).toEqual([2])
  })
})

describe('lastIndexAtOrBefore', () => {
  const t = new Float64Array([0, 5, 10, 15])
  it.each([
    [-1, -1], [0, 0], [4.9, 0], [5, 1], [12, 2], [15, 3], [99, 3],
  ])('time %d -> index %d', (time, idx) => expect(lastIndexAtOrBefore(t, time)).toBe(idx))
  it('handles empty arrays', () => expect(lastIndexAtOrBefore(new Float64Array(0), 5)).toBe(-1))
})

describe('select', () => {
  it('returns every match when nothing is filtered', () => {
    const s = select(data, filters())
    expect(s.matches).toEqual([0, 1])
    expect(s.journeys).toHaveLength(3)
    expect(s.duration).toBe(120)
  })
  it('filters by date', () => {
    const s = select(data, filters({ dates: ['2026-02-10'] }))
    expect(s.matches).toEqual([0])
    expect(s.duration).toBe(60)
  })
  it('a selected match wins over the date filter', () => {
    expect(select(data, filters({ dates: ['2026-02-10'], matchId: 'm1' })).matches).toEqual([1])
  })
  it('hides bots or humans', () => {
    expect(select(data, filters({ bots: false })).journeys.every((j) => !j.bot)).toBe(true)
    expect(select(data, filters({ humans: false })).journeys.map((j) => j.userId)).toEqual(['1440'])
  })
  it('only includes events of visible journeys', () => {
    expect(select(data, filters({ humans: false })).events).toHaveLength(0)
  })
})

describe('event helpers', () => {
  it('groups codes into marker categories, counting collapsed duplicate pickups', () => {
    expect(countByCategory(select(data, filters()).events)).toEqual({ kills: 1, deaths: 0, storm: 1, loot: 3 })
  })
  it('maps heatmap kinds to event codes', () => {
    expect(heatCodes('traffic')).toBeNull()
    expect([...heatCodes('deaths')!].sort()).toEqual(['BD', 'D', 'S'])
  })
})

describe('shareable URL hash', () => {
  it('keeps the default view short', () => {
    expect(filtersToHash(filters())).toBe('map=Test')
  })
  it('round-trips every setting', () => {
    const f = filters({
      dates: ['2026-02-10', '2026-02-11'], matchId: 'm0', humans: false, bots: true, paths: false,
      markers: { kills: false, deaths: true, storm: false, loot: true }, heatmap: 'storm',
    })
    const hash = filtersToHash(f)
    expect(hash).not.toContain('%2C')
    expect({ ...filters(), ...hashToFilters(`#${hash}`, ['Test']) }).toEqual(f)
  })
  it('ignores unknown maps and heatmaps', () => {
    expect(hashToFilters('#map=Nope&heat=lava', ['Test'])).toEqual({})
  })
  it('still reads old links with encoded commas', () => {
    expect(hashToFilters('#map=Test&markers=kills%2Cloot', ['Test']).markers).toEqual({ kills: true, deaths: false, storm: false, loot: true })
  })
})

describe('formatting', () => {
  it('formats match clocks', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(605.4)).toBe('10:05')
  })
  it('shortens ids for display', () => {
    expect(shortId('f4e072fa-b7af-4761-b567-1d95b7ad0108')).toBe('f4e072fa')
    expect(shortId('1440')).toBe('#1440')
  })
})

// Contract test on the real generated data: catches pipeline regressions before they ship.
describe('generated data (web/public/data)', () => {
  const dir = new URL('../../public/data/', import.meta.url)
  const manifest: Manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'))

  it('has all three maps', () => {
    expect(manifest.maps.map((m) => m.id).sort()).toEqual(['AmbroseValley', 'GrandRift', 'Lockdown'])
  })

  for (const meta of manifest.maps) {
    it(`${meta.id}: every sample is on the minimap and in time order`, () => {
      const raw: RawMapData = JSON.parse(readFileSync(new URL(meta.data, dir), 'utf8'))
      const d = decode(meta, raw)
      expect(d.matches).toHaveLength(meta.matches)
      expect(d.journeys).toHaveLength(meta.journeys)
      const problems = { offMap: 0, outOfOrder: 0, outsideMatch: 0, botMislabelled: 0 }
      for (const j of d.journeys) {
        for (let i = 0; i < j.t.length; i++) {
          if (j.u[i] < 0 || j.u[i] > 1 || j.v[i] < 0 || j.v[i] > 1) problems.offMap++
          if (i > 0 && j.t[i] < j.t[i - 1]) problems.outOfOrder++
        }
        if (j.t[0] < 0 || j.t[j.t.length - 1] > d.matches[j.match].duration) problems.outsideMatch++
        // Bot detection rule: numeric ids are bots.
        if (j.bot !== /^\d+$/.test(j.userId)) problems.botMislabelled++
      }
      expect(problems).toEqual({ offMap: 0, outOfOrder: 0, outsideMatch: 0, botMislabelled: 0 })
    })
  }
})
