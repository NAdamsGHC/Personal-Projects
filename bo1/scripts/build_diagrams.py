"""Generate the 14 tactical schematics.

Hand-placing SVG text went badly: SVG doesn't wrap, so long labels ran out of
their boxes and off the canvas. Here every label is measured before it is
placed. Anything that doesn't fit raises, so a bad spec fails loudly instead of
shipping clipped text.

Layout rules:
  * Shapes carry SHORT labels only (a word or two, up to two lines).
  * Everything discursive goes in the key, which is NOT drawn into the SVG --
    it is written to diagrams/keys.json and rendered as HTML under the image.
    A 400-unit canvas displayed at 346px shrank every glyph by 13.5%, which put
    the key text at about 7px on a phone. As HTML it renders at app body size,
    wraps properly, and is no longer constrained to one short line per item.
  * Markers sit clear of text.

Geometry is traced from the in-game minimaps in images/minimaps/.

Run:  python scripts/build_diagrams.py
Writes: diagrams/*.svg and diagrams/keys.json (both generated -- don't hand-edit)
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "diagrams")
KEYS_OUT = os.path.join(OUT, "keys.json")

# Measured against the app's sans stack: uppercase advance is about 0.62em
# plus the tracking. Deliberately slightly pessimistic.
def text_w(s, size, tracking):
    return len(s) * (0.62 * size + tracking)


# Sized so that at the 346px the diagram gets inside a brief on a 375px phone,
# a shape label lands at ~10px and the title at ~11.5px. The old 9.0 put them
# at 7.8px, which is under the size anything is comfortably read at on a phone.
LABEL_SIZE, LABEL_TRACK = 11.5, 0.4
TITLE_SIZE, TITLE_TRACK = 13.0, 0.8
LINE_H = 13.5

CSS = """
.terr{fill:#1b2429;stroke:#55636e;stroke-width:1.4}
.b{fill:#39454c;stroke:#8fb0aa;stroke-width:1.1}
.s{fill:#2b353c;stroke:#6b7d80;stroke-width:1}
.sp{fill:#17313a;stroke:#8fb0aa;stroke-width:1.3}
.rock{fill:#333f45;stroke:#7d8f92;stroke-width:0.9}
.water{fill:#24343c;stroke:#8fb0aa;stroke-width:1}
.hot{fill:url(#hz);stroke:#c25b4e;stroke-width:1}
.lbl{fill:#e6ecec;font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;
     font-size:%.1fpx;letter-spacing:%.1fpx}
.lbl2{fill:#93a4a6;font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;
      font-size:%.1fpx;letter-spacing:%.1fpx}
.hotlbl{fill:#d99a90;font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;
        font-size:%.1fpx;letter-spacing:%.1fpx}
.ttl{fill:#e6ecec;font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;
     font-size:%.1fpx;letter-spacing:%.1fpx;font-weight:600}
.pin{fill:#d98b4a}
.pinn{fill:#0b0f11;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:700}
.link{stroke:#55636e;stroke-width:1.3;fill:none;stroke-dasharray:3 3}
""" % (LABEL_SIZE, LABEL_TRACK, LABEL_SIZE - 1, LABEL_TRACK - 0.2,
       LABEL_SIZE - 1, LABEL_TRACK - 0.2, TITLE_SIZE, TITLE_TRACK)

# Green = head here, red = stay out. The two colours carry the whole map at a
# glance, which is the point of a diagram you read in a lobby.
CSS += """
.go{fill:#1d3b2f;stroke:#5fb08a;stroke-width:1.5}
.golbl{fill:#a9dcc0;font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;
       font-size:%.1fpx;letter-spacing:%.1fpx}
""" % (LABEL_SIZE, LABEL_TRACK)


class Canvas:
    def __init__(self, name, w, title_note=""):
        self.name, self.w = name, w
        self.parts, self.keys, self.pins = [], [], []
        self.title_note = title_note
        self.body_h = 0
        # Every fit failure on the map is collected, not raised on the first one
        # — one bad label per run makes fixing a size change take fourteen runs.
        self.problems = []

    def fail(self, msg):
        self.problems.append("%s: %s" % (self.name, msg))

    # --- shapes -----------------------------------------------------------
    def path(self, d, cls="terr"):
        self.parts.append('<path class="%s" d="%s"/>' % (cls, d))
        return self

    def rect(self, x, y, w, h, cls="s", lines=(), lcls=None, rx=2):
        self.parts.append('<rect class="%s" x="%g" y="%g" width="%g" height="%g" rx="%g"/>'
                          % (cls, x, y, w, h, rx))
        self._label(x + 5, y, w - 10, h, lines, lcls or ("lbl2" if cls == "s" else "lbl"))
        self.body_h = max(self.body_h, y + h)
        return self

    def circle(self, cx, cy, r, cls="b", inner=None):
        self.parts.append('<circle class="%s" cx="%g" cy="%g" r="%g"/>' % (cls, cx, cy, r))
        if inner:
            self.parts.append('<circle cx="%g" cy="%g" r="%g" fill="#2b353c" '
                              'stroke="#8fb0aa" stroke-width="0.9"/>' % (cx, cy, inner))
        self.body_h = max(self.body_h, cy + r)
        return self

    def free(self, x, y, lines, cls="lbl2"):
        """Text not tied to a box — still width-checked against the canvas."""
        for i, s in enumerate(lines):
            if x + text_w(s, LABEL_SIZE - 1, LABEL_TRACK - 0.2) > self.w - 4:
                self.fail("free text runs off canvas: %r" % s)
            self.parts.append('<text class="%s" x="%g" y="%g">%s</text>'
                              % (cls, x, y + i * LINE_H, esc(s)))
        self.body_h = max(self.body_h, y + len(lines) * LINE_H)
        return self

    def link(self, x1, y1, x2, y2):
        self.parts.append('<line class="link" x1="%g" y1="%g" x2="%g" y2="%g"/>' % (x1, y1, x2, y2))
        return self

    def pin(self, x, y, n):
        self.pins.append((x, y, n))
        self.body_h = max(self.body_h, y + 9)
        return self

    def key(self, text, hot=False):
        self.keys.append((text, hot))
        return self

    # --- internals --------------------------------------------------------
    def _label(self, x, y, maxw, boxh, lines, cls):
        if not lines:
            return
        size = LABEL_SIZE if cls != "lbl2" else LABEL_SIZE - 1
        for s in lines:
            if text_w(s, size, LABEL_TRACK) > maxw:
                self.fail("label %r needs %.0fpx, box gives %.0fpx (widen to %.0f)"
                          % (s, text_w(s, size, LABEL_TRACK), maxw,
                             text_w(s, size, LABEL_TRACK) + 10))
        if len(lines) * LINE_H + 4 > boxh:
            self.fail("%d lines don't fit box height %g" % (len(lines), boxh))
        top = y + (boxh - (len(lines) - 1) * LINE_H) / 2 + 4
        for i, s in enumerate(lines):
            self.parts.append('<text class="%s" x="%g" y="%g">%s</text>'
                              % (cls, x, top + i * LINE_H, esc(s)))

    def render(self):
        """The SVG is geometry and short labels only. The key rides alongside in
        keys.json and is drawn by the app as HTML."""
        h = self.body_h + 14
        out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%g" height="%g" '
               'viewBox="0 0 %g %g" role="img" aria-label="%s tactical schematic, traced from '
               'the in-game minimap.">' % (self.w, h, self.w, h, esc(self.name)),
               '<defs><pattern id="hz" width="8" height="8" patternTransform="rotate(45)" '
               'patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="8" stroke="#c25b4e" '
               'stroke-width="2.5" opacity="0.38"/></pattern>',
               '<style>%s</style></defs>' % CSS,
               '<text class="ttl" x="8" y="17">%s</text>' % esc(self.name.upper())]
        out += self.parts
        for x, y, n in self.pins:
            out.append('<circle class="pin" cx="%g" cy="%g" r="9"/>'
                       '<text class="pinn" x="%g" y="%g">%s</text>' % (x, y, x - 3.1, y + 4, n))
        out.append('</svg>')
        return "\n".join(out)

    def key_data(self):
        return {
            "name": self.name,
            "note": self.title_note.lstrip("— ").strip(),
            "lines": [{"text": s, "hot": hot} for s, hot in self.keys],
        }


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


# ======================================================================
# Specs. Short labels in shapes; everything else in the key.
# ======================================================================

def nuketown():
    c = Canvas("Nuketown", 400, "— schematic")
    c.rect(6, 40, 388, 24, "s", ["SIDE LANE"])
    c.rect(6, 210, 388, 24, "s", ["SIDE LANE"])
    c.rect(6, 100, 50, 74, "sp", ["SPAWN"])
    c.rect(342, 100, 50, 74, "sp", ["SPAWN"])
    c.rect(58, 76, 96, 122, "go", ["HOUSE"], "golbl")
    c.rect(58, 152, 52, 46, "s", ["GARAGE"])
    c.rect(240, 76, 96, 122, "go", ["HOUSE"], "golbl")
    c.rect(284, 152, 52, 46, "s", ["GARAGE"])
    c.rect(162, 70, 70, 134, "hot", ["CENTRE"], "hotlbl")
    c.rect(170, 64, 54, 20, "s", ["BUS"])
    c.rect(170, 188, 54, 20, "s", ["TRUCK"])
    c.pin(144, 88, "1"); c.pin(250, 88, "1"); c.pin(238, 200, "2")
    c.key("Spawns are the back gardens — clear them fast")
    c.key("1  Upper floor — the view over the centre")
    c.key("2  Truck opening — covers 3 of the 4 chokes")
    c.key("Centre is a warzone. Cars explode; not cover.", hot=True)
    return c


def firing_range():
    c = Canvas("Firing Range", 400, "— three routes")
    c.rect(140, 32, 120, 24, "sp", ["TROPAS · N"])
    c.rect(104, 64, 192, 40, "b", ["SHOOTING RANGE"])
    c.rect(20, 64, 76, 40, "s", ["BATHROOM", "HUT"])
    c.rect(180, 112, 100, 20, "hot", ["CONTAINER"], "hotlbl")
    c.rect(92, 112, 48, 70, "s", ["BACK", "ALLEY"])
    c.rect(148, 140, 116, 42, "go", ["TOP WOODEN"], "golbl")
    c.rect(294, 140, 98, 34, "s", ["SNIPER PERCH"])
    c.rect(294, 180, 98, 28, "s", ["THE NOOK"])
    c.rect(148, 188, 116, 20, "s", ["SANDBAGS"])
    c.rect(148, 214, 116, 24, "hot", ["LOWER MID"], "hotlbl")
    c.rect(30, 186, 88, 34, "s", ["DOUBLE", "BARRELS"])
    c.rect(160, 246, 128, 34, "go", ["GARAGE"], "golbl")
    c.rect(160, 286, 128, 24, "sp", ["OP 40 · S"])
    c.pin(252, 152, "1"); c.pin(276, 258, "2")
    c.key("1  Top wooden — eyes on most of the map")
    c.key("2  Garage — elevated, watches the crossings")
    c.key("Shooting range: campers and spawn points", hot=True)
    c.key("Flash over the container before committing", hot=True)
    return c


def summit():
    c = Canvas("Summit", 400, "— four chokes")
    c.rect(130, 108, 140, 96, "go", ["CONTROL ROOM", "TOP + BOTTOM"], "golbl")
    c.rect(130, 212, 140, 20, "hot", ["MIDDLE HALL"], "hotlbl")
    c.rect(288, 108, 100, 32, "hot", ["BACK ROOMS"], "hotlbl")
    c.rect(288, 148, 100, 32, "b", ["PORCH"])
    c.rect(288, 188, 100, 30, "s", ["ELECTRICAL"])
    c.rect(130, 58, 66, 40, "go", ["BACK", "AREA"], "golbl")
    c.rect(204, 58, 66, 40, "go", ["BACK", "STAIRS"], "golbl")
    c.rect(16, 108, 100, 36, "b", ["ROCK AREA"])
    c.rect(16, 152, 100, 26, "s", ["DBL BARRELS"])
    c.rect(16, 186, 100, 26, "hot", ["SKINNY BRDG"], "hotlbl")
    c.rect(16, 240, 128, 26, "sp", ["SPETSNAZ"])
    c.rect(258, 240, 130, 26, "sp", ["BLACK OPS"])
    c.link(116, 126, 130, 140); c.link(270, 124, 288, 124); c.link(338, 140, 338, 148)
    c.pin(256, 120, "1"); c.pin(184, 68, "2")
    c.key("1  Top control room — bigger once glass breaks")
    c.key("2  Back area / back stairs — underused")
    c.key("Rock area is the sniper route, west side")
    c.key("Black Ops balcony views major spawn points")
    c.key("Back rooms is fast to the porch, and fatal", hot=True)
    c.key("Orientation approximate — only west is stated")
    return c


def radiation():
    c = Canvas("Radiation", 400, "— fastest map")
    c.rect(8, 30, 96, 26, "sp", ["SPETSNAZ"])
    c.rect(8, 62, 96, 34, "s", ["SHIPPING RM"])
    c.rect(8, 102, 96, 30, "s", ["TOWER WALKS"])
    c.rect(8, 138, 96, 34, "go", ["LOOKOUT"], "golbl")
    c.rect(8, 178, 96, 28, "s", ["LOWER SPZ"])
    c.rect(116, 30, 80, 26, "s", ["FAN AREA"])
    c.rect(204, 30, 80, 26, "s", ["THE ROOF"])
    c.rect(116, 62, 168, 24, "b", ["MIDDLE GATES"])
    c.rect(116, 92, 80, 32, "s", ["DBL", "WINDOWS"])
    c.rect(204, 92, 80, 32, "go", ["UPPER", "CTRL"], "golbl")
    c.rect(116, 128, 168, 52, "b", ["REACTOR ROOM"])
    c.rect(116, 186, 168, 22, "hot", ["BACK SIDE"], "hotlbl")
    c.rect(296, 30, 96, 38, "sp", ["BLACK OPS"])
    c.rect(296, 74, 96, 32, "s", ["SHIPPING 2"])
    c.rect(296, 112, 96, 34, "go", ["FORKLIFT"], "golbl")
    c.rect(296, 152, 96, 28, "s", ["RED BARRELS"])
    c.rect(8, 224, 384, 34, "hot", ["BASEMENT TUNNEL"], "hotlbl")
    c.pin(280, 98, "1"); c.pin(384, 120, "2")
    c.key("1  Upper control room — holds the gate switch")
    c.key("2  Forklift — sees centre and bottom reactor")
    c.key("Centre reactor room is a spawn haven", hot=True)
    c.key("Tunnel: 5 entries, as unsafe as the centre", hot=True)
    return c


def jungle():
    c = Canvas("Jungle", 400, "— quick, long views")
    c.path("M150 26 L250 22 L306 36 L356 32 L372 60 L362 110 L376 142 L366 196 "
           "L328 226 L278 244 L244 272 L188 286 L128 280 L86 256 L44 238 L22 198 "
           "L34 158 L20 126 L48 98 L96 94 L118 56 Z")
    c.path("M108 82 L164 76 L180 104 L170 134 L120 138 L100 112 Z", "go")
    c.path("M240 94 L312 90 L334 122 L322 158 L264 166 L236 134 Z", "go")
    c.path("M150 148 L226 142 L264 168 L248 214 L190 234 L150 206 Z", "hot")
    c.rect(60, 166, 68, 26, "s", ["SOG CAMP"])
    c.rect(276, 34, 68, 26, "s", ["NE HUT"])
    c.rect(298, 182, 68, 26, "s", ["E BLOCKS"])
    c.free(186, 108, ["SMALL", "BRIDGE"], "hotlbl")
    c.free(196, 200, ["MID BRIDGE"], "hotlbl")
    c.pin(140, 96, "1"); c.pin(292, 112, "2")
    c.key("1  NW rise    2  NVA-side rise")
    c.key("Mid bridge cuts the map — almost no cover", hot=True)
    c.key("Sniper perch, back tree and rebel not placed")
    c.key("— the minimap carries no labels")
    return c


def hanoi():
    c = Canvas("Hanoi", 400, "— only two levels")
    c.path("M70 26 L210 22 L328 36 L342 98 L332 152 L346 188 L318 238 L296 276 "
           "L340 302 L386 356 L346 372 L292 322 L224 298 L160 290 L114 252 "
           "L46 246 L24 192 L44 142 L28 110 L56 80 Z")
    c.rect(196, 30, 130, 40, "s", ["OPEN COURTYARD"])
    c.path("M176 54 L204 46 L308 160 L288 180 Z", "hot")
    c.rect(92, 82, 112, 56, "go", ["PRISON", "2ND LEVELS"], "golbl")
    c.rect(92, 150, 100, 34, "s", ["CENTRAL AREA"])
    c.rect(16, 128, 72, 36, "s", ["BACK", "HOUSE"])
    c.circle(300, 186, 10, "go")
    c.rect(230, 210, 100, 26, "go", ["TRUCKS"], "golbl")
    c.rect(120, 200, 100, 34, "hot", ["CENTRAL 2"], "hotlbl")
    c.rect(268, 288, 92, 28, "s", ["NARROW SIDE"])
    c.pin(180, 74, "1"); c.pin(300, 186, "2")
    c.key("1  Long street — wide open, cross fast", hot=True)
    c.key("2  Well area — hard to shoot into")
    c.key("Back balcony railing is bugged: free cover")
    c.key("Back roof, courtyard, flower pot not placed")
    return c


def havana():
    c = Canvas("Havana", 400, "— go round, not through")
    c.rect(168, 66, 60, 200, "hot", ["MAIN", "STREET"], "hotlbl")
    c.rect(20, 30, 138, 24, "sp", ["TROPAS"])
    c.rect(238, 30, 150, 36, "b", ["SNIPER HOUSE"])
    c.rect(20, 72, 138, 52, "go", ["CIGAR SHOP", "2ND LEVEL"], "golbl")
    c.rect(238, 72, 150, 52, "go", ["HOTEL", "2ND LEVEL"], "golbl")
    c.rect(30, 134, 118, 32, "s", ["FOUNTAIN"])
    c.rect(20, 176, 98, 30, "s", ["BACK CAFE"])
    c.rect(122, 176, 46, 30, "s", ["TRASH"])
    c.rect(282, 134, 106, 32, "s", ["BAR"])
    c.rect(234, 134, 46, 72, "s", ["ALLEY"])
    c.rect(184, 176, 44, 30, "s", ["DUMP"])
    c.rect(238, 216, 150, 28, "b", ["THE SHELTER"])
    c.rect(20, 216, 118, 30, "hot", ["RED ROOMS"], "hotlbl")
    c.rect(20, 254, 138, 24, "sp", ["OP 40"])
    c.pin(150, 84, "1"); c.pin(376, 84, "2")
    c.key("1 and 2 are twins — hold one each with a mate")
    c.key("Cigar shop upstairs sees bus, bar and hotel")
    c.key("Hotel upstairs sees shelter, fountain, cafe")
    c.key("Motion sensor in the trash bags warns you")
    c.key("Red rooms: grenades and knifers", hot=True)
    return c


def grid():
    c = Canvas("Grid", 400, "— large, plays small")
    c.rect(110, 116, 284, 26, "hot", ["OPEN CORRIDOR"], "hotlbl")
    c.rect(130, 24, 110, 88, "go", ["MID CONTROL"], "golbl")
    c.rect(130, 148, 140, 76, "go", ["THE FACILITY", "2ND FLOOR"], "golbl")
    c.rect(44, 28, 68, 34, "s", ["HANGAR"])
    c.rect(44, 68, 68, 34, "s", ["PARKING"])
    c.rect(6, 148, 60, 32, "s", ["W BLOCK"])
    c.rect(50, 232, 80, 30, "s", ["LONG ALLEY"])
    c.rect(282, 24, 108, 30, "s", ["NE BLOCK"])
    c.rect(282, 62, 108, 42, "hot", ["EAST: OPEN", "GROUND"], "hotlbl")
    c.pin(228, 36, "1"); c.pin(256, 160, "2")
    c.key("1  Mid control — railing peeks the alley")
    c.key("2  Facility — doorways are a claymore choke", hot=True)
    c.key("East is a sniper haven; they hide in bushes", hot=True)
    c.key("Mid statue climb reaches upper control room")
    return c


def array_():
    c = Canvas("Array", 400, "— open, sniper-heavy")
    c.circle(170, 150, 46, "go", 30)
    c.free(140, 146, ["RELAY DISH"], "golbl")
    c.rect(196, 30, 78, 30, "s", ["N TOWER"])
    c.rect(28, 60, 96, 34, "s", ["NW RISE"])
    c.rect(28, 104, 96, 30, "s", ["NW BUILDING"])
    c.rect(20, 186, 96, 30, "s", ["WEST CPLX"])
    c.rect(240, 96, 96, 30, "s", ["E BUILDING"])
    c.rect(240, 136, 96, 30, "s", ["NE BLOCK"])
    c.rect(240, 186, 96, 30, "go", ["E HANGAR"], "golbl")
    c.rect(130, 236, 130, 24, "hot", ["OPEN SNOW"], "hotlbl")
    c.pin(216, 132, "1"); c.pin(266, 38, "2")
    c.key("1  Relay dish — bulk of the fighting, blind SE")
    c.key("2  N tower — climbable, and a sitting duck", hot=True)
    c.key("East side has cover: the safe north-south route")
    c.key("Crane, ice cannon, wedge, guardhouse not placed")
    return c


def wmd():
    c = Canvas("WMD", 400, "— verticality is the map")
    c.circle(300, 62, 20, "b", 11)
    c.free(258, 34, ["SILOS · EAST"], "lbl")
    c.rect(72, 78, 116, 44, "s", ["NORTH LANE"])
    c.rect(140, 138, 130, 66, "go", ["MIDDLE HOUSE", "4 ENTRANCES"], "golbl")
    c.rect(288, 112, 96, 82, "s", ["EAST", "STRUCTURE"])
    c.rect(8, 150, 96, 44, "s", ["WEST WING"])
    c.rect(88, 218, 128, 46, "s", ["WAREHOUSE"])
    c.rect(228, 218, 130, 46, "go", ["FACTORY"], "golbl")
    c.rect(88, 276, 200, 40, "s", ["SOUTH SHEDS"])
    c.rect(140, 96, 130, 30, "hot", ["OPEN MIDDLE"], "hotlbl")
    c.rect(296, 276, 96, 24, "sp", ["EAST SPAWN"])
    c.rect(8, 202, 96, 24, "sp", ["WEST SPAWN"])
    c.pin(258, 150, "1"); c.pin(198, 230, "2")
    c.key("1  Middle house — 2nd level is a 360 view")
    c.key("2  Factory — three entrances onto the middle")
    c.key("Warehouse over the silos is a camper's haven", hot=True)
    c.key("Rafters, catwalk, cat house, perch not placed")
    return c


def launch():
    c = Canvas("Launch", 400, "— team map")
    c.circle(200, 60, 26, "b", 14)
    c.free(168, 30, ["ROCKET"], "lbl")
    c.rect(166, 96, 66, 116, "hot", ["MIDDLE"], "hotlbl")
    c.rect(106, 96, 58, 46, "go", ["THREE", "STOREY"], "golbl")
    c.rect(234, 96, 58, 46, "go", ["THREE", "STOREY"], "golbl")
    c.rect(142, 150, 116, 24, "s", ["MIRRORED BRIDGE"])
    c.rect(30, 96, 74, 34, "s", ["W STRUCTS"])
    c.rect(296, 96, 74, 34, "s", ["E STRUCTS"])
    c.rect(30, 138, 74, 24, "sp", ["SPETSNAZ"])
    c.rect(292, 138, 80, 24, "sp", ["BLACK OPS"])
    c.rect(112, 184, 176, 24, "s", ["BULLETPROOF BARRIERS"])
    c.pin(156, 108, "1"); c.pin(242, 108, "1")
    c.key("1  Three-storey routes — bottom to top rocket")
    c.key("Identical both sides; one sprint to the top")
    c.key("Middle is split by rails — most deaths here", hot=True)
    c.key("Rocket kills anyone beneath it at halfway", hot=True)
    return c


def villa():
    c = Canvas("Villa", 400, "— three elevated holds")
    c.circle(210, 96, 40, "b", 22)
    c.free(178, 44, ["FOUNTAIN"], "lbl")
    c.rect(20, 108, 108, 44, "go", ["MANSION"], "golbl")
    c.rect(20, 60, 108, 34, "water", ["POOL · TROPAS"])
    c.rect(140, 150, 108, 34, "s", ["INNER ROOMS"])
    c.rect(272, 30, 116, 34, "s", ["NE BUILDINGS"])
    c.rect(272, 74, 116, 44, "go", ["SNIPER HOUSE"], "golbl")
    c.rect(20, 168, 108, 34, "s", ["GUARD HOUSE"])
    c.rect(140, 196, 108, 30, "hot", ["CONNECTOR"], "hotlbl")
    c.rect(272, 150, 116, 40, "b", ["MARKET · OP 40"])
    c.rect(140, 240, 108, 28, "s", ["BACK ROAD"])
    c.pin(120, 120, "1"); c.pin(380, 86, "2")
    c.key("1  Mansion — eyes across to the sniper house")
    c.key("2  Sniper house — the counter-hold")
    c.key("Statue peeks the connector from a safe distance")
    c.key("Garage and bar both lead back to the pool")
    c.key("Watch the back hill and back-road flankers", hot=True)
    return c


def crisis():
    c = Canvas("Crisis", 400, "— versatile, tricky guns")
    c.rect(20, 60, 116, 62, "go", ["CASTRO'S", "HOUSE"], "golbl")
    c.rect(20, 130, 116, 30, "sp", ["TROPAS"])
    c.rect(20, 172, 116, 28, "s", ["SW BUILDING"])
    c.rect(150, 40, 108, 34, "s", ["MID ARCHES"])
    c.rect(150, 84, 108, 34, "s", ["SIDE ROOF"])
    c.rect(150, 130, 108, 30, "hot", ["CONTROL RM"], "hotlbl")
    c.rect(150, 172, 108, 28, "s", ["BOTTOM CASTRO"])
    c.rect(272, 60, 116, 30, "rock", ["ROCK PERCH 1"])
    c.rect(272, 100, 116, 30, "rock", ["ROCK PERCH 2"])
    c.rect(272, 140, 116, 30, "go", ["MID SANDBAGS"], "golbl")
    c.rect(272, 180, 116, 26, "sp", ["OP 40 · BEACH"])
    c.pin(128, 72, "1"); c.pin(250, 142, "2")
    c.key("1  Wall jump to upper Castro, skip the stairs")
    c.key("2  Control room — quickest route between spawns")
    c.key("Centre stairs stay the popular choke", hot=True)
    c.key("Rock hill leads up to the middle sandbags")
    return c


def cracked():
    c = Canvas("Cracked", 400, "— keep moving")
    c.rect(176, 26, 44, 232, "hot", ["MAIN", "ROAD"], "hotlbl")
    c.rect(8, 104, 384, 24, "hot", ["MAIN ROAD — DANGEROUS TO CROSS"], "hotlbl")
    c.rect(140, 140, 116, 48, "go", ["BLOWN-OUT BLDG"], "golbl")
    c.rect(8, 30, 108, 34, "s", ["NW BLOCK"])
    c.rect(8, 140, 108, 44, "go", ["W BUILDING", "3 STOREYS"], "golbl")
    c.rect(8, 196, 108, 30, "s", ["SW BLOCK"])
    c.rect(240, 30, 152, 30, "s", ["NE BLOCKS"])
    c.rect(240, 66, 152, 30, "s", ["NVA SPAWN SIDE"])
    c.rect(276, 140, 116, 44, "go", ["E BUILDING"], "golbl")
    c.rect(276, 196, 116, 30, "s", ["S BLOCK"])
    c.pin(246, 152, "1"); c.pin(106, 152, "2")
    c.key("1  Blown-out building — controlling it wins")
    c.key("2  Climb for a third-storey long-range peek")
    c.key("Claymores on the middle building's 2nd storey", hot=True)
    c.key("Lookouts, fruit market, rabbit hole not placed")
    return c


BUILDERS = [nuketown, firing_range, summit, radiation, jungle, hanoi, havana,
            grid, array_, wmd, launch, villa, crisis, cracked]
SLUGS = ["nuketown", "firing-range", "summit", "radiation", "jungle", "hanoi", "havana",
         "grid", "array", "wmd", "launch", "villa", "crisis", "cracked"]


def main():
    os.makedirs(OUT, exist_ok=True)
    built, keys, problems = [], {}, []
    for slug, fn in zip(SLUGS, BUILDERS):
        c = fn()
        problems += c.problems
        built.append((slug, c.render()))
        keys[slug] = c.key_data()
    if problems:
        print("%d layout problems — nothing written:\n" % len(problems))
        for p in problems:
            print("  " + p)
        raise SystemExit(1)
    for slug, svg in built:
        with open(os.path.join(OUT, slug + ".svg"), "w", encoding="utf-8") as fh:
            fh.write(svg)
    with open(KEYS_OUT, "w", encoding="utf-8") as fh:
        json.dump({"note": "Generated by scripts/build_diagrams.py — do not hand-edit.",
                   "zones": {"go": "head for", "hot": "avoid, or cross fast"},
                   "maps": keys}, fh, indent=1, ensure_ascii=False)
    print("wrote %d diagrams to %s" % (len(built), OUT))
    print("wrote %s" % KEYS_OUT)


if __name__ == "__main__":
    main()
