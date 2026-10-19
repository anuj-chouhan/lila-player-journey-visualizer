# Architecture

## Stack and why

**Python pre-processing → static JSON → React + Canvas 2D, hosted on Vercel.** The dataset is small (89k rows, 8 MB of parquet), so I clean it once offline, in tested Python, and ship all of it to the browser. Every filter, scrub and heatmap is then instant, and there's no server to keep alive. The map is a single `<canvas>`, because ~1,200 paths and 16k markers redrawn during playback would choke SVG/DOM.

## Data flow

```
1,243 parquet files ── pipeline/build_data.py ──► web/public/data/<Map>.json + minimaps/*.webp
  decode event bytes · ts → epoch seconds · numeric user_id → bot · drop duplicates (keep ×N)
  stable sort by (t, row) · trim at first death · world (x,z) → UV (ints 0..10000) · group by match
                                │  (1.7 MB total, ~40% gzipped; lazy-loaded per map, decoded once into typed arrays)
                                ▼
select(filters) → journeys + events ──► MapCanvas: minimap → heatmap → paths ≤ t → markers ≤ t → live heads
                                    ──► heatmap: 160² grid → Gaussian blur → colour ramp (follows filters + time)
                                    ──► Timeline: playback + combat-density strip;  URL hash = shareable view
```

## Coordinate mapping

The README gives `u = (x − originX)/scale`, `v = (z − originZ)/scale`, `pixel = (u·1024, (1 − v)·1024)`. `y` is elevation and is ignored.

1. **The images aren't 1024².** They're 4320², 2160×2158 and 9000². So the pipeline stops at UV: `world_to_uv` returns `(u, 1 − v)` with a top-left origin, and the frontend multiplies by the size of the image it actually renders. The flip lives in that one function, and a unit test checks it against the README's worked example (→ pixel 78, 890).
2. **Verified, not trusted.** `pipeline/verify_overlay.py` plots every raw event onto its minimap (below). Paths follow roads, Grand Rift's clusters sit on its named zones, nothing lands in Lockdown's sea, and 0 of 89,104 points fall outside [0,1]. A frontend contract test re-checks the bounds on every CI run.

| Ambrose Valley | Grand Rift | Lockdown |
|---|---|---|
| ![](docs/img/AmbroseValley_overlay.jpg) | ![](docs/img/GrandRift_overlay.jpg) | ![](docs/img/Lockdown_overlay.jpg) |

## Assumptions where the data was ambiguous

There's evidence for each of these in the README's "Data gotchas" table.

| Ambiguity | Decision |
|---|---|
| `ts` documented as match-ms, but that gives < 1 s matches | Epoch **seconds**. Match time = t − the match's first event |
| Bots logging human-style events | Bot ⇔ numeric `user_id`, regardless of event name |
| `BotKill`/`BotKilled` inside bot files | "Bot" names the *opponent*, so read from the file owner's view (bots fight bots) |
| Kill rows carry only the logger's position | Kill marker = killer position, death marker = victim position |
| Duplicates, events after death | Collapse duplicates to one marker ×N, and end each journey at its first death |
| Match date when a match crosses midnight | The day folder most of its rows came from |
| 93% of matches have one recorded player | Treat the data as a sample. Busy matches are listed first, and "All matches" aligns every match at t = 0 |

## Trade-offs

| Considered | Chose | Why |
|---|---|---|
| Streamlit / Dash | React + Canvas | The users are designers. Playback, pan/zoom and hover need a real frontend |
| Parquet in the browser (DuckDB-WASM) | Pre-built JSON | 1.7 MB of data beats a 5 MB runtime, and cleaning stays in tested Python |
| API + database | Static files on a CDN | Nothing to run. New data means a 12 s rebuild and a redeploy |
| Pre-rendered heatmap tiles | Computed in the browser | A few ms each, so heatmaps follow every filter *and* the timeline |
| Redraw every path each frame | Offscreen path cache, append-only during playback | 836 translucent paths dropped playback to ~40 fps. Cached, it's ~85 fps |
| deck.gl / Leaflet | Plain Canvas 2D | One image, one transform and simple marks don't need a map engine |
| Full-resolution minimaps (≤ 12 MB) | 2048 px WebP (~180 KB) | Sharp to ~2× zoom, which is more detail than 5 s position sampling can use |
