"""Build data/weapons.json from the Marvel4 Black Ops weapon statistics sheet.

Source: "Black Ops Weapon Stats by Marvel4" (community datamine of the 2010 PC
build). Vendored at scripts/source/marvel4_bo1.csv.

Nothing in the output is hand-typed: damage, ranges, fire rates and multipliers
are read straight from the sheet, and shots-to-kill / time-to-kill are computed
from them. Unlock levels are the one exception -- the sheet does not carry them,
so they live in UNLOCKS below, sourced separately.

Run:  python scripts/build_weapons.py
"""

import csv
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "source", "marvel4_bo1.csv")
OUT = os.path.join(ROOT, "data", "weapons.json")

INCH_TO_M = 0.0254
HEALTH = 100

# How fast a person actually pulls a trigger. The sheet's RPM for a semi-auto or
# a pump is the rate the *game* will accept, not a rate the gun delivers for you
# -- quoting it as a flat TTK made the M14 and FAL look faster than the FAMAS.
# Anything you fire by hand is therefore capped at this rate.
#
# This figure is an ESTIMATE, not datamined. Sustained controller tapping sits
# somewhere around 5-8 taps a second; 6 is the middle of that and is what the
# app assumes. It is labelled as an assumption everywhere it changes a number.
TAP_HZ = 6.0
TAP_INTERVAL = 1.0 / TAP_HZ

# Fire modes. The sheet does not carry these, so they are stated here.
# "auto" fires while held; "burst" fires a fixed burst per pull; everything else
# needs one pull per round and is subject to TAP_HZ.
BURST_MODE, AUTO, SEMI, PUMP, BOLT, BREAK = "burst", "auto", "semi", "pump", "bolt", "break"
MANUAL_MODES = {SEMI, PUMP, BOLT, BREAK}

FIRE_MODE = {
    # Assault rifles
    "M16": BURST_MODE, "G11": BURST_MODE, "M14": SEMI, "FAL": SEMI,
    "Enfield": AUTO, "FAMAS": AUTO, "Galil": AUTO, "AUG": AUTO,
    "AK-47": AUTO, "Commando": AUTO,
    # Submachine guns -- all automatic
    "MP5K": AUTO, "Skorpion": AUTO, "MAC-11": AUTO, "AKS-74U": AUTO,
    "Uzi": AUTO, "PM-63": AUTO, "MPL": AUTO, "Spectre": AUTO, "Kiparis": AUTO,
    # Light machine guns -- all automatic
    "HK21": AUTO, "RPK": AUTO, "M60": AUTO, "Stoner 63": AUTO,
    # Snipers
    "L96A1": BOLT, "Dragunov": SEMI, "WA2000": SEMI, "PSG1": SEMI,
    # Shotguns
    "Olympia": BREAK, "Stakeout": PUMP, "SPAS-12": SEMI, "HS-10": SEMI,
    # Handguns -- all fired one pull at a time
    "ASP": SEMI, "M1911": SEMI, "Makarov": SEMI, "Python": SEMI, "CZ75": SEMI,
    # Specials and launchers -- one shot per pull, then a reload
    "Ballistic Knife": SEMI, "Crossbow": SEMI,
    "M72 LAW": SEMI, "RPG-7": SEMI, "Strela-3": SEMI, "China Lake": PUMP,
}

FIRE_MODE_LABEL = {
    AUTO: "Full auto",
    BURST_MODE: "3-round burst",
    SEMI: "Semi-auto",
    PUMP: "Pump action",
    BOLT: "Bolt action",
    BREAK: "Break action",
}

# The list row has five things on it at 375px and no room for a long label.
FIRE_MODE_SHORT = {
    AUTO: "", BURST_MODE: "3RB", SEMI: "Semi", PUMP: "Pump", BOLT: "Bolt", BREAK: "Break",
}

# Column indices in the Marvel4 sheet (3-row header, leaf labels on row 3).
C_NAME = 0
C_SPEED, C_ADS_MOVE = 1, 2
C_AMMO_MAX, C_AMMO_START, C_MAG, C_PELLETS = 3, 4, 5, 6
C_DMG_MAX, C_DMG_MIN = 7, 8
C_RANGE_MAX, C_RANGE_MIN = 9, 10
C_HTK = (11, 12, 13, 14)              # ranges at which 2/3/4/5 hits are needed
C_S_RANGE_MAX, C_S_RANGE_MIN = 15, 16  # suppressed
C_S_HTK = (17, 18, 19, 20)
C_MULT = (21, 22, 23, 24)             # head, neck, upper torso, lower torso
C_FIRE_TIME, C_RPM = 25, 26
C_RF_TIME, C_RF_RPM = 27, 28
C_RELOAD_FULL, C_RELOAD_EMPTY = 31, 32
C_SPRINT_OUT = 43
C_ADS_TIME = 49

