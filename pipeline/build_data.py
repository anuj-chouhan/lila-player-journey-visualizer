"""Convert raw LILA BLACK telemetry (parquet) into compact static JSON for the web app.

Usage:
    python pipeline/build_data.py [--raw data/raw/player_data] [--out web/public/data]

Outputs (all under --out):
    manifest.json          map list + global metadata
    <MapId>.json           every match and journey on that map
    minimaps/<MapId>.webp  web-sized minimap images

See ARCHITECTURE.md for the reasoning behind each cleaning step.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# --- Map configuration (from the data README) -------------------------------

MAPS = {
    "AmbroseValley": {"name": "Ambrose Valley", "scale": 900, "origin_x": -370, "origin_z": -473, "image": "AmbroseValley_Minimap.png"},
    "GrandRift": {"name": "Grand Rift", "scale": 581, "origin_x": -290, "origin_z": -290, "image": "GrandRift_Minimap.png"},
    "Lockdown": {"name": "Lockdown", "scale": 1000, "origin_x": -500, "origin_z": -500, "image": "Lockdown_Minimap.jpg"},
}

# Longest side of the web minimap. Sources are 2160-9000 px; 2048 keeps detail at 2x zoom
# while staying a few hundred KB as WebP.
MINIMAP_WEB_SIZE = 2048

# UV coordinates are stored as integers in [0, UV_RES]. 10000 gives sub-pixel precision
# even on a 4096 px render.
UV_RES = 10000

BOT_ID = re.compile(r"^\d+$")

# Event code used in the JSON -> raw event name. Codes are short to keep files small.
EVENT_CODES = {
    "Loot": "L",
    "Kill": "K",            # human killed a human (PvP)
    "Killed": "D",          # human killed by a human
    "BotKill": "BK",        # file owner killed a bot
    "BotKilled": "BD",      # file owner killed by a bot
    "KilledByStorm": "S",
}
MOVEMENT_EVENTS = {"Position", "BotPosition"}
DEATH_EVENTS = {"Killed", "BotKilled", "KilledByStorm"}


# --- Pure helpers (unit-tested) ---------------------------------------------

def world_to_uv(x: float, z: float, scale: float, origin_x: float, origin_z: float) -> tuple[float, float]:
    """World (x, z) -> image-space UV in [0,1], origin top-left (v already flipped).

    README formula: u = (x - ox) / scale, v = (z - oz) / scale, pixel_y = (1 - v) * H.
    We return (u, 1 - v) so the frontend only multiplies by image width/height.
    """
    u = (x - origin_x) / scale
    v = (z - origin_z) / scale
    return u, 1.0 - v


def is_bot(user_id: str) -> bool:
    """Bots have short numeric ids, humans have UUIDs (README + verified on all 339 ids)."""
    return bool(BOT_ID.match(user_id))


def ts_to_epoch_seconds(ts_ms_int: int) -> int:
    """The `ts` column is typed timestamp[ms] but the stored integer is Unix *seconds*.

    Read as ms, every match lasts < 1 s. Read as seconds, dates line up with the
    February_10..14 folders and matches last 2-15 minutes with 5 s position sampling.
    """
    return int(ts_ms_int)


def folder_to_date(folder: str) -> str:
    """'February_10' -> '2026-02-10' (README: data is Feb 10-14, 2026)."""
    return datetime.strptime(f"{folder} 2026", "%B_%d %Y").strftime("%Y-%m-%d")


# --- Loading -----------------------------------------------------------------

def load_raw(raw_dir: Path) -> pd.DataFrame:
    frames = []
    files = sorted(raw_dir.glob("February_*/*.nakama-0"))
    if not files:
        sys.exit(f"No telemetry files found under {raw_dir}")
    for f in files:
        df = pq.read_table(f).to_pandas()
        df["row"] = range(len(df))  # original order, used to break same-second ties
        df["folder"] = f.parent.name
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    df["event"] = df["event"].map(lambda b: b.decode("utf-8") if isinstance(b, (bytes, bytearray)) else str(b))
    df["t"] = df["ts"].astype("int64").map(ts_to_epoch_seconds)
    df["bot"] = df["user_id"].map(is_bot)
    print(f"loaded {len(files)} files, {len(df)} rows")
    return df


# --- Cleaning ----------------------------------------------------------------

def clean(df: pd.DataFrame, report: Counter) -> pd.DataFrame:
    key = ["user_id", "match_id", "t", "event", "x", "y", "z"]
    # Exact duplicates (mostly Loot repeated up to 7x at the same instant): keep one, remember count.
    counts = df.groupby(key, sort=False).size().rename("n")
    before = len(df)
    df = df.drop_duplicates(key).merge(counts, left_on=key, right_index=True)
    report["duplicate_rows_removed"] = before - len(df)

    df = df.sort_values(["match_id", "user_id", "t", "row"]).reset_index(drop=True)

    # Trim each journey at its first death: anything later is telemetry noise.
    death_t = df[df["event"].isin(DEATH_EVENTS)].groupby(["match_id", "user_id"])["t"].min().rename("death_t")
    df = df.merge(death_t, left_on=["match_id", "user_id"], right_index=True, how="left")
    after_death = df["death_t"].notna() & (df["t"] > df["death_t"])
    report["rows_after_death_removed"] = int(after_death.sum())
    df = df[~after_death]

    # Keep only the first death event per journey (3 journeys log two).
    is_death = df["event"].isin(DEATH_EVENTS)
    extra_death = is_death & df[is_death].duplicated(["match_id", "user_id"]).reindex(df.index, fill_value=False)
    report["extra_death_events_removed"] = int(extra_death.sum())
    df = df[~extra_death]

    unknown = set(df["event"]) - MOVEMENT_EVENTS - set(EVENT_CODES)
    if unknown:
        sys.exit(f"Unknown event types: {unknown}")
    return df.drop(columns=["death_t"])


# --- Export ------------------------------------------------------------------

def q(uv: float) -> int:
    return max(0, min(UV_RES, round(uv * UV_RES)))


def build_map(df: pd.DataFrame, map_id: str, cfg: dict, report: Counter) -> dict:
    mdf = df[df["map_id"] == map_id]
    u, v = world_to_uv(mdf["x"], mdf["z"], cfg["scale"], cfg["origin_x"], cfg["origin_z"])
    mdf = mdf.assign(u=u, v=v)
    oob = ((mdf["u"] < 0) | (mdf["u"] > 1) | (mdf["v"] < 0) | (mdf["v"] > 1)).sum()
    report[f"{map_id}_out_of_bounds"] = int(oob)

    matches, journeys = [], []
    for mi, (match_id, g) in enumerate(mdf.groupby("match_id", sort=False)):
        start = int(g["t"].min())
        ev_counts = Counter(g["event"])
        # Date = the day folder the data was delivered in (the dataset's own partitioning).
        # Folders roughly follow UTC days but include matches that began minutes before midnight.
        folder = g["folder"].mode().iloc[0]
        matches.append({
            "id": match_id.removesuffix(".nakama-0"),
            "date": folder_to_date(folder),
            "start": start,
            "duration": int(g["t"].max()) - start,
            "humans": int(g.loc[~g["bot"], "user_id"].nunique()),
            "bots": int(g.loc[g["bot"], "user_id"].nunique()),
            "events": {code: int(ev_counts.get(name, 0)) for name, code in EVENT_CODES.items()},
        })
        for user_id, j in g.groupby("user_id", sort=False):
            path, events = [], []
            for row in j.itertuples(index=False):
                t_rel = int(row.t) - start
                pu, pv = q(row.u), q(row.v)
                # Every row has a position, so all of them extend the path.
                path.extend((t_rel, pu, pv))
                if row.event in EVENT_CODES:
                    e = [t_rel, EVENT_CODES[row.event], pu, pv]
                    if row.n > 1:
                        e.append(int(row.n))
                    events.append(e)
            journeys.append({
                "m": mi,
                "id": user_id,
                "bot": bool(j["bot"].iloc[0]),
                "p": path,
                "e": events,
            })
    matches_sorted = sorted(range(len(matches)), key=lambda i: matches[i]["start"])
    remap = {old: new for new, old in enumerate(matches_sorted)}
    for j in journeys:
        j["m"] = remap[j["m"]]
    return {
        "id": map_id,
        "uvRes": UV_RES,
        "matches": [matches[i] for i in matches_sorted],
        "journeys": journeys,
    }


def export_minimap(raw_dir: Path, out_dir: Path, map_id: str, cfg: dict) -> dict:
    src = Image.open(raw_dir / "minimaps" / cfg["image"])
    src_w, src_h = src.size
    s = MINIMAP_WEB_SIZE / max(src_w, src_h)
    w, h = round(src_w * s), round(src_h * s)
    out = out_dir / "minimaps" / f"{map_id}.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    src.convert("RGB").resize((w, h), Image.LANCZOS).save(out, "WEBP", quality=82, method=6)
    return {"image": f"minimaps/{map_id}.webp", "width": w, "height": h, "sourceWidth": src_w, "sourceHeight": src_h}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="data/raw/player_data")
    ap.add_argument("--out", default="web/public/data")
    ap.add_argument("--skip-images", action="store_true")
    args = ap.parse_args()
    raw_dir, out_dir = Path(args.raw), Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    report: Counter = Counter()
    df = clean(load_raw(raw_dir), report)

    manifest = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "maps": []}
    for map_id, cfg in MAPS.items():
        data = build_map(df, map_id, cfg, report)
        path = out_dir / f"{map_id}.json"
        path.write_text(json.dumps(data, separators=(",", ":")))
        if args.skip_images and (out_dir / "minimaps" / f"{map_id}.webp").exists():
            img = {"image": f"minimaps/{map_id}.webp"}
            with Image.open(out_dir / img["image"]) as im:
                img["width"], img["height"] = im.size
        else:
            img = export_minimap(raw_dir, out_dir, map_id, cfg)
        manifest["maps"].append({
            "id": map_id,
            "name": cfg["name"],
            "scale": cfg["scale"],
            "originX": cfg["origin_x"],
            "originZ": cfg["origin_z"],
            "data": f"{map_id}.json",
            "matches": len(data["matches"]),
            "journeys": len(data["journeys"]),
            "dates": sorted({m["date"] for m in data["matches"]}),
            **img,
        })
        print(f"{map_id}: {len(data['matches'])} matches, {len(data['journeys'])} journeys, {path.stat().st_size / 1024:.0f} KB")

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("cleaning report:", json.dumps(dict(report), indent=2))


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent.parent)
    main()
