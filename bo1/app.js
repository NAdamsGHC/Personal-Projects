/* BO1 Companion — all rendering is driven from the JSON in /data.
   No build step, no dependencies, no stored state beyond the current session. */

const DATA = {};

const state = {
  weaponClass: "All",
  mapId: null,
  sideIndex: 0,
  scoreMapId: "general",
  build: null,
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ms = (secs) => (secs === null || secs === undefined) ? "—" : `${Math.round(secs * 1000)}ms`;

/* A one-pull kill has no time-to-kill to speak of, so say so rather than
   printing 0ms and letting it sort like a number. */
const ttkLabel = (w) =>
  (w && w.stk && w.stk.torso === 1) ? "1 shot" : ms(w ? w.ttk.close : null);

/* ── boot ─────────────────────────────────────────────────── */

Promise.all([
  ...["weapons", "maps", "perks", "classes", "killstreaks", "attachments"]
    .map((n) => fetch(`data/${n}.json`).then((r) => r.json()).then((j) => [n, j])),
  fetch("diagrams/keys.json").then((r) => r.json()).then((j) => ["diagramKeys", j]),
]).then((pairs) => {
  pairs.forEach(([n, j]) => (DATA[n] = j));
  initTabs();
  renderMapGrid();
  initWeapons();
  renderPerks();
  initClasses();
  renderKillstreaks();
}).catch((err) => {
  document.querySelector("main").innerHTML =
    `<p class="hint">Could not load data: ${esc(err.message)}</p>`;
});

/* ── tabs ─────────────────────────────────────────────────── */

function initTabs() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    showTab(btn.dataset.tab);
  });
}

function showTab(name) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll("main .tab").forEach((s) => s.classList.toggle("on", s.id === name));
  window.scrollTo(0, 0);
}

/* ── shared lookups ───────────────────────────────────────── */

function classById(id) {
  return DATA.classes.presets.find((p) => p.id === id);
}

function streakProfile(id) {
  return DATA.killstreaks.profiles.find((p) => p.id === id);
}

function streakCost(name) {
  const k = DATA.killstreaks.killstreaks.find((x) => x.name === name);
  return k ? k.kills : null;
}

/* Full-damage reach, after any suppressor on the build. */
function effectiveReach(w, attachments) {
  if (!w) return null;
  const base = w.profile[0] && w.profile[0].toM ? w.profile[0].toM : null;
  if (!(attachments || []).includes("Suppressor")) return base;
  const s = w.suppressed && w.suppressed.profile[0];
  return s && s.toM ? s.toM : base;
}

/* ── PRE-MATCH ────────────────────────────────────────────── */

function renderMapGrid() {
  const grid = $("#map-grid");
  grid.innerHTML = "";
  DATA.maps.maps.forEach((m) => {
    const t = el("button", "map-tile", `<b>${esc(m.name)}</b><i>${esc(m.size)}</i>`);
    if (m.tile) {
      t.classList.add("has-art");
      t.style.backgroundImage = `url("${m.tile}")`;
    }
    t.addEventListener("click", () => openBrief(m.id));
    grid.appendChild(t);
  });
}

function openBrief(id) {
  state.mapId = id;
  state.sideIndex = 0;
  $("#map-grid").classList.add("hidden");
  $("#map-brief").classList.remove("hidden");
  renderBrief();
  window.scrollTo(0, 0);
}

function closeBrief() {
  state.mapId = null;
  $("#map-brief").classList.add("hidden");
  $("#map-grid").classList.remove("hidden");
  window.scrollTo(0, 0);
}