CATEGORIES = {
    "Assault Rifles": "AR",
    "Submachine Guns": "SMG",
    "Light Machine Guns": "LMG",
    "Sniper Rifles": "Sniper",
    "Shotguns": "Shotgun",
    "Handguns": "Pistol",
    "Launchers": "Launcher",
    "Specials": "Special",
    "Killstreak Weapons": "Killstreak",
}

# Weapons given full treatment in the app (primaries + pistols). Everything else
# is carried as a one-line entry.
FULL_DEPTH = {"AR", "SMG", "LMG", "Sniper", "Shotgun", "Pistol"}

# 3-round burst weapons: RPM in the sheet is the effective cyclic rate, while
# FIRE_TIME is the gap between rounds inside a burst.
BURST = {"M16": 3, "G11": 3}

# Unlock levels. Source: bosslobbies.com BO1 weapon list, cross-checked against
# community unlock tables. "Classified" weapons unlock by buying the rest of
# their class first, so the level given is the earliest they can appear.
UNLOCKS = {
    "M16": 4, "Enfield": 5, "M14": 9, "FAMAS": 14, "Galil": 20, "AUG": 26,
    "FAL": 32, "AK-47": 38, "Commando": 44, "G11": ("classified", 44),
    "MP5K": 4, "Skorpion": 7, "MAC-11": 11, "AKS-74U": 17, "Uzi": 23,
    "PM-63": 29, "MPL": 35, "Spectre": 41, "Kiparis": ("classified", 41),
    "HK21": 4, "RPK": 6, "M60": 21, "Stoner 63": ("classified", 21),
    "Dragunov": 4, "WA2000": 10, "L96A1": 27, "PSG1": ("classified", 27),
    "Olympia": 4, "Stakeout": 8, "SPAS-12": 24, "HS-10": ("classified", 24),
    "ASP": 4, "M1911": 4, "Makarov": 4, "Python": 18, "CZ75": ("classified", 18),
    "M72 LAW": 4, "RPG-7": 12, "Strela-3": 30, "China Lake": 48,
    "Ballistic Knife": 15, "Crossbow": 33,
}

# Names as they appear in Nathaniel's class sheet / common usage.
ALIASES = {
    "AKS-74U": ["AK74u", "AK-74u", "AKS74u"],
    "FAL": ["FN FAL"],
    "MAC-11": ["MAC11"],
    "PM-63": ["PM63"],
    "HS-10": ["HS10"],
    "Stoner 63": ["Stoner63"],
    "SPAS-12": ["SPAS12"],
    "AK-47": ["AK47"],
}


def num(raw):
    """Parse a sheet cell to float, or None for blank. '∞' -> math.inf."""
    if raw is None:
        return None
    s = raw.strip()
    if s == "":
        return None
    if s == "∞":
        return math.inf
    try:
        return float(s)
    except ValueError:
        return None


def metres(units):
    if units is None:
        return None
    if units == math.inf:
        return None  # caller treats None-at-end as "and beyond"
    return round(units * INCH_TO_M, 1)


def hits_to_kill(dmg):
    """Hits needed at a given per-projectile damage. For a shotgun this is
    PELLETS, not trigger pulls -- the sheet's damage column is per pellet."""
    if not dmg:
        return None
    return int(math.ceil(HEALTH / dmg))


def pulls_for_hits(hits, pellets):
    """Trigger pulls needed to land `hits` projectiles, assuming a shotgun puts
    its whole pattern on target. One pull throws `pellets` of them."""
    if hits is None:
        return None
    if not pellets or pellets <= 1:
        return hits
    return int(math.ceil(hits / float(pellets)))


def interval(fire_time, mode):
    """Seconds between consecutive shots you actually get. Anything fired by
    hand is capped at TAP_HZ; automatics run at the gun's own cyclic rate."""
    if not fire_time:
        return fire_time
    if mode in MANUAL_MODES:
        return max(fire_time, TAP_INTERVAL)
    return fire_time


def shot_time(name, n, fire_time, rpm, mode):
    """Seconds from the first round leaving the barrel to the nth round landing.
    n is trigger pulls for everything except a burst weapon, where the burst
    cycle carries the cost of the gap between bursts."""
    if n is None or n < 2 or not fire_time:
        return 0.0
    burst = BURST.get(name)
    if burst and rpm:
        cycle = burst * (60.0 / rpm)   # full burst-to-burst period
        full, rem = divmod(n - 1, burst)
        return full * cycle + rem * fire_time
    return (n - 1) * interval(fire_time, mode)


