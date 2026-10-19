"""Visual proof of the coordinate mapping: draw every raw event on its minimap.

Reads the raw parquet directly (independent of build_data.py's output) and writes
docs/img/<MapId>_overlay.jpg. Paths should follow roads and never land in water or void.

Usage: python pipeline/verify_overlay.py [--raw data/raw/player_data]
"""
import argparse
import os
from pathlib import Path

import pyarrow.parquet as pq
from PIL import Image, ImageDraw

from build_data import MAPS, world_to_uv

Image.MAX_IMAGE_PIXELS = None
SIZE = 1024
COLORS = {
    "Position": (0, 200, 255), "BotPosition": (255, 160, 0), "Loot": (80, 255, 80), "BotKilled": (255, 0, 0),
    "BotKill": (255, 0, 255), "KilledByStorm": (160, 0, 255), "Kill": (255, 255, 255), "Killed": (255, 255, 255),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="data/raw/player_data")
    args = ap.parse_args()
    raw = Path(args.raw)
    rows: dict[str, list] = {m: [] for m in MAPS}
    for f in raw.glob("February_*/*.nakama-0"):
        t = pq.read_table(f, columns=["map_id", "x", "z", "event"]).to_pydict()
        for m, x, z, e in zip(t["map_id"], t["x"], t["z"], t["event"]):
            rows[m].append((x, z, e.decode()))
    out_dir = Path("docs/img")
    out_dir.mkdir(parents=True, exist_ok=True)
    for m, cfg in MAPS.items():
        im = Image.open(raw / "minimaps" / cfg["image"]).convert("RGB").resize((SIZE, SIZE))
        d = ImageDraw.Draw(im)
        for x, z, e in sorted(rows[m], key=lambda r: "Position" not in r[2]):  # events on top
            u, v = world_to_uv(x, z, cfg["scale"], cfg["origin_x"], cfg["origin_z"])
            r = 1 if "Position" in e else 3
            d.ellipse((u * SIZE - r, v * SIZE - r, u * SIZE + r, v * SIZE + r), fill=COLORS[e])
        im.save(out_dir / f"{m}_overlay.jpg", quality=85)
        print(m, len(rows[m]), "points")


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent.parent)
    main()