function renderBrief() {
  const m = DATA.maps.maps.find((x) => x.id === state.mapId);
  const side = m.sides[state.sideIndex];
  const box = $("#map-brief");
  box.innerHTML = "";

  const back = el("button", "back", "&larr; All maps");
  back.addEventListener("click", closeBrief);
  box.appendChild(back);

  const head = el("div", "brief-head",
    `<h2>${esc(m.name)}</h2><span class="size">${esc(m.size)} &middot; TDM</span>`);
  box.appendChild(head);

  // ── the lobby view: schematic, its key, the class, the streaks ──
  if (m.diagram) box.appendChild(diagramFigure(m));

  const q = m.quick;
  if (q) {
    const qb = el("div", "quick");
    qb.appendChild(el("div", "chips-row",
      `<span class="chip battle">${esc(q.battle)}</span>
       <span class="chip style">${esc(q.style)}</span>`));
    box.appendChild(qb);
    box.appendChild(classCallBlock(q));
    box.appendChild(streakCallBlock(q));

    const pin = el("div", "pinbox");
    pin.appendChild(el("div", "pinhead", "How far to push"));
    pin.appendChild(el("p", "", esc(q.pinLine)));
    box.appendChild(pin);
  }

  // ── the full brief. Built here, but inserted directly under the map name so
  //    it is the first thing on the page — closed, because the lobby view below
  //    it is what you read in the thirty seconds before a match starts. ──
  const brief = el("details", "ref brief-fold");
  brief.appendChild(el("summary", "", "Brief"));
  const box2 = el("div", "body");

  // 1 — identity
  box2.appendChild(el("p", "identity", esc(m.identity)));

  // 2 — spawns, with the side toggle
  const toggle = el("div", "side-toggle");
  m.sides.forEach((s, i) => {
    const b = el("button", i === state.sideIndex ? "on" : "", esc(s.name));
    b.addEventListener("click", () => { state.sideIndex = i; renderBrief(); });
    toggle.appendChild(b);
  });
  const spawnField = el("div", "field", "<h3>Spawns</h3>");
  spawnField.appendChild(toggle);
  spawnField.appendChild(el("p", "", `<strong>You start:</strong> ${esc(side.spawn)}`));
  const ss = DATA.maps.spawnSystem;
  if (ss) {
    const how = el("details", "ref");
    how.style.marginTop = "10px";
    how.appendChild(el("summary", "", "How spawns actually work"));
    const hb = el("div", "body");
    hb.appendChild(el("p", "", esc(ss.how)));
    if (ss.rule) hb.appendChild(el("div", "note", esc(ss.rule)));
    hb.appendChild(el("div", "kv", `<div class="k">What flips them</div>`));
    const tl = el("ul", "challenges");
    ss.triggers.forEach((t) => tl.appendChild(el("li", "", esc(t))));
    hb.appendChild(tl);
    hb.appendChild(el("div", "kv", `<div class="k">How you spot it</div>`));
    const el2 = el("ul", "challenges");
    ss.tells.forEach((t) => el2.appendChild(el("li", "", esc(t))));
    hb.appendChild(el2);
    if (ss.note) hb.appendChild(el("p", "", esc(ss.note)));
    if (ss.correction) hb.appendChild(el("div", "note bad", esc(ss.correction)));
    hb.appendChild(el("p", "src", esc(ss.source)));
    how.appendChild(hb);
    spawnField.appendChild(how);
  }
  box2.appendChild(spawnField);

  // 3 — power positions
  box2.appendChild(listField("Power positions", m.powerPositions, "name", "why"));

  // 4 — where they'll be
  box2.appendChild(listField("Where they'll be", m.enemySpots, "name", "note"));

  // 5 — the trap
  const trap = el("div", "field warn", "<h3>The trap</h3>");
  trap.appendChild(el("p", "", esc(m.trap)));
  box2.appendChild(trap);

  // 6 — your route
  const route = el("div", "field", "<h3>Your route</h3>");
  route.appendChild(el("p", "", `<strong>First ten seconds:</strong> ${esc(side.opening)}`));
  route.appendChild(el("p", "", `<strong>The flank:</strong> ${esc(side.flank)}`));
  route.appendChild(el("div", "pinch", `<b>Pinch point</b>${esc(side.pinch)}`));
  box2.appendChild(route);

  // the real in-game minimap — lazy, because it sits behind two closed folds
  if (m.minimap) {
    const mm = el("details", "ref");
    mm.appendChild(el("summary", "", "In-game minimap"));
    const mb = el("div", "body");
    const mfig = el("figure", "diagram minimap");
    const mimg = document.createElement("img");
    mimg.loading = "lazy";
    mimg.src = m.minimap;
    mimg.alt = `${m.name} in-game minimap`;
    mfig.appendChild(mimg);
    mb.appendChild(mfig);
    mm.appendChild(mb);
    box2.appendChild(mm);
  }

  // leisure reading
  const deep = el("details", "ref");
  deep.appendChild(el("summary", "", "Deeper notes"));
  const body = el("div", "body");
  m.deeper.forEach((d) => body.appendChild(el("p", "", esc(d))));
  deep.appendChild(body);
  box2.appendChild(deep);

  // what's sourced vs what's reasoning — stated per map rather than buried
  if (m.verified && m.verified.length) {
    const ver = el("details", "ref");
    ver.appendChild(el("summary", "", "Checked against the wiki"));
    const vb = el("div", "body");
    const ul = el("ul", "challenges");
    m.verified.forEach((v) => ul.appendChild(el("li", "", esc(v))));
    vb.appendChild(ul);
    vb.appendChild(el("p", "src",
      "Everything above that isn't in this list — routes, pinch points, opening moves — is reasoning from the layout, not a sourced fact."));
    ver.appendChild(vb);
    box2.appendChild(ver);
  }

  box2.appendChild(el("p", "src",
    `Layout: ${esc(DATA.maps.source.layout)} Tactics: ${esc(DATA.maps.source.tactics)}`));

  brief.appendChild(box2);
  head.insertAdjacentElement("afterend", brief);
}

