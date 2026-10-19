"""Run: python -m pytest pipeline"""
from build_data import MAPS, folder_to_date, is_bot, ts_to_epoch_seconds, world_to_uv


def test_readme_example_maps_to_pixel_78_890():
    # README worked example: AmbroseValley, x=-301.45, z=-355.55 -> pixel (78, 890) on 1024 px
    cfg = MAPS["AmbroseValley"]
    u, v = world_to_uv(-301.45, -355.55, cfg["scale"], cfg["origin_x"], cfg["origin_z"])
    assert round(u * 1024) == 78
    assert round(v * 1024) == 890


def test_origin_maps_to_bottom_left():
    for cfg in MAPS.values():
        u, v = world_to_uv(cfg["origin_x"], cfg["origin_z"], cfg["scale"], cfg["origin_x"], cfg["origin_z"])
        assert (u, v) == (0.0, 1.0)


def test_bot_detection():
    assert is_bot("1440")
    assert is_bot("382")
    assert not is_bot("f4e072fa-b7af-4761-b567-1d95b7ad0108")


def test_ts_is_epoch_seconds():
    # README sample "1970-01-21 11:52:07.161" == 1770727161 "ms" -> really 2026-02-10 in seconds
    from datetime import datetime, timezone
    raw = 1_770_727_161
    assert datetime.fromtimestamp(ts_to_epoch_seconds(raw), tz=timezone.utc).strftime("%Y-%m-%d") == "2026-02-10"


def test_folder_to_date():
    assert folder_to_date("February_10") == "2026-02-10"
