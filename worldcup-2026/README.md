# World Cup 2026 — Goals Draw 🏆⚽

A live dashboard for our sweepstake: each person drew a group of teams, and
**whoever's teams score the most goals across the tournament wins.**

**Live dashboard:** https://nadamsghc.github.io/Personal-Projects/worldcup-2026/

## What it shows

- **League table** — friends ranked by total goals, with an "as it stands"
  projection of how many of their teams would survive the group stage.
- **Today's fixtures** with the friend who owns each team.
- **Click a friend** to see their teams, goals, and who's still in.
- **World Cup group tables (A–L)** with qualifier highlighting (collapsible).
- **Projected knockout bracket** ("as it stands").
- **Click the matches-played counter** for the latest results.

## How it works — free, live, nothing running

The page is pure static HTML + JavaScript. When anyone opens it, their browser:

1. fetches the latest results straight from the public-domain
   [openfootball](https://github.com/openfootball/worldcup.json) dataset,
2. works out goals, standings, group tables and the bracket on the spot,
3. renders the dashboard.

There is **no server, no scheduled job, no API key, no database** — so nothing can
fail in the background and nothing can ever bill you. It's current the moment anyone
opens it. If openfootball is briefly unreachable, the page falls back to the bundled
snapshot in [`data/source.json`](data/source.json). Hosted free on GitHub Pages.

## Scoring rules

| Rule | Counts? |
|------|---------|
| Own goals (credited to the team that benefits in the scoreline) | ✅ Yes |
| Extra-time goals | ✅ Yes |
| Penalty shootout goals | ❌ No |

A team's goals are summed across **every** match it plays — group stage and knockouts.

## The draw

Edit [`teams.json`](teams.json): `friends` maps each person to their teams, and any of
the 48 tournament teams not listed shows up under **Unassigned** automatically. The
`flags` block maps teams to flag codes (SVGs in [`flags/`](flags/), from the
MIT-licensed [flag-icons](https://github.com/lipis/flag-icons)).

## Preview locally

`file://` won't work (the browser blocks the data fetch), so serve over http:

```powershell
pwsh ./scripts/serve.ps1     # then open http://localhost:8123/
```

`scripts/update.ps1` is the original offline generator — no longer needed for the
live site, kept only for reference.