/* The schematic, plus its key as real HTML underneath. The key used to be drawn
   into the SVG, where a 400-unit canvas shown at phone width rendered it around
   7px. Out here it is body text that wraps. */
function diagramFigure(m) {
  const fig = el("figure", "diagram");
  const img = document.createElement("img");
  img.src = m.diagram;
  img.alt = `${m.name} tactical schematic`;
  fig.appendChild(img);

  const keys = DATA.diagramKeys && DATA.diagramKeys.maps[m.id];
  if (keys) {
    const k = el("div", "dkey");
    const zones = DATA.diagramKeys.zones;
    k.appendChild(el("div", "dzones",
      `<span class="z go"></span>${esc(zones.go)}
       <span class="z hot"></span>${esc(zones.hot)}`));
    const ul = el("ul");
    keys.lines.forEach((line) => ul.appendChild(el("li", line.hot ? "hot" : "", esc(line.text))));
    k.appendChild(ul);
    k.appendChild(el("p", "dnote",
      "Geometry traced from the in-game minimap; the minimaps carry no text, so building names are best-effort."));
    fig.appendChild(k);
  }
  return fig;
}

/* The class called for on this map, resolved live from classes.json so the
   brief and the Classes tab can't drift apart. */
function classCallBlock(q) {
  const c = classById(q.classId);
  const wrap = el("div", "callout");
  if (!c) {
    wrap.appendChild(el("p", "", "No class set for this map."));
    return wrap;
  }
  wrap.appendChild(el("div", "callhead", "Class to run"));
  wrap.appendChild(el("div", "callname", esc(c.name)));
  wrap.appendChild(el("p", "calldesc", esc(c.description)));

  const kit = el("div", "kit");
  const atts = c.primaryAttachments.length ? c.primaryAttachments.join(" + ") : "no attachment";
  kit.appendChild(el("div", "kitline",
    `<span class="kk">Gun</span><span class="kv2">${esc(c.primary)} &middot; ${esc(atts)}</span>`));
  kit.appendChild(el("div", "kitline",
    `<span class="kk">Perks</span><span class="kv2">${c.perks.map(esc).join(" &middot; ")}</span>`));
  kit.appendChild(el("div", "kitline",
    `<span class="kk">Gear</span><span class="kv2">${esc(c.lethal)} &middot; ${esc(c.tactical)} &middot; ${esc(c.gear)}</span>`));
  wrap.appendChild(kit);

  wrap.appendChild(el("p", "callwhy", esc(q.classWhy)));

  const jump = el("button", "back");
  jump.style.margin = "10px 0 0";
  jump.innerHTML = "Open in Classes &rarr;";
  jump.addEventListener("click", () => {
    showTab("classes");
    selectPreset(c.id, state.mapId);
  });
  wrap.appendChild(jump);
  return wrap;
}

function streakCallBlock(q) {
  const p = streakProfile(q.streakSet);
  const wrap = el("div", "callout streaks");
  if (!p) return wrap;
  wrap.appendChild(el("div", "callhead", "Killstreaks"));
  wrap.appendChild(el("div", "callname", esc(p.name)));
  const ul = el("ul", "streaklist");
  p.streaks.forEach((s) => {
    const n = streakCost(s);
    ul.appendChild(el("li", "", `<b>${n === null ? "?" : n}</b>${esc(s)}`));
  });
  wrap.appendChild(ul);
  wrap.appendChild(el("p", "callwhy", esc(q.streakWhy)));
  return wrap;
}

function listField(title, items, keyName, keyBody) {
  const f = el("div", "field", `<h3>${esc(title)}</h3>`);
  const ul = el("ul");
  items.forEach((it) => ul.appendChild(el("li", "",
    `<b>${esc(it[keyName])}</b><span>${esc(it[keyBody])}</span>`)));
  f.appendChild(ul);
  return f;
}

/* ── WEAPONS ──────────────────────────────────────────────── */

function fullDepth() {
  return DATA.weapons.weapons.filter((w) => w.depth === "full");
}

function findWeapon(name) {
  const n = String(name).toLowerCase();
  return DATA.weapons.weapons.find((w) =>
    w.name.toLowerCase() === n ||
    w.baseName.toLowerCase() === n ||
    (w.aliases || []).some((a) => a.toLowerCase() === n));
}

function initWeapons() {
  const cls = $("#class-filter");
  ["All", "AR", "SMG", "LMG", "Sniper", "Shotgun", "Pistol"].forEach((c) => {
    const o = el("option", "", c === "All" ? "All classes" : c);
    o.value = c;
    cls.appendChild(o);
  });
  cls.addEventListener("change", () => { state.weaponClass = cls.value; renderWeaponList(); });
  renderWeaponList();
}

