# LILA BLACK · Player Journey Explorer

A browser tool for Level Designers to see how players actually move, fight, loot and die on LILA BLACK's maps, built from 5 days of production telemetry.

**Live:** https://lila-player-journey-visualizer.vercel.app &nbsp;·&nbsp; **Docs:** [ARCHITECTURE.md](ARCHITECTURE.md) · [INSIGHTS.md](INSIGHTS.md)

## What it does

| Feature | How |
|---|---|
| Player journeys on the correct minimap | World `(x, z)` → minimap pixels, verified against all 89k events ([proof](ARCHITECTURE.md#coordinate-mapping)) |
| Humans vs bots | Humans: solid blue paths, ● heads. Bots: dashed orange paths, ■ heads |
| Event markers | ▲ kill (white dot = PvP), ✕ death (red = killed by player), ◆ storm death, ■ loot. Hover for details, click to follow that player |
| Filters | Map, day (multi-select), match (busiest first), humans/bots, each marker type |
| Timeline / playback | Play, scrub, 1–60× speed, with a combat-density strip so you can jump to the fights. In "All matches" mode every match is aligned at t = 0 |
| Heatmaps | Traffic, kills, deaths, storm deaths, loot. They respect every filter and the timeline position |
| Shareable views | Every filter is kept in the URL, so you can paste a link to show a designer exactly what you saw |

Controls: drag to pan · scroll to zoom · double-click to reset · `Space` play/pause · `←/→` ±10 s · `Esc` clear focus.

## Data gotchas we caught

The dataset's README is wrong or silent on a few points. Each one would have broken the tool if taken at face value:

| README says | Data actually shows | Evidence | Handling |
|---|---|---|---|
| `ts` = milliseconds elapsed in the match | `ts` holds **Unix epoch seconds** in a `timestamp[ms]` column | Read as ms, every match lasts < 1 s. Read as seconds, dates line up with the `February_10…14` folders, matches last 2–15 min, and positions are sampled every 5 s | Raw integer used as seconds. Times are made relative to each match's first event |
| Minimaps are 1024×1024 | 4320², **2160×2158**, 9000² | Image headers | Convert world → UV (0–1) and multiply by the real image size. Images re-encoded to 2048 px WebP |
| Bots emit `BotPosition`/`BotKill`/`BotKilled` | Some bot IDs also emit `Position` (636) and `Loot` (115) | Per-file event counts | Actor type comes from the `user_id` format only (numeric = bot) |
| `BotKill` = "human killed a bot" | In bot files `BotKill`/`BotKilled` also appear: the "Bot" prefix names the **opponent**, so bots fight bots | 480 such events. A human's kills never coincide with a recorded bot death | Labels are written from the file owner's perspective |
| One file per player per match | 743 of 796 matches contain **one** journey. Only ~50 have 7–16 | `match_id` grouping | Match list sorts busiest first. The tool explains this in "About the data" |
| *(not mentioned)* | 1,505 exact duplicate rows (mostly loot ×2–7), 175 rows logged after the player died, 3 files not time-sorted, 1 match crossing a day folder | Pipeline cleaning report | Duplicates collapsed (shown as ×N), journeys trimmed at first death, stable sort by time, grouped by `match_id` rather than folder |

## Tech stack

- **Data pipeline:** Python 3.11+, pyarrow, pandas, Pillow (`pipeline/`)
- **Frontend:** React 19 + TypeScript + Vite, HTML Canvas 2D (`web/`)
- **Hosting:** Vercel (static). No backend, database or environment variables.

## Run it locally

```bash
# 1. Frontend only (processed data is committed in web/public/data)
cd web
npm ci
npm run dev            # http://localhost:5173
```

To regenerate the data from the raw telemetry:

```bash
# put player_data.zip's contents at data/raw/player_data/  (git-ignored)
python -m venv .venv
.venv/Scripts/activate        # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r pipeline/requirements.txt
python -m pytest pipeline     # coordinate / timestamp / bot-detection tests
python pipeline/build_data.py # writes web/public/data/*  (~12 s)
python pipeline/verify_overlay.py  # optional: regenerates docs/img/*_overlay.jpg
```

**Environment variables:** none.

## Deploy

Vercel builds from `vercel.json` (install and build in `web/`, serve `web/dist`). Import the GitHub repo in Vercel and it deploys on every push. Any static host works: run `npm run build` in `web/` and upload `web/dist`.

## Repo layout

```
pipeline/           build_data.py (parquet → JSON), tests, overlay verification
web/                React app
  public/data/      generated: manifest.json, <Map>.json, minimaps/*.webp
  src/lib/          data decoding, filters, heatmap, marker drawing (no React)
  src/components/   MapCanvas, Sidebar, Timeline, PlayerList, AboutData
docs/img/           coordinate-mapping proof overlays
ARCHITECTURE.md     design, data flow, coordinate mapping, trade-offs
INSIGHTS.md         three findings from using the tool
```
