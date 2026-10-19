# Three things I learned about LILA BLACK

Each finding links to the exact view in the tool. The numbers come from the cleaned data (duplicates removed, journeys trimmed at death; see [ARCHITECTURE.md](ARCHITECTURE.md)). "Journey" means one player in one match. There are 781 human journeys.

---

## 1. Ambrose Valley's east third is a corridor, not a destination

**What caught my eye.** With every match overlaid, the kill and death heatmaps on Ambrose Valley light up a tight band through the middle of the map, while the eastern side stays dark even though paths clearly run through it.
→ [Deaths heatmap](https://lila-journeys.vercel.app/#map=AmbroseValley&paths=0&markers=none&heat=deaths) · [Traffic heatmap](https://lila-journeys.vercel.app/#map=AmbroseValley&paths=0&markers=none&heat=traffic)

**Evidence.**
- **42%** of human journeys on Ambrose pass through the east third of the map (minimap x > 60%). But that area holds only **8.9%** of human movement samples, **6.8%** of loot pickups and **1.3%** of combat events. Only **1 of 296** human deaths to bots happened there.
- The opposite extreme: on a 32×32 grid, **half of all combat happens in 27 of the 443 cells players visit (6%)**, and half of all loot comes from just **20 cells**. The single busiest spot (about 55×55 world units, just south-east of the walled compound) saw 189 combat events across 143 different matches.
- The centre band holds 1,112 combat events. The whole east column holds 30.

**Actionable.** Players run through the east without stopping because there's nothing there worth stopping for: very little loot and no fights. Options, cheapest first:
1. Move a high-value loot spawn or objective into the east (e.g. the building cluster on the east road).
2. Put an extraction point there, so routes and fights spread out.
3. If the space really is meant as transit, shorten it.

*Metrics to watch:* share of time spent in the east third (8.9% now), share of combat in the east (1.3%), loot pickups per minute, and how concentrated fights are (cells holding 50% of combat). Spreading the fights out should also lower early deaths in the centre.

**Why a level designer should care.** About a third of the map's playable area is barely used, and it still costs art, optimisation and QA time. Meanwhile the centre is crowded, so the same few routes and fights repeat every match.

---

## 2. The storm is a late-match timer, and it kills over a third of late players on Lockdown and Grand Rift

**What caught my eye.** Playing back matches with storm-death markers on, every ◆ appears in the last few minutes, and the markers are scattered across the map rather than lined up at one edge.
→ [Lockdown storm deaths](https://lila-journeys.vercel.app/#map=Lockdown&paths=0&markers=storm&heat=storm) (scrub the timeline: nothing until about 11 min)

**Evidence.**
- All **39** storm deaths happen between **10.9 and 14.8 minutes** into a match. None happen earlier.
- Of the human players still alive past 10 minutes, the share who then die to the storm:

  | Map | Alive past 10 min | Storm deaths | Share |
  |---|---|---|---|
  | Lockdown | 44 | 17 | **38.6%** |
  | Grand Rift | 14 | 5 | **35.7%** |
  | Ambrose Valley | 129 | 17 | 13.2% |

- Storm victims aren't players who gave up. They're carrying full bags: on Lockdown they had looted 15.4 items, the same as players who survived (15.5). On Ambrose it was 19.5 vs 22.8.
- Runs with no death end at a median of **7.8–8.6 minutes** on every map. So the storm mostly catches players who stayed for one more loot.

**Actionable.** On Lockdown and Grand Rift, the late game is a coin flip against the storm, about three times worse than Ambrose. Look at:
1. Distance from the late-game loot areas to the nearest extraction point on those two maps. Consider adding an extraction, or spacing them out more.
2. A clearer storm warning at about 10 minutes, on the HUD or with audio.
3. Retuning the storm timer per map. Lockdown is meant to be the close-quarters map, yet its storm deaths come at the same 11–14 minutes as on the bigger maps.

*Metrics to watch:* storm deaths as a share of late players (39% / 36% / 13% now), extraction success rate, loot lost per storm death, and time from the last loot pickup to extraction.

**Why a level designer should care.** A storm death is the most frustrating way to lose a run, because you lose everything to the environment rather than another player. On these two maps it's driven by layout (where extraction points sit relative to late-game loot). Unlike bot tuning, that's something level design can fix directly.

---

## 3. Bots, not players, are the real opposition, and they hit new players hardest

**What caught my eye.** In replays of the busiest matches, there's almost never a red ✕ (killed by a player) and almost never a ▲ with a white dot (PvP kill). Across the whole dataset there are only **3** player-vs-player kills.
→ [A busy Ambrose match](https://lila-journeys.vercel.app/#map=AmbroseValley&match=b971c686-07f6-4378-ad00-71b0b610414e) · [Deaths heatmap](https://lila-journeys.vercel.app/#map=AmbroseValley&paths=0&markers=none&heat=deaths)

**Evidence.**
- **51%** of human journeys end in a death to a bot, 5% to the storm, and 0.4% to another human. The other 43% have no recorded death, so they extracted or left.
- **A third of those bot deaths (32%) happen in the first 3 minutes**, typically about 150 world units from where the player started. On Ambrose, the single worst spot for early deaths is the north-central building cluster (11 early deaths).
- **New players have the hardest time:**

  | A player's… | Journeys | Died to a bot |
  |---|---|---|
  | 1st match | 245 | **63%** |
  | 2nd–3rd | 222 | 56% |
  | 4th–10th | 192 | 40% |
  | 11th+ | 122 | 35% |

- Players who die to a bot finish with about half the loot (9.3 vs 20.4 items) and half the kills (1.9 vs 3.8) of players who don't.
- *Caveats:* part of the gap is survivorship, because players who keep playing may simply be better. Dying to a bot in the first match didn't change whether a player came back in this 5-day window (57% vs 56% returned).

**Actionable.**
1. Audit bot placement near the early-game loot clusters, especially Ambrose north-central, the worst spot for early deaths. Give approach routes more cover, or push bot patrols back so the first fight isn't an ambush.
2. Consider softer bot placement or behaviour for a player's first few matches.
3. Since PvP is almost absent, bots *are* the combat experience, so tune bot encounters the way you'd tune PvP hotspots.

*Metrics to watch:* first-match bot-death rate (63%), share of deaths in the first 3 minutes (32%), loot per journey, extraction rate, and day-1 → day-2 return rate once more data is available.

**Why a level designer should care.** Where bots are placed is a level-design decision. Right now it decides most outcomes, especially in a new player's first matches, when they're forming an opinion of the game.