function renderWeaponList() {
  $("#weapon-detail").classList.add("hidden");
  const list = $("#weapon-list");
  list.classList.remove("hidden");
  list.innerHTML = "";

  let ws = fullDepth();
  if (state.weaponClass !== "All") ws = ws.filter((w) => w.class === state.weaponClass);
  // One-shot weapons all tie at 0ms, so aim-in time breaks the tie — between
  // two guns that kill on contact, the one that gets there first wins.
  ws.sort((a, b) => ((a.ttk.close ?? 9) - (b.ttk.close ?? 9)) || (a.adsTime - b.adsTime));

  $("#weapon-count").textContent =
    `${ws.length} weapons, fastest kill first. Time-to-kill assumes hits to the upper torso ` +
    `at full damage — check the reach beside it before you believe it. Anything you fire one ` +
    `pull at a time is capped at ${DATA.weapons.units.tapHz} pulls a second, which is an ` +
    `estimate of a normal trigger finger rather than a datamined figure.`;

  ws.forEach((w) => {
    const reach = w.profile[0] && w.profile[0].toM ? `${w.profile[0].toM} m` : "any range";
    const mode = w.fireModeShort
      ? `<span class="tag mode" title="${esc(w.fireModeLabel)}">${esc(w.fireModeShort)}</span>`
      : "";
    const r = el("button", "row",
      `<span class="nm">${esc(w.name)}</span>
       ${mode}
       <span class="tag">${esc(w.class)}${w.classified ? " ·CLS" : ""}</span>
       <span class="reach">${reach}</span>
       <span class="ttk">${ttkLabel(w)}</span>`);
    r.addEventListener("click", () => openWeapon(w.name));
    list.appendChild(r);
  });
}

