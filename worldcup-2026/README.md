# World Cup 2026 — Goals Draw 🏆⚽

A tiny live dashboard for our sweepstake: each person drew a group of teams, and
**whoever's teams score the most goals across the whole tournament wins.**

**Live dashboard:** https://nadamsghc.github.io/Personal-Projects/worldcup-2026/

## What it shows

- **Today's fixtures** — every match today, with the friend who owns each team
  (falls back to the next match day when nothing's on).
- **League table** — friends ranked by total goals scored by their teams.
- **Click a friend** — expand to see their teams, each team's goals, and who's out.
- **Teams left** — how many of each friend's teams are still in the tournament.

## How it stays free (and can never run up a bill)

Your friends' browsers **never call a football API.** Once a day a GitHub Action:

1. downloads the latest results from the [openfootball](https://github.com/openfootball/worldcup.json)
   public-domain dataset (no key, no account, no card — impossible to bill),
2. sums goals per team and per friend,
3. commits `data/standings.json` + `data/matches.json` back to the repo.

GitHub Pages then serves those static files. The only thing that ever touches the
data source is one Action run per day. GitHub Actions and Pages are free for public
repos, so the whole thing costs nothing.

## Scoring rules

| Rule | Counts? |
|------|---------|
| Own goals (credited to the team that benefits in the scoreline) | ✅ Yes |
| Extra-time goals | ✅ Yes |
| Penalty shootout goals | ❌ No (the match is officially a draw) |

A team's goals are summed across **every** match it plays — group stage and knockouts.

## The draw

Edit [`teams.json`](teams.json) to change who owns what. Any of the 48 tournament
teams not listed there shows up under **Unassigned** automatically. Currently
unassigned: Haiti, Jordan, Uzbekistan.

## Flags

Round flag badges are bundled locally in [`flags/`](flags/) (ISO-coded SVGs from
the MIT-licensed [flag-icons](https://github.com/lipis/flag-icons)) so the page
makes **no external requests**. The team → code map lives in the `flags` block of
`teams.json`. If you ever add a brand-new team, add its code there and drop the
matching `<code>.svg` into `flags/`.

## One-time setup

1. **Push** this to `NAdamsGHC/Personal-Projects` (default branch `main`).
2. **Enable Pages:** repo → *Settings → Pages* → Source: *Deploy from a branch*,
   Branch: `main`, folder: `/ (root)` → Save.
3. **Enable Actions:** repo → *Actions* tab → enable workflows if prompted.
4. **First refresh:** *Actions → Update World Cup 2026 dashboard → Run workflow.*
   (After that it runs itself every day at ~12:00 UK time.)

## Refresh it yourself anytime

```powershell
# from the worldcup-2026 folder
pwsh ./scripts/update.ps1      # or: powershell -File ./scripts/update.ps1
```

## Preview locally

`file://` won't work (browsers block the data `fetch`), so serve it over http:

```powershell
pwsh ./scripts/serve.ps1       # then open http://localhost:8123/
```
