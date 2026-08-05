# Black Ops Companion — Team Deathmatch

A personal companion app for **Call of Duty: Black Ops (2010)**, as released on PS4/PS5 on
9 July 2026. Phone-first, built for the thirty seconds between a map being voted in and the
match starting.

**Live:** https://nadamsghc.github.io/Personal-Projects/bo1/

## What it's for

The app has one job: **fix positioning.** It is not a wiki and it is not a stat dump. Its
landing screen is the pre-match brief — fourteen map tiles, one tap each, and everything you
need to play the map well in about thirty seconds of reading.

Every brief has the same seven fields, in this order:

1. **Identity** — how the map plays, in one line
2. **Spawns** — where you start, with a side toggle
3. **Power positions** — the two worth holding
4. **Where they'll be** — the spots enemies predictably occupy
5. **The trap** — the death you'll repeat until someone tells you not to
6. **Your route** — the opening ten seconds, the flank, and the pinch point on it
7. **Loadout call** — one gun, one perk, and why *here*

Everything else — weapons, perks, classes — is the browse layer around that.

## Sections

| Section | What's in it |
|---|---|
| **Pre-Match** | 14 base maps, one tap to a brief, side toggle, deeper notes below the fold |
| **Weapons** | 36 entries at full depth (31 primaries + 5 pistols), sorted by time-to-kill, with a session-only level filter |
| **Perks** | All 15 — effect, Pro effect, all three Pro challenges, and a TDM verdict |
| **Classes** | Five presets, a builder, and a meta score out of 100 with the breakdown always visible |

## Where the data comes from

**Weapon stats** are built from the *Black Ops Weapon Stats* sheet by **Marvel4** — the
community datamine of the original PC build. Nothing is hand-typed: `scripts/build_weapons.py`
reads damage, ranges, fire rates and multipliers straight from the sheet and computes
shots-to-kill and time-to-kill from them, including burst-aware timing for the M16 and G11.
Rebuild with:

```bash
python scripts/build_weapons.py
```

These numbers were never published by Treyarch. The PS5 release is a straight port rather than
a remaster, so they should hold — but they are community data and the app labels them as such.

**Perk effects** come from the Call of Duty Wiki; **Pro challenges** from GameTipCenter.
**Killstreak costs** come from the Call of Duty Wiki. **Unlock levels** come from bosslobbies.com.

**Map tactics are opinion.** The open web on BO1 map strategy is thin, so the briefs are
synthesis from map geometry and what community material exists. Layout facts and spawn ends are
reliable; specific angles and routes are good starting points. They are meant to be corrected —
edit `data/maps.json` after you play and the app picks it up on reload.

Attachment unlock requirements are deliberately absent: no source consulted gave figures worth
trusting, and inventing them would be worse than omitting them.

## Structure

```
bo1/
  index.html            layout and section shells
  styles.css            the whole look
  app.js                renders everything from /data
  manifest.webmanifest  Add-to-Home-Screen
  diagrams/             14 original SVG schematics
  images/
    tiles/              map loading art, used on the Pre-Match tiles
    minimaps/           in-game minimaps, shown under each brief
  data/
    maps.json           14 briefs — the file you'll edit most
    weapons.json        generated, do not hand-edit
    perks.json          15 perks + Pro challenges
    attachments.json    canonical attachment definitions
    killstreaks.json    all 15, plus the three profiles
    classes.json        presets and the scoring rubric
  scripts/
    build_weapons.py    Marvel4 sheet -> data/weapons.json
    build_diagrams.py   generates all 14 schematics
    source/             vendored source data
  _svgcheck.html        dev preview: /_svgcheck.html#nuketown,havana
```

## Not yet done

- **Correcting the schematic labels.** The minimaps carry no text, so building names are
  inferred from the walkthroughs. Each diagram lists the callouts it couldn't place. Fix the
  spec in `scripts/build_diagrams.py` and re-run:

  ```bash
  python scripts/build_diagrams.py
  ```

  Labels are measured before they're placed, so anything that doesn't fit its box fails loudly
  instead of shipping clipped.
- **The 12 DLC maps** (First Strike, Escalation, Annihilation). Same data shape, so it's content
  entry rather than rework.
- **Modes beyond TDM.**

## Legal

Unofficial, non-commercial fan project. Not affiliated with, endorsed by, or sponsored by
Activision or Treyarch. *Call of Duty* and *Black Ops* are trade marks of their respective
owners.

This repo includes **map loading art and in-game minimaps**, sourced via callofdutymaps.com.
Those are Activision's game assets, reproduced here for reference in a fan project with no
commercial use. The tactical schematics in `diagrams/` are original drawings — traced from the
minimaps for geometry, but drawn from scratch. The rest of the visual design is original.

If a rights holder objects, the images come out and the schematics stay.
