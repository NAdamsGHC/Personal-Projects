#!/usr/bin/env python3
"""Snapshot Premier League results from the Fantasy Premier League API.

openfootball only refreshes its en.1.json every day or two, so results were
landing on the goal draw up to 48 hours late. The FPL API carries the score
within minutes of full time, but it sends no CORS header, so the browser
can't read it directly. This script runs in GitHub Actions instead and
commits the result into the repo, which the page then loads same-origin.

Output matches openfootball's shape exactly, so index.html needs no new
parsing: {name, matches: [{round, date, time, team1, team2, score:{ft}}]}.

A match in progress gets a `live` array instead of a `score` object. That
keeps provisional goals out of the running totals — the page counts `score`
only — while still giving the live panel something to show.

Deliberately no `minutes` field: it would change on every poll and commit a
new file every 5 minutes during a match. Keyed on goals and status only, the
workflow commits when something actually happens.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

FIXTURES = "https://fantasy.premierleague.com/api/fixtures/"
BOOTSTRAP = "https://fantasy.premierleague.com/api/bootstrap-static/"
UK = ZoneInfo("Europe/London")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TEAMS = os.path.join(ROOT, "teams.json")
OUT = os.path.join(ROOT, "data", "live-2026-27.json")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "goal-draw/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def is_complete(fx):
    """True once the match is over.

    Deliberately not `fx["finished"]` — FPL leaves that False until bonus
    points are confirmed, which can be hours later. `finished_provisional`
    flips at full time, which is the moment the goals actually count.
    """
    if fx.get("team_h_score") is None or fx.get("team_a_score") is None:
        return False
    return bool(fx.get("finished_provisional") or fx.get("finished")) \
        or (fx.get("minutes") or 0) >= 90


def main():
    cfg = json.load(open(TEAMS, encoding="utf-8"))
    names = {a: t["name"] for a, t in cfg["teams"].items()}

    boot = get(BOOTSTRAP)
    # FPL team id -> the name teams.json uses, so the page's name index matches
    by_id = {}
    unknown = []
    for t in boot["teams"]:
        abbr = t["short_name"]
        if abbr in names:
            by_id[t["id"]] = names[abbr]
        else:
            unknown.append(abbr)
    if unknown:
        sys.exit("FPL codes missing from teams.json: %s" % ", ".join(unknown))

    matches = []
    for fx in get(FIXTURES):
        ko = fx.get("kickoff_time")
        if not ko or fx["team_h"] not in by_id or fx["team_a"] not in by_id:
            continue
        local = datetime.fromisoformat(ko.replace("Z", "+00:00")).astimezone(UK)
        m = {
            "round": "Matchday %d" % fx["event"] if fx.get("event") else "",
            "date": local.strftime("%Y-%m-%d"),
            "time": local.strftime("%H:%M"),
            "team1": by_id[fx["team_h"]],
            "team2": by_id[fx["team_a"]],
        }
        h, a = fx.get("team_h_score"), fx.get("team_a_score")
        if is_complete(fx):
            m["score"] = {"ft": [h, a]}
        elif fx.get("started") and h is not None and a is not None:
            m["live"] = [h, a]
        matches.append(m)

    matches.sort(key=lambda m: (m["date"], m["time"], m["team1"]))
    played = sum(1 for m in matches if "score" in m)
    live = sum(1 for m in matches if "live" in m)
    if not matches:
        sys.exit("FPL returned no usable fixtures — leaving the last snapshot alone")

    out = {
        "name": "English Premier League %s" % cfg.get("season", "2026/27"),
        "source": "Fantasy Premier League API",
        "fetched": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "matches": matches,
    }

    # Compare without `fetched`, so an unchanged scoreline makes no commit
    prev = None
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT, encoding="utf-8"))
        except ValueError:
            prev = None
    if prev and prev.get("matches") == matches:
        print("no change (%d of %d played, %d live)" % (played, len(matches), live))
        return

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("wrote %s — %d of %d played, %d live" % (OUT, played, len(matches), live))


if __name__ == "__main__":
    main()
