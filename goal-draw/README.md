# Premier League Goal Draw 2026/27 ⚽

The sweepstake, season two: five players each drew four clubs from seeded pots, and
**whoever's clubs score the most Premier League goals across 2026/27 wins.**

**Live dashboard:** https://nadamsghc.github.io/Personal-Projects/goal-draw/

The World Cup 2026 edition is preserved at
[../worldcup-2026/](https://nadamsghc.github.io/Personal-Projects/worldcup-2026/) 📦

## What it shows

- **Goal draw table** — players ranked by total goals, with goals in the last 7 days
  (`+7d`) and goal difference. Click a player for their clubs and tie-break detail.
- **Fixtures** — the next day with games, short form (`NEW v EVE`) with kit chips.
- **Results by matchweek** — rearranged games appear under their proper matchweek;
  the view defaults to wherever the season actually is.
- **Premier League table** (collapsed by default) — also feeds the tie-breakers.

## Pre-season mode

Until kick-off (Fri 21 Aug 2026, 20:00) the page shows a countdown and replays
**2025/26 with the drawn clubs** for bragging rights. Promoted clubs (Hull, Coventry,
Ipswich) had no top-flight data last season, so the relegated club they replaced
stands in (Wolves, West Ham, Burnley) — highlighted in yellow. It flips to the live
season automatically once results appear in the feed; no redeploy needed.

## Scoring & tie-breaks

Goals are read from the scoreline, so own goals count for the team credited with
them. All 380 matches count. Ties are broken in order: total goals → goal
difference → highest-scoring single club → owns the (current) champions → best
average league position of their clubs.

## How it works — free, live, nothing running

Pure static HTML + JS on GitHub Pages. The browser fetches results from the
public-domain [openfootball](https://github.com/openfootball/football.json) dataset
(`2026-27/en.1.json`), which updates roughly weekly — the "results up to" pill shows
how current the data is. No server, no API key, no database, nothing to bill.
`data/replay-2025-26.json` is the bundled last-season snapshot used pre-season.

## The draw

The draw lives in Nathaniel's spreadsheet (`Documents\Misc\Prem Goal Draw
Randomiser.xlsx`). It is **not** read live — `scripts/import_draw.py` takes a one-off
snapshot into [`teams.json`](teams.json), including the kit-chip designs. While the
spreadsheet's status cell says DRAFT the page shows a "draft draw" ribbon; when the
draw is finalised, flip it to FINAL, rerun the import, and push. Club crests aren't
freely licensable, so the chips are original CSS/SVG shirts in each club's colours.

## Preview locally

`file://` won't work (the browser blocks the data fetch), so serve over http from the
repo root and open `/goal-draw/`.