function openWeapon(name) {
  const w = findWeapon(name);
  if (!w) return;
  showTab("weapons");
  $("#weapon-list").classList.add("hidden");
  const d = $("#weapon-detail");
  d.classList.remove("hidden");
  d.innerHTML = "";

  const back = el("button", "back", "&larr; All weapons");
  back.addEventListener("click", renderWeaponList);
  d.appendChild(back);

  d.appendChild(el("h2", "", esc(w.name)));
  d.appendChild(el("p", "sub",
    `${esc(w.class)} &middot; ${esc(w.fireModeLabel)} &middot; Unlock level ${w.unlockLevel}${w.classified ? " (classified)" : ""}`));

  const stats = el("div", "stats");
  const stat = (k, v) => stats.appendChild(el("div", "stat", `<div class="k">${k}</div><div class="v">${v}</div>`));
  stat("Damage", `${w.damage.max}<small> / ${w.damage.min}</small>${w.pellets ? `<small> ×${w.pellets}</small>` : ""}`);
  stat("Rate of fire", `${Math.round(w.rpm)}<small> rpm</small>`);
  stat("Kill", `<span style="color:var(--hot)">${ttkLabel(w)}</span>`);
  stat("ADS", `${w.adsTime}<small>s</small>`);
  d.appendChild(stats);

  // The headline claim, spelled out — this is where snipers used to be wrong.
  if (w.oneShot && w.oneShot.length) {
    d.appendChild(el("div", "note good",
      `<b>One-shot kill.</b> ${esc(oneShotSentence(w))}`));
  }

  if (w.rateCapped) {
    d.appendChild(el("div", "note",
      `<b>You are the fire rate.</b> The gun will accept ${Math.round(w.rpm)} rpm, but you have to
       pull the trigger for every round. Timings here assume
       ${DATA.weapons.units.tapHz} pulls a second — an estimate of a normal trigger finger, not a
       datamined number. Tap faster and you beat it; panic and you won't.`));
  }

  if (w.missPenalty) {
    d.appendChild(el("div", "note bad",
      `<b>A miss costs you ${ms(w.missPenalty)}.</b> That is the re-chamber before you can fire
       again, and it is longer than most guns need to kill you outright.`));
  }

  // The range profile is the un-multiplied case: what it takes if you catch a
  // limb rather than the chest. On most guns that's the same number and the
  // heading is unremarkable; on a sniper it's the difference between one shot
  // and two, so say which one you're looking at.
  const limbOnly = w.stk.torso && w.stk.close && w.stk.torso < w.stk.close;
  d.appendChild(el("h3", "tier-head",
    w.pellets ? "Pellets on target, by range"
      : limbOnly ? "If you catch a limb rather than the body"
      : "Shots to kill by range"));
  const prof = el("div", "profile");
  w.profile.forEach((b) => {
    const need = w.pellets
      ? `${b.hits} of ${w.pellets} pellets`
      : `${b.shots} shot${b.shots === 1 ? "" : "s"}`;
    const pulls = w.pellets && b.shots === 1 ? " · one pull" : "";
    prof.appendChild(el("div", "profile-row",
      `<span class="shots">${esc(need)}</span>
       <span class="rng">${b.beyond ? "beyond that" : `out to ${b.toM} m`}${pulls}</span>
       <span class="t">${b.shots === 1 ? "—" : ms(b.ttk)}</span>`));
  });
  d.appendChild(prof);

  // Where you hit changes the answer — this is the multiplier table, applied.
  const z = w.killZones || {};
  if (Object.keys(z).length) {
    const rows = [["Head", z.head], ["Neck", z.neck],
                  ["Upper torso", z.upperTorso], ["Lower torso", z.lowerTorso],
                  ["Arms and legs", w.stk.close]]
      .filter(([, n]) => n);
    const uniform = rows.every(([, n]) => n === rows[0][1]);
    if (rows.length && !(uniform && !limbOnly)) {
      d.appendChild(el("h3", "tier-head", "Where you hit"));
      const zb = el("div", "profile");
      rows.forEach(([k, n]) => zb.appendChild(el("div", "profile-row",
        `<span class="shots">${esc(k)}</span>
         <span class="rng">${n} ${w.pellets ? (n === 1 ? "pull" : "pulls") : (n === 1 ? "shot" : "shots")}</span>
         <span class="t">${n === 1 ? "instant" : ""}</span>`)));
      d.appendChild(zb);
    }
  }

  if (w.suppressed) {
    const base = w.profile[0], sup = w.suppressed.profile[0];
    if (base && sup && base.toM && sup.toM) {
      const drop = Math.round((1 - sup.toM / base.toM) * 100);
      d.appendChild(el("div", "note bad",
        `<b>Suppressor costs you range.</b> The ${base.shots}-shot kill drops from
         <b>${base.toM} m</b> to <b>${sup.toM} m</b> — a ${drop}% cut. Past that you need an extra
         bullet. What you get back is no dot on their minimap when you fire, which is worth having
         where you're flanking and worth very little where you're trading.`));
    }
  }

  // Rapid Fire only means anything where a second shot is involved — on a
  // one-pull kill there is no time-to-kill for it to shorten.
  if (w.rapidFire && w.stk.torso > 1) {
    d.appendChild(el("div", "note",
      `<b>Rapid Fire</b> takes it to ${Math.round(w.rapidFire.rpm)} rpm, pulling the close-range kill
       from ${ms(w.ttk.close)} down to <b>${ms(w.rapidFire.ttkClose)}</b>.`));
  } else if (w.rapidFire) {
    d.appendChild(el("div", "note",
      `<b>Rapid Fire</b> takes it to ${Math.round(w.rapidFire.rpm)} rpm. It can't shorten a kill that
       already takes one pull — what it buys you is a faster second shot when the first one misses.`));
  }

  const dw = DATA.weapons.weapons.find((x) => x.baseName === w.baseName && x.variant === "dual-wield");
  if (dw) d.appendChild(el("div", "note",
    `<b>Dual Wield available.</b> Doubles your ammo and removes aiming down sights entirely.`));

  // Which classes carry it, and therefore which maps call for it.
  const carriedBy = DATA.classes.presets.filter((p) => findWeapon(p.primary)?.name === w.name);
  if (carriedBy.length) {
    const maps = DATA.maps.maps.filter((m) => carriedBy.some((p) => p.id === m.quick.classId));
    d.appendChild(el("div", "note",
      `<b>Carried by:</b> ${carriedBy.map((p) => esc(p.name)).join(", ")}.` +
      (maps.length ? ` Called for on ${maps.map((m) => esc(m.name)).join(", ")}.` : "")));
  }

  d.appendChild(el("p", "src", `Stats: ${esc(w.source)}. ${esc(DATA.weapons.source.note)} ${esc(DATA.weapons.source.tapRate)}`));
  window.scrollTo(0, 0);
}

function oneShotSentence(w) {
  const z = w.oneShot;
  const has = (k) => z.includes(k);
  const where = has("lowerTorso") ? "anywhere on the body"
    : has("upperTorso") ? "to the chest or above"
    : has("neck") ? "to the neck or head"
    : "to the head";
  if (w.pellets) {
    const b = w.profile[0];
    return `One pull kills ${where} out to ${b.toM} m, if enough of the pattern lands — ` +
           `${b.hits} of ${w.pellets} pellets. Past that it takes a second shot.`;
  }
  return `Kills ${where} at any range. The damage figure alone says two shots; ` +
         `the multiplier on that hit is what makes it one.`;
}

/* ── PERKS ────────────────────────────────────────────────── */