def build_profile(row, htk_cols, name, fire_time, rpm, mode, pellets):
    """Range brackets. `hits` is projectiles that must land, `shots` is trigger
    pulls -- the same number for a rifle, different for a shotgun."""
    out = []
    for hits, col in zip((2, 3, 4, 5), htk_cols):
        v = num(row[col]) if col < len(row) else None
        if v is None:
            continue
        beyond = v == math.inf
        pulls = pulls_for_hits(hits, pellets)
        out.append({
            "hits": hits,
            "shots": pulls,
            "toM": None if beyond else metres(v),
            "beyond": beyond,
            "ttk": round(shot_time(name, pulls, fire_time, rpm, mode), 3),
        })
    return out


def kill_zones(dmg, mults, pellets):
    """Trigger pulls to kill by where you hit. This is what makes a 70-damage
    sniper a one-shot weapon: 70 x 1.5 to the chest is 105, and the flat
    100/damage sum never saw it."""
    if not dmg:
        return {}
    out = {}
    for zone in ("head", "neck", "upperTorso", "lowerTorso"):
        m = mults.get(zone)
        if not m:
            continue
        out[zone] = pulls_for_hits(hits_to_kill(dmg * m), pellets)
    return out


def main():
    with open(SRC, newline="", encoding="utf-8") as fh:
        rows = list(csv.reader(fh))

    weapons = []
    category = None

    for row in rows[3:]:
        if not row:
            continue
        name = row[C_NAME].strip()
        if not name:
            label = row[1].strip() if len(row) > 1 else ""
            if label in CATEGORIES:
                category = CATEGORIES[label]
            continue
        if category is None or category == "Killstreak":
            continue

        base_name = name.replace(" DW", "").replace(" Full-Auto", "")
        variant = None
        if name.endswith(" DW"):
            variant = "dual-wield"
        elif name.endswith(" Full-Auto"):
            variant = "full-auto"

        fire_time = num(row[C_FIRE_TIME])
        rpm = num(row[C_RPM])
        dmg_max = num(row[C_DMG_MAX])
        dmg_min = num(row[C_DMG_MIN])
        pellets = int(num(row[C_PELLETS])) if num(row[C_PELLETS]) else None
        mode = FIRE_MODE.get(base_name, AUTO)

        hits_max, hits_min = hits_to_kill(dmg_max), hits_to_kill(dmg_min)
        stk_max = pulls_for_hits(hits_max, pellets)
        stk_min = pulls_for_hits(hits_min, pellets)

        mults = {
            "head": num(row[C_MULT[0]]),
            "neck": num(row[C_MULT[1]]),
            "upperTorso": num(row[C_MULT[2]]),
            "lowerTorso": num(row[C_MULT[3]]),
        }
        zones = kill_zones(dmg_max, mults, pellets)
        one_shot = [z for z, n in zones.items() if n == 1]

        # The headline number assumes you hit where people aim: the upper torso.
        # For every automatic in the game that multiplier is 1.0 and this changes
        # nothing -- but it is the whole story on a 70-damage sniper, where
        # 70 x 1.5 = 105 makes a chest hit a one-shot kill.
        stk_torso = zones.get("upperTorso", stk_max)

        unlock = UNLOCKS.get(base_name)
        classified = False
        if isinstance(unlock, tuple):
            classified = True
            unlock = unlock[1]

        entry = {
            "name": name,
            "baseName": base_name,
            "variant": variant,
            "class": category,
            "depth": "full" if (category in FULL_DEPTH and variant is None) else "brief",
            "unlockLevel": unlock,
            "classified": classified,
            "aliases": ALIASES.get(base_name, []),
            "damage": {"max": dmg_max, "min": dmg_min},
            "range": {"maxM": metres(num(row[C_RANGE_MAX])),
                      "minM": metres(num(row[C_RANGE_MIN]))},
            "stk": {"close": stk_max, "far": stk_min, "torso": stk_torso},
            "hitsToKill": {"close": hits_max, "far": hits_min},
            "pellets": pellets,
            "fireMode": mode,
            "fireModeLabel": FIRE_MODE_LABEL[mode],
            "fireModeShort": FIRE_MODE_SHORT[mode],
            "handFired": mode in MANUAL_MODES,
            "killZones": zones,
            "oneShot": one_shot,
            "rpm": rpm,
            "fireTime": fire_time,
            "effectiveFireTime": round(interval(fire_time, mode), 4) if fire_time else None,
            "rateCapped": bool(fire_time and mode in MANUAL_MODES and fire_time < TAP_INTERVAL),
            "rapidFireRpm": num(row[C_RF_RPM]),
            "burst": BURST.get(base_name),
            "mag": num(row[C_MAG]),
            "ammoMax": num(row[C_AMMO_MAX]),
            "multipliers": mults,
            "adsTime": num(row[C_ADS_TIME]),
            "movementSpeed": num(row[C_SPEED]),
            "adsMoveSpeed": num(row[C_ADS_MOVE]),
            "reload": {"full": num(row[C_RELOAD_FULL]),
                       "empty": num(row[C_RELOAD_EMPTY])},
            "sprintOut": num(row[C_SPRINT_OUT]),
            "profile": build_profile(row, C_HTK, base_name, fire_time, rpm, mode, pellets),
            "source": "Marvel4 BO1 weapon statistics sheet",
        }

        # Best-case and worst-case TTK, the two numbers that decide gunfights.
        # `close` is an upper-torso hit at full damage; a one-pull kill is 0ms by
        # definition, since there is no second shot to wait for.
        entry["ttk"] = {
            "close": round(shot_time(base_name, stk_torso, fire_time, rpm, mode), 3) if stk_torso else None,
            "far": round(shot_time(base_name, stk_min, fire_time, rpm, mode), 3) if stk_min else None,
            "flat": round(shot_time(base_name, stk_max, fire_time, rpm, mode), 3) if stk_max else None,
        }

        # What a miss costs: on a bolt or a pump, the re-chamber is the fight.
        if fire_time and mode in (BOLT, PUMP):
            entry["missPenalty"] = round(fire_time, 3)

        # Rapid Fire recomputes TTK off a higher cyclic rate. It cannot help a
        # weapon whose limit is your trigger finger rather than the gun.
        if entry["rapidFireRpm"]:
            rf_time = num(row[C_RF_TIME])
            entry["rapidFire"] = {
                "rpm": entry["rapidFireRpm"],
                "ttkClose": round(shot_time(base_name, stk_max, rf_time, entry["rapidFireRpm"], mode), 3)
                if stk_max else None,
            }

        # Suppressor in BO1 cuts range hard; carry the suppressed profile so the
        # app can show what a silencer actually costs on this gun.
        s_max = num(row[C_S_RANGE_MAX])
        if s_max:
            entry["suppressed"] = {
                "rangeMaxM": metres(s_max),
                "rangeMinM": metres(num(row[C_S_RANGE_MIN])),
                "profile": build_profile(row, C_S_HTK, base_name, fire_time, rpm, mode, pellets),
            }

        weapons.append(entry)

    payload = {
        "game": "Call of Duty: Black Ops (2010) — PS5 port",
        "source": {
            "stats": "Black Ops Weapon Stats by Marvel4 (community datamine)",
            "unlockLevels": "bosslobbies.com BO1 weapon list",
            "note": "Stats are datamined from the original PC build, not published "
                    "by Treyarch. The PS5 release is a straight port, so they should hold.",
            "fireModes": "Fire modes are not in the sheet — they are stated in "
                         "build_weapons.py from how each weapon behaves in game.",
            "tapRate": "Semi-auto, pump, bolt and break weapons are capped at an "
                       "assumed %g trigger pulls a second. That figure is an "
                       "estimate of a normal trigger finger, not a datamined "
                       "value, and it is the only number in this file that isn't "
                       "computed from the sheet." % TAP_HZ,
            "shotguns": "Shotgun damage in the sheet is per pellet, so the sheet's "
                        "hits-to-kill is pellets. Trigger pulls are derived from it "
                        "assuming the pattern lands.",
            "killZones": "Shots-to-kill by hit location applies the sheet's own "
                         "damage multipliers. This is what makes the 70-damage "
                         "snipers one-shot weapons to the chest.",
        },
        "units": {"range": "metres", "ttk": "seconds", "health": HEALTH,
                  "tapHz": TAP_HZ},
        "weapons": weapons,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=1, ensure_ascii=False)

    full = [w for w in weapons if w["depth"] == "full"]
    print(f"wrote {OUT}")
    print(f"  {len(weapons)} entries, {len(full)} at full depth")
    missing = [w["name"] for w in weapons if w["unlockLevel"] is None and w["variant"] is None]
    if missing:
        print(f"  no unlock level for: {', '.join(missing)}")
    no_mode = [w["baseName"] for w in weapons
               if w["variant"] is None and w["baseName"] not in FIRE_MODE]
    if no_mode:
        print(f"  no fire mode stated (defaulted to auto): {', '.join(sorted(set(no_mode)))}")
    one_shot = [w["name"] for w in full if w["oneShot"]]
    print(f"  one-shot kills somewhere on the body: {', '.join(one_shot) or 'none'}")
    capped = [w["name"] for w in full if w["rateCapped"]]
    print(f"  capped at {TAP_HZ:g} pulls/sec: {', '.join(capped) or 'none'}")


if __name__ == "__main__":
    main()
