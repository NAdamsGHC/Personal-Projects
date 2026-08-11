# Black Ops Companion — Team Deathmatch

A personal companion app for **Call of Duty: Black Ops (2010)**, as released on PS4/PS5 on
9 July 2026. Phone-first, built for the thirty seconds between a map being voted in and the
match starting.

**Live:** https://nadamsghc.github.io/Personal-Projects/bo1/

## What it's for

The app has one job: **fix positioning.** It is not a wiki and it is not a stat dump. Its
landing screen is the pre-match brief — fourteen map tiles, one tap each, and everything you
need to play the map well in about thirty seconds of reading.

The lobby view is the schematic, its key, **which of the eight classes to run and why**,
**which killstreak set the map suits**, and how far to push. Everything else folds away under
*Brief*:

1. **Identity** — how the map plays, in one line
2. **Spawns** — where you start, with a side toggle
3. **Power positions** — the two worth holding
4. **Where they'll be** — the spots enemies predictably occupy
5. **The trap** — the death you'll repeat until someone tells you not to
6. **Your route** — the opening ten seconds, the flank, and the pinch point on it

There are no per-map perk recommendations. A class is the thing you actually equip, so the brief
names one and the class carries its own gun, attachments and perks — which also means the brief
and the Classes tab can't drift apart.

## Sections

| Section | What's in it |
|---|---|
| **Pre-Match** | 14 base maps, one tap to a brief, side toggle, deeper notes below the fold |
| **Weapons** | 36 entries at full depth (31 primaries + 5 pistols), sorted by time-to-kill |
| **Perks** | All 15 — effect, Pro effect, all three Pro challenges, a TDM verdict, and which combinations pull together |
| **Classes** | Eight presets, a builder, and a read on what each build excels at and struggles with |

## Where the data comes from

**Weapon stats** are built from the *Black Ops Weapon Stats* sheet by **Marvel4** — the
community datamine of the original PC build. Nothing is hand-typed: `scripts/build_weapons.py`
reads damage, ranges, fire rates and multipliers straight from the sheet and computes
shots-to-kill and time-to-kill from them. Rebuild with:

```bash
python scripts/build_weapons.py
```

Three things the raw sheet will mislead you about, and what the script does with them:

- **Snipers.** A flat `100 / damage` says the 70-damage rifles take two shots. Applying the
  sheet's own multipliers, 70 × 1.5 to the chest is 105 — the L96A1, Dragunov, WA2000 and PSG1
  are all one-shot kills, and the app leads with that.
- **Shotguns.** The damage column is *per pellet*, so the sheet's hits-to-kill is pellets, not
  trigger pulls. Three of eight pellets is one shot, not three. All four shotguns are one-pull
  kills inside their first range band.
- **Semi-autos, pumps and bolts.** The sheet's RPM for these is the rate the game will accept,
  not one the gun delivers — quoting it flat put the M14 and FAL above the FAMAS. Anything fired
  one pull at a time is capped at an assumed **6 trigger pulls a second**. That figure is an
  estimate of a normal trigger finger, it is the only number in `weapons.json` not computed from
  the sheet, and the app says so everywhere it changes a result.

These numbers were never published by Treyarch. The PS5 release is a straight port rather than
a remaster, so they should hold — but they are community data and the app labels them as such.

**Classes** are transcribed from `CODB01Classes.xlsx`, descriptions included. There is no score:
a number out of 100 implied a precision that wasn't there. Instead each build is read against
the map you pick and told what it excels at and struggles with, with every figure it quotes
pulled live from `weapons.json`. The rules live in `classes.json` under `traits`.

**Perk effects** come from the Call of Duty Wiki; **Pro challenges** from GameTipCenter.
**Killstreak costs** come from the Call of Duty Wiki. **Unlock levels** come from bosslobbies.com.

**Spawn mechanics come from the game's own shipped scripts**, not from guides — a community dump
of the 2010 PC build, whose spawn file is headed `Copyright (c) 2008 Certain Affinity`. That
matters because it killed something this app used to say:

> **The "70% rule" does not exist.** Earlier versions told you to hold 70% of the way to the
> enemy spawn and not cross it. Grepping the entire spawn system for `70`, `70%` and `0.7`
> returns one hit, and it is a Sentry Gun projecting its influence forwards. There is no
> map-fraction test anywhere in Black Ops 1. The app now says what the code says: a live enemy
> applies −150 to every spawn point within 53 m, a living teammate applies +10 within 18 m, and
> flipping spawns is a question of how much ground your team's bodies cover — not of a line.

The scores are shipped dvar defaults and a server can override them; the falloff curve is
engine-side, so they are the penalty at the centre rather than throughout. Whether the July 2026
re-release changed any of it has not been checked, and the app says so.

**Map tactics are still largely opinion.** The open web on BO1 map strategy is thin, so the
briefs remain synthesis from map geometry and what community material exists. Each map's
"Checked against the wiki" list is the line between what is sourced and what is reasoning. They
are meant to be corrected — edit `data/maps.json` after you play and the app picks it up on
reload.

Two things were deliberately **not** used, despite being tempting. Activision's own Map
Spotlight articles for WMD and Launch are first-party and detailed, but they document the
*Black Ops 4* remasters. And no callout name was invented: where a map has no verified
vocabulary, the app says nothing rather than shipping a plausible guess onto a diagram.

Attachment unlock requirements are deliberately absent: no source consulted gave figures worth
trusting, and inventing them would be worse than omitting them.

## Structure

```
bo1/
  index.html            layout and section shells
  styles.css            the whole look
  app.js                renders everything from /data
  manifest.webmanifest  Add-to-Home-Screen
  diagrams/             14 original SVG schematics — generated
    keys.json           each schematic's key — generated, rendered as HTML
  images/
    tiles/              map loading art, used on the Pre-Match tiles
    minimaps/           in-game minimaps, shown under each brief
  data/
    maps.json           14 briefs — the file you'll edit most
    weapons.json        generated, do not hand-edit
    perks.json          15 perks + Pro challenges
    attachments.json    definitions, plus which weapon classes take what
    killstreaks.json    all 15, plus the low and high sets
    classes.json        the eight classes and the excels/struggles rules
  scripts/
    build_weapons.py    Marvel4 sheet -> data/weapons.json
    build_diagrams.py   generates all 14 schematics + keys.json
    source/             vendored source data
  _svgcheck.html        dev preview: /_svgcheck.html#nuketown,havana
```

## Not yet done

- **Correcting the schematic labels.** The minimaps carry no text, so building names are
  inferred from the walkthroughs. Each diagram's key lists the callouts it couldn't place. Fix
  the spec in `scripts/build_diagrams.py` and re-run:

  ```bash
  python scripts/build_diagrams.py
  ```

  Labels are measured before they're placed, so anything that doesn't fit its box fails loudly
  instead of shipping clipped — and every failure on every map is reported in one run, rather
  than the first one it hits.

  The key is deliberately *not* drawn into the SVG. A 400-unit canvas shown at phone width
  scales every glyph down 13.5%, which put the key text at about 7px; it now lives in
  `diagrams/keys.json` and renders as HTML under the image at normal body size.
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