function renderPerks() {
  const box = $("#perk-list");
  box.innerHTML = "";
  [1, 2, 3].forEach((tier) => {
    box.appendChild(el("div", "tier-head", `Tier ${tier}`));
    DATA.perks.perks.filter((p) => p.tier === tier).forEach((p) => {
      const dt = el("details", "perk");
      dt.appendChild(el("summary", "", esc(p.name)));
      const b = el("div", "body");
      b.appendChild(el("div", "kv", `<div class="k">Effect</div><div class="v">${esc(p.effect)}</div>`));
      b.appendChild(el("div", "kv pro", `<div class="k">Pro</div><div class="v">${esc(p.proEffect)}</div>`));
      const ch = el("div", "kv");
      ch.appendChild(el("div", "k", "Pro challenges"));
      const ol = el("ol", "challenges");
      p.challenges.forEach((c) => ol.appendChild(el("li", "", esc(c))));
      ch.appendChild(ol);
      b.appendChild(ch);
      b.appendChild(el("div", "kv", `<div class="k">In TDM</div><div class="v">${esc(p.tdm)}</div>`));
      /* Only some perks have been measured in-game. The numbers are hand-timed
         community tests rather than datamined, so they sit apart from the
         effect text and say where they came from. */
      if (p.measured && p.measured.length) {
        const mv = el("div", "kv");
        mv.appendChild(el("div", "k", "Tested"));
        const ul = el("ul", "challenges");
        p.measured.forEach((m) => ul.appendChild(el("li", "", esc(m))));
        mv.appendChild(ul);
        b.appendChild(mv);
      }
      b.appendChild(el("div", "kv", `<div class="k">In practice</div><div class="v"><strong>${esc(p.note)}</strong></div>`));
      dt.appendChild(b);
      box.appendChild(dt);
    });
  });
  const s = DATA.perks.source;
  box.appendChild(el("p", "src",
    `Effects: ${esc(s.effects)}. Challenges: ${esc(s.challenges)}. ${esc(s.measured)}`));
  renderSynergy();
}

/* Perks are picked one per tier, so what matters is which combinations pull in
   the same direction. Read straight off the same rules the Classes tab uses. */
function renderSynergy() {
  const box = $("#perk-synergy");
  if (!box) return;
  box.className = "body";
  box.innerHTML = "";
  box.appendChild(el("p", "hint",
    "One perk from each tier, so the question is never which perk is best — it's which three " +
    "agree with each other. These are the combinations that do something together that neither " +
    "does alone."));
  // Only rules that turn purely on the perks belong here. Anything that also
  // depends on the map or the gun is a read for a specific build, not a general
  // statement about a perk, and it says so over on the Classes tab.
  const perkOnly = DATA.classes.traits.rules.filter((r) =>
    r.when.perks && Object.keys(r.when).every((k) => k === "perks"));

  perkOnly.filter((r) => r.when.perks.length > 1)
    .forEach((r) => box.appendChild(el("div", "note",
      `<b>${esc(r.when.perks.join(" + "))}</b> — ${esc(r.excels || r.struggles)}`)));
  perkOnly.filter((r) => r.when.perks.length === 1 && r.struggles)
    .forEach((r) => box.appendChild(el("div", "note bad",
      `<b>${esc(r.when.perks[0])}</b> — ${esc(r.struggles)}`)));
}

/* ── KILLSTREAKS ──────────────────────────────────────────── */

function renderKillstreaks() {
  const box = $("#killstreak-list");
  box.className = "body";
  box.innerHTML = "";
  if (DATA.killstreaks.profilesNote) {
    box.appendChild(el("p", "hint", esc(DATA.killstreaks.profilesNote)));
  }
  DATA.killstreaks.profiles.forEach((p) => {
    box.appendChild(el("div", "note",
      `<b>${esc(p.name)}</b> — ${esc(p.streaks.join(" / "))}. ${esc(p.note)}`));
  });
  DATA.killstreaks.killstreaks.forEach((k) => {
    box.appendChild(el("div", "ks-row",
      `<span class="n">${k.kills}</span><span class="nm">${esc(k.name)}</span>
       <span class="d">${esc(k.tdm)}</span>`));
  });
}

/* ── CLASSES ──────────────────────────────────────────────── */

function initClasses() {
  const sel = $("#score-map");
  const gen = el("option", "", "General TDM");
  gen.value = "general";
  sel.appendChild(gen);
  DATA.maps.maps.forEach((m) => {
    const o = el("option", "", m.name);
    o.value = m.id;
    sel.appendChild(o);
  });
  sel.addEventListener("change", () => { state.scoreMapId = sel.value; renderReadout(); });

  const bar = $("#preset-bar");
  DATA.classes.presets.forEach((p) => {
    const b = el("button", "", esc(p.name));
    b.dataset.preset = p.id;
    b.addEventListener("click", () => selectPreset(p.id));
    bar.appendChild(b);
  });

  selectPreset(DATA.classes.presets[0].id);
}

