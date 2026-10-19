export default function AboutData({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="about-title">About this data</h2>
          <button className="link" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p>
          5 days (Feb 10–14, 2026) of LILA BLACK production telemetry: 1,243 files making up 1,242 player journeys (one journey is split across two day folders) in 796 matches on 3 maps.
          A few things work differently from what you might expect:
        </p>
        <ul>
          <li>
            <strong>Most matches only contain one recorded player.</strong> 743 of 796 matches have a single journey
            file; about 50 have 7–16 participants. The match list puts the busiest ones first. These make the best replays.
          </li>
          <li>
            <strong>“All matches” overlays every match</strong> on one clock, starting at each match’s own t = 0. Use this
            to see the typical flow of a match on that map.
          </li>
          <li>
            <strong>Times are real.</strong> Timestamps are Unix seconds, so matches last 2–15 minutes and positions are
            sampled every ~5 s. Paths are straight lines between samples.
          </li>
          <li>
            <strong>Bots</strong> are identified by their numeric player ID. A few bots also log human-style movement and
            loot events, and they're still drawn as bots.
          </li>
          <li>
            <strong>Kills mark the killer’s position</strong>, deaths mark the victim’s position. Each event is logged by
            one side only, so a kill and the matching death rarely both appear. PvP is rare (3 kills in the whole
            dataset). Most human deaths are to bots, and bots also kill each other.
          </li>
          <li>
            <strong>Cleaned:</strong> 1,505 duplicate rows (mostly repeated loot pickups, shown as ×N) and 175 rows
            logged after a player had already died.
          </li>
          <li>Feb 14 is a partial day.</li>
        </ul>
        <p className="muted small">
          Controls: drag to pan, scroll to zoom, double-click to reset, Space to play or pause, ←/→ to step 10 s. Click
          any marker to follow that player. The URL updates as you filter, so you can share any view as a link.
        </p>
      </div>
    </div>
  )
}