function selectPreset(id, mapId) {
  const p = classById(id) || DATA.classes.presets[0];
  state.build = JSON.parse(JSON.stringify(p));
  document.querySelectorAll("#preset-bar button").forEach((x) =>
    x.classList.toggle("on", x.dataset.preset === p.id));
  if (mapId) {
    state.scoreMapId = mapId;
    $("#score-map").value = mapId;
  }
  renderBuilder();
  renderReadout();
}

function renderBuilder() {
  const box = $("#builder");
  box.innerHTML = "";
  const b = state.build;

  if (b.description) box.appendChild(el("p", "calldesc classdesc", esc(b.description)));

  const grid = el("div", "build-grid");
  const primaries = fullDepth().filter((w) => w.class !== "Pistol").map((w) => w.name);
  const secondaries = DATA.weapons.weapons
    .filter((w) => (w.class === "Pistol" || w.class === "Launcher" || w.class === "Special") && !w.variant)
    .map((w) => w.name);
  const perksByTier = (t) => DATA.perks.perks.filter((p) => p.tier === t).map((p) => p.name);

  const add = (label, options, value, onChange) => {
    const l = el("label", "", `<span>${esc(label)}</span>`);
    const s = el("select");
    options.forEach((o) => {
      const opt = el("option", "", esc(o));
      opt.value = o;
      if (o === value) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener("change", () => { onChange(s.value); renderBuilder(); renderReadout(); });
    l.appendChild(s);
    grid.appendChild(l);
    return s;
  };

  // Attachments are filtered to what the weapon can actually take, and the
  // second slot only exists if Warlord is in the build — as in the game.
  const w = findWeapon(b.primary);
  const allowed = attachmentsFor(w);
  const warlord = b.perks.includes("Warlord");
  const NONE = "— none —";

  add("Primary", primaries, b.primary, (v) => {
    b.primary = v;
    b.primaryAttachments = b.primaryAttachments.filter((a) =>
      attachmentsFor(findWeapon(v)).includes(a));
  });
  add("Attachment", [NONE, ...allowed], b.primaryAttachments[0] || NONE, (v) => {
    b.primaryAttachments[0] = v === NONE ? null : v;
    b.primaryAttachments = b.primaryAttachments.filter(Boolean);
  });
  if (warlord) {
    add("Attachment 2", [NONE, ...allowed.filter((a) => a !== b.primaryAttachments[0])],
      b.primaryAttachments[1] || NONE, (v) => {
        b.primaryAttachments[1] = v === NONE ? null : v;
        b.primaryAttachments = b.primaryAttachments.filter(Boolean);
      });
  } else if (b.primaryAttachments.length > 1) {
    b.primaryAttachments = b.primaryAttachments.slice(0, 1);
  }
  add("Secondary", secondaries, b.secondary, (v) => (b.secondary = v));
  add("Perk 1", perksByTier(1), b.perks[0], (v) => (b.perks[0] = v));
  add("Perk 2", perksByTier(2), b.perks[1], (v) => (b.perks[1] = v));
  add("Perk 3", perksByTier(3), b.perks[2], (v) => (b.perks[2] = v));
  add("Lethal", DATA.classes.equipment.lethal, b.lethal, (v) => (b.lethal = v));
  add("Tactical", DATA.classes.equipment.tactical, b.tactical, (v) => (b.tactical = v));
  add("Equipment", DATA.classes.equipment.gear, b.gear, (v) => (b.gear = v));

  box.appendChild(grid);
  if (!warlord) {
    box.appendChild(el("p", "hint",
      "One attachment per weapon. Warlord in Tier 2 gives you a second slot."));
  }
}

function attachmentsFor(w) {
  if (!w) return [];
  return DATA.attachments.attachments
    .filter((a) => !a.classes || a.classes.includes(w.class))
    .map((a) => a.name);
}

/* ── What the class is good and bad at ────────────────────── */

/* No score. The rules below each fire off something real in the build, and any
   number they quote is pulled from weapons.json at render time. */
function readBuild(b, map) {
  const w = findWeapon(b.primary);
  const reach = effectiveReach(w, b.primaryAttachments);
  const ctx = { b, w, map, reach };
  const excels = [], struggles = [];

  DATA.classes.traits.rules.forEach((r) => {
    if (!matches(r.when, ctx)) return;
    if (r.excels) excels.push(resolve(r.excels, ctx));
    if (r.struggles) struggles.push(resolve(r.struggles, ctx));
  });
  return { excels: excels.filter(Boolean), struggles: struggles.filter(Boolean), w, reach };
}

function matches(when, ctx) {
  const { b, w, map, reach } = ctx;
  if (when.perks && !when.perks.every((p) => b.perks.includes(p))) return false;
  if (when.noneOfPerks && when.noneOfPerks.some((p) => b.perks.includes(p))) return false;
  if (when.attachment && !b.primaryAttachments.includes(when.attachment)) return false;
  if (when.weaponClass && (!w || w.class !== when.weaponClass)) return false;
  if (when.fireMode && (!w || w.fireMode !== when.fireMode)) return false;
  if (when.reachUnder !== undefined && !(reach !== null && reach < when.reachUnder)) return false;
  if (when.reachOver !== undefined && !(reach !== null && reach > when.reachOver)) return false;
  if (when.mapSizeIn && (!map || !when.mapSizeIn.includes(map.size))) return false;
  return true;
}

function resolve(text, ctx) {
  const { b, w, map, reach } = ctx;
  const base = w && w.profile[0] ? w.profile[0].toM : null;
  const sup = b.primaryAttachments.includes("Suppressor");

  const tokens = {
    WEAPON_REACH: reach === null
      ? "It holds full damage at any range."
      : `Full damage stops at ${reach} m; past that every kill costs an extra bullet.`,
    SUPPRESSOR_RANGE: (base && reach && base !== reach)
      ? `Range. The ${w.stk.torso}-shot kill falls from ${base} m to ${reach} m — a ` +
        `${Math.round((1 - reach / base) * 100)}% cut. Fine if you're flanking, expensive if you're trading.`
      : "Range, on most guns — though this one keeps its reach.",
    RAPID_FIRE: w && w.rapidFire
      ? `${Math.round(w.rapidFire.rpm)} rpm brings the kill down to ${ms(w.rapidFire.ttkClose)}, at the cost of control.`
      : "a higher rate of fire, at the cost of control.",
    ONE_SHOT: w ? oneShotSentence(w) : "",
    MISS_PENALTY: w && w.missPenalty ? ms(w.missPenalty) : "a long re-chamber",
    TRIGGER_RATE: w && w.rateCapped
      ? `Sustained fire. The gun accepts ${Math.round(w.rpm)} rpm but you supply every round — ` +
        `these timings assume ${DATA.weapons.units.tapHz} pulls a second, which is an estimate, ` +
        `not a datamined figure.`
      : "",
    MAP_OVERKILL: (map && reach)
      ? `More reach than ${map.name} asks for — ${reach} m on a ${map.size.toLowerCase()} map. ` +
        `No harm in it, but the range isn't what wins you fights here.`
      : "",
    MAP_UNDERGUNNED: (map && reach)
      ? `Reach, on ground this size. ${reach} m of full damage on ${map.name} means losing fights ` +
        `you never got to start.`
      : "",
  };
  let out = text;
  Object.keys(tokens).forEach((k) => {
    if (out.includes(k)) out = out.split(k).join(tokens[k]);
  });
  return out.trim() ? out : "";
}

function renderReadout() {
  const box = $("#score");
  box.innerHTML = "";
  const map = state.scoreMapId === "general"
    ? null : DATA.maps.maps.find((m) => m.id === state.scoreMapId);
  const { excels, struggles, w, reach } = readBuild(state.build, map);

  const head = el("div", "readout-head");
  head.appendChild(el("div", "rk", "The gun"));
  head.appendChild(el("div", "rv", w
    ? `${esc(w.name)} — ${esc(w.fireModeLabel.toLowerCase())}, ${ttkLabel(w)} to kill, ` +
      `full damage ${reach === null ? "at any range" : `to ${reach} m`}`
    : "Unknown weapon."));
  if (w) {
    const jump = el("button", "back");
    jump.style.margin = "10px 0 0";
    jump.innerHTML = "Open weapon &rarr;";
    jump.addEventListener("click", () => openWeapon(w.name));
    head.appendChild(jump);
  }
  box.appendChild(head);

  if (!map) {
    box.appendChild(el("p", "hint",
      "Scored against general Team Deathmatch — pick a map above and the read sharpens."));
  }

  box.appendChild(panel("Excels at", excels, "good"));
  box.appendChild(panel("Struggles with", struggles, "bad"));

  box.appendChild(el("p", "src", esc(DATA.classes.note)));
}

function panel(title, lines, kind) {
  const p = el("div", `tpanel ${kind}`);
  p.appendChild(el("div", "thead", esc(title)));
  if (!lines.length) {
    p.appendChild(el("p", "tnone", kind === "good"
      ? "Nothing here is doing anything special. It'll work; it won't win you anything on its own."
      : "Nothing obviously working against you."));
    return p;
  }
  const ul = el("ul");
  lines.forEach((l) => ul.appendChild(el("li", "", esc(l))));
  p.appendChild(ul);
  return p;
}
