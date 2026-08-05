/* BO1 Companion — all rendering is driven from the JSON in /data.
   No build step, no dependencies, no stored state beyond the current session. */

const DATA = {};
const MAX_LEVEL = 50;

const state = {
  level: MAX_LEVEL,      // session only — resets every visit, assumed max
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

/* ── boot ─────────────────────────────────────────────────── */

Promise.all(
  ["weapons", "maps", "perks", "classes", "killstreaks", "attachments"]
    .map((n) => fetch(`data/${n}.json`).then((r) => r.json()).then((j) => [n, j]))
).then((pairs) => {
  pairs.forEach(([n, j]) => (DATA[n] = j));
  initTabs();
  renderMapGrid();
  initWeapons();
  renderPerks();
  initClasses();
  renderKillstreaks();
  renderAttachments();
}).catch((err) => {
  document.querySelector("main").innerHTML =
    `<p class="hint">Could not load data: ${esc(err.message)}</p>`;
});

/* ── tabs ─────────────────────────────────────────────────── */

function initTabs() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b === btn));
    document.querySelectorAll("main .tab").forEach((s) =>
      s.classList.toggle("on", s.id === btn.dataset.tab));
    window.scrollTo(0, 0);
  });
}

/* ── PRE-MATCH ────────────────────────────────────────────── */

function renderMapGrid() {
  const grid = $("#map-grid");
  grid.innerHTML = "";
  DATA.maps.maps.forEach((m) => {
    const t = el("button", "map-tile", `<b>${esc(m.name)}</b><i>${esc(m.size)}</i>`);
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

  box.appendChild(el("div", "brief-head",
    `<h2>${esc(m.name)}</h2><span class="size">${esc(m.size)} &middot; TDM</span>`));

  // 1 — identity
  box.appendChild(el("p", "identity", esc(m.identity)));

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
  spawnField.appendChild(el("p", "", `<span style="color:var(--dimmer)">They start at the other end. Spawns flip when your team pushes past the middle — if it goes quiet, check behind you.</span>`));
  box.appendChild(spawnField);

  // 3 — power positions
  box.appendChild(listField("Power positions", m.powerPositions, "name", "why"));

  // 4 — where they'll be
  box.appendChild(listField("Where they'll be", m.enemySpots, "name", "note"));

  // 5 — the trap
  const trap = el("div", "field warn", "<h3>The trap</h3>");
  trap.appendChild(el("p", "", esc(m.trap)));
  box.appendChild(trap);

  // 6 — your route
  const route = el("div", "field", "<h3>Your route</h3>");
  route.appendChild(el("p", "", `<strong>First ten seconds:</strong> ${esc(side.opening)}`));
  route.appendChild(el("p", "", `<strong>The flank:</strong> ${esc(side.flank)}`));
  route.appendChild(el("div", "pinch", `<b>Pinch point</b>${esc(side.pinch)}`));
  box.appendChild(route);

  // 7 — loadout call
  const w = findWeapon(m.loadout.weapon);
  const perk = DATA.perks.perks.find((p) => p.name === m.loadout.perk);
  const load = el("div", "field", "<h3>Loadout call</h3>");
  const cards = el("div", "loadout-call");
  cards.appendChild(el("div", "",
    `<div class="lbl">Weapon</div><div class="val">${esc(m.loadout.weapon)}</div>
     <div class="why">${esc(m.loadout.weaponWhy)}</div>`));
  cards.appendChild(el("div", "",
    `<div class="lbl">Perk</div><div class="val">${esc(m.loadout.perk)}</div>
     <div class="why">${esc(m.loadout.perkWhy)}</div>`));
  load.appendChild(cards);
  if (w || perk) {
    const jump = el("p", "", "");
    jump.style.marginTop = "10px";
    const a = el("button", "back", "Open weapon &rarr;");
    a.style.marginBottom = "0";
    a.addEventListener("click", () => { showTab("weapons"); openWeapon(w.name); });
    if (w) jump.appendChild(a);
    load.appendChild(jump);
  }
  box.appendChild(load);

  // diagram slot — empty until the schematics are drawn
  const dia = el("div", "diagram-slot", m.diagram
    ? m.diagram
    : `Tactical schematic not drawn yet &middot; <a href="${esc(m.minimapUrl)}" target="_blank" rel="noopener">Full minimap &nearr;</a>`);
  box.appendChild(dia);

  // below the fold — leisure reading
  const deep = el("details", "ref");
  deep.appendChild(el("summary", "", "Deeper notes"));
  const body = el("div", "body");
  m.deeper.forEach((d) => body.appendChild(el("p", "", esc(d))));
  deep.appendChild(body);
  box.appendChild(deep);

  box.appendChild(el("p", "src",
    `Layout: ${esc(DATA.maps.source.layout)} Tactics: ${esc(DATA.maps.source.tactics)}`));
}

function listField(title, items, keyName, keyBody) {
  const f = el("div", "field", `<h3>${esc(title)}</h3>`);
  const ul = el("ul");
  items.forEach((it) => ul.appendChild(el("li", "",
    `<b>${esc(it[keyName])}</b><span>${esc(it[keyBody])}</span>`)));
  f.appendChild(ul);
  return f;
}

function showTab(name) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll("main .tab").forEach((s) => s.classList.toggle("on", s.id === name));
  window.scrollTo(0, 0);
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
  const lvl = $("#level-filter");
  for (let i = MAX_LEVEL; i >= 4; i--) {
    const o = el("option", "", i === MAX_LEVEL ? `${i} (max)` : String(i));
    o.value = i;
    lvl.appendChild(o);
  }
  lvl.value = state.level;
  lvl.addEventListener("change", () => { state.level = +lvl.value; renderWeaponList(); });

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

  let ws = fullDepth().filter((w) => (w.unlockLevel ?? 99) <= state.level);
  if (state.weaponClass !== "All") ws = ws.filter((w) => w.class === state.weaponClass);
  ws.sort((a, b) => (a.ttk.close ?? 9) - (b.ttk.close ?? 9));

  $("#weapon-count").textContent =
    `${ws.length} available at level ${state.level}, fastest kill first. ` +
    `TTK is best case at close range — check the reach beside it before you believe it.`;

  ws.forEach((w) => {
    const reach = w.profile[0] && w.profile[0].toM ? `${w.profile[0].toM} m` : "any range";
    const r = el("button", "row",
      `<span class="nm">${esc(w.name)}</span>
       <span class="tag">${esc(w.class)}${w.classified ? " ·CLS" : ""}</span>
       <span class="reach">${reach}</span>
       <span class="ttk">${ms(w.ttk.close)}</span>`);
    r.addEventListener("click", () => openWeapon(w.name));
    list.appendChild(r);
  });
}

function openWeapon(name) {
  const w = findWeapon(name);
  if (!w) return;
  $("#weapon-list").classList.add("hidden");
  const d = $("#weapon-detail");
  d.classList.remove("hidden");
  d.innerHTML = "";

  const back = el("button", "back", "&larr; All weapons");
  back.addEventListener("click", renderWeaponList);
  d.appendChild(back);

  d.appendChild(el("h2", "", esc(w.name)));
  d.appendChild(el("p", "sub",
    `${esc(w.class)} &middot; Unlock level ${w.unlockLevel}${w.classified ? " (classified)" : ""}${w.burst ? ` &middot; ${w.burst}-round burst` : ""}`));

  const stats = el("div", "stats");
  const stat = (k, v) => stats.appendChild(el("div", "stat", `<div class="k">${k}</div><div class="v">${v}</div>`));
  stat("Damage", `${w.damage.max}<small> / ${w.damage.min}</small>`);
  stat("Rate of fire", `${Math.round(w.rpm)}<small> rpm</small>`);
  stat("TTK close", `<span style="color:var(--hot)">${ms(w.ttk.close)}</span>`);
  stat("ADS", `${w.adsTime}<small>s</small>`);
  d.appendChild(stats);

  d.appendChild(el("h3", "tier-head", "Shots to kill by range"));
  const prof = el("div", "profile");
  w.profile.forEach((b) => prof.appendChild(el("div", "profile-row",
    `<span class="shots">${b.shots} shots</span>
     <span class="rng">${b.beyond ? "beyond that" : `out to ${b.toM} m`}</span>
     <span class="t">${ms(b.ttk)}</span>`)));
  d.appendChild(prof);

  if (w.suppressed) {
    const base = w.profile[0], sup = w.suppressed.profile[0];
    if (base && sup && base.toM && sup.toM) {
      const drop = Math.round((1 - sup.toM / base.toM) * 100);
      d.appendChild(el("div", "note bad",
        `<b>Suppressor costs you range.</b> The ${base.shots}-shot kill drops from
         <b>${base.toM} m</b> to <b>${sup.toM} m</b> — a ${drop}% cut. Past that you need an extra bullet.`));
    }
  }

  if (w.rapidFire) {
    d.appendChild(el("div", "note",
      `<b>Rapid Fire</b> takes it to ${Math.round(w.rapidFire.rpm)} rpm, pulling the close-range kill
       from ${ms(w.ttk.close)} down to <b>${ms(w.rapidFire.ttkClose)}</b>.`));
  }

  const dw = DATA.weapons.weapons.find((x) => x.baseName === w.baseName && x.variant === "dual-wield");
  if (dw) d.appendChild(el("div", "note",
    `<b>Dual Wield available.</b> Doubles your ammo and removes aiming down sights entirely.`));

  const mult = w.multipliers;
  if (mult.head) {
    d.appendChild(el("div", "note",
      `<b>Multipliers.</b> Head &times;${mult.head}, upper torso &times;${mult.upperTorso}, lower torso &times;${mult.lowerTorso}.`));
  }

  const maps = DATA.maps.maps.filter((m) => findWeapon(m.loadout.weapon)?.name === w.name);
  if (maps.length) {
    d.appendChild(el("div", "note",
      `<b>Called for on:</b> ${maps.map((m) => esc(m.name)).join(", ")}.`));
  }

  d.appendChild(el("p", "src", `Stats: ${esc(w.source)}. ${esc(DATA.weapons.source.note)}`));
  window.scrollTo(0, 0);
}

function renderAttachments() {
  const box = $("#attachment-list");
  box.className = "body";
  DATA.attachments.attachments.forEach((a) => {
    const dt = el("details", "perk");
    dt.appendChild(el("summary", "", `${esc(a.name)}`));
    const b = el("div", "body");
    b.appendChild(el("div", "kv", `<div class="k">${esc(a.type)}</div><div class="v">${esc(a.effect)}</div>`));
    b.appendChild(el("div", "kv", `<div class="k">Cost</div><div class="v">${esc(a.cost)}</div>`));
    b.appendChild(el("div", "kv", `<div class="k">Verdict</div><div class="v"><strong>${esc(a.verdict)}</strong></div>`));
    dt.appendChild(b);
    box.appendChild(dt);
  });
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
      b.appendChild(el("div", "kv", `<div class="k">In practice</div><div class="v"><strong>${esc(p.note)}</strong></div>`));
      dt.appendChild(b);
      box.appendChild(dt);
    });
  });
}

/* ── KILLSTREAKS ──────────────────────────────────────────── */

function renderKillstreaks() {
  const box = $("#killstreak-list");
  box.className = "body";
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

/* ── CLASSES + META SCORE ─────────────────────────────────── */

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
  sel.addEventListener("change", () => { state.scoreMapId = sel.value; renderScore(); });

  const bar = $("#preset-bar");
  DATA.classes.presets.forEach((p) => {
    const b = el("button", "", esc(p.name));
    b.addEventListener("click", () => {
      state.build = JSON.parse(JSON.stringify(p));
      document.querySelectorAll("#preset-bar button").forEach((x) => x.classList.toggle("on", x === b));
      renderBuilder();
      renderScore();
    });
    bar.appendChild(b);
  });

  state.build = JSON.parse(JSON.stringify(DATA.classes.presets[0]));
  bar.firstChild.classList.add("on");
  renderBuilder();
  renderScore();
}

function renderBuilder() {
  const box = $("#builder");
  box.innerHTML = "";
  const grid = el("div", "build-grid");

  const primaries = fullDepth().filter((w) => w.class !== "Pistol").map((w) => w.name);
  const secondaries = DATA.weapons.weapons
    .filter((w) => (w.class === "Pistol" || w.class === "Launcher") && !w.variant)
    .map((w) => w.name);
  const atts = DATA.attachments.attachments.map((a) => a.name);
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
    s.addEventListener("change", () => { onChange(s.value); renderScore(); });
    l.appendChild(s);
    grid.appendChild(l);
  };

  const b = state.build;
  add("Primary", primaries, b.primary, (v) => (b.primary = v));
  add("Attachment", ["— none —", ...atts], b.primaryAttachments[0] || "— none —",
    (v) => (b.primaryAttachments = v === "— none —" ? [] : [v]));
  add("Secondary", secondaries, b.secondary, (v) => (b.secondary = v));
  add("Perk 1", perksByTier(1), b.perks[0], (v) => (b.perks[0] = v));
  add("Perk 2", perksByTier(2), b.perks[1], (v) => (b.perks[1] = v));
  add("Perk 3", perksByTier(3), b.perks[2], (v) => (b.perks[2] = v));
  add("Lethal", DATA.classes.equipment.lethal, b.lethal, (v) => (b.lethal = v));
  add("Tactical", DATA.classes.equipment.tactical, b.tactical, (v) => (b.tactical = v));
  add("Equipment", DATA.classes.equipment.gear, b.gear, (v) => (b.gear = v));
  add("Killstreaks", DATA.killstreaks.profiles.map((p) => p.name),
    (DATA.killstreaks.profiles.find((p) => p.id === b.killstreakProfile) || {}).name,
    (v) => (b.killstreakProfile = DATA.killstreaks.profiles.find((p) => p.name === v).id));

  box.appendChild(grid);
  if (b.note) box.appendChild(el("div", "note", esc(b.note)));
}

/* The rubric. Every leg is shown with its reasoning — a bare number would be
   fake authority. Weighted toward map fit and perk synergy. */
function scoreBuild(b, map) {
  const W = DATA.classes.scoring.weights;
  const w = findWeapon(b.primary);
  const legs = [];

  // 1 — TTK. Fastest primary in the game is 80ms, slowest useful around 320ms.
  const ttk = w && w.ttk.close ? w.ttk.close : 0.32;
  const ttkPts = clamp(W.ttk * (0.34 - ttk) / (0.34 - 0.09), 0, W.ttk);
  legs.push({
    name: "TTK class", pts: ttkPts, max: W.ttk,
    why: w ? `${w.name} kills in ${ms(w.ttk.close)} at close range (${w.stk.close} shots at ${Math.round(w.rpm)} rpm).`
           : "Unknown weapon.",
  });

  // 2 — Mobility: movement speed, ADS time, and perks that move you.
  let mob = 0;
  if (w) {
    mob += clamp((w.movementSpeed - 0.85) / 0.15, 0, 1) * 7;
    mob += clamp((0.40 - w.adsTime) / 0.25, 0, 1) * 8;
  }
  if (b.perks.includes("Lightweight")) mob = Math.min(W.mobility, mob + 2);
  legs.push({
    name: "Mobility", pts: clamp(mob, 0, W.mobility), max: W.mobility,
    why: w ? `Moves at ${w.movementSpeed}× base with a ${w.adsTime}s aim-in.` : "—",
  });

  // 3 — Perk synergy, from the rules in classes.json.
  let syn = 12;
  const reasons = [];
  DATA.classes.scoring.perkSynergy.pairs.forEach((rule) => {
    if (rule.perks.every((p) => b.perks.includes(p))) {
      syn += rule.points;
      reasons.push(`${rule.perks.join(" + ")}: ${rule.why}`);
    }
  });
  legs.push({
    name: "Perk synergy", pts: clamp(syn, 0, W.perkSynergy), max: W.perkSynergy,
    why: reasons.length ? reasons.join(" ") : "No strong interactions either way — a functional but unremarkable set.",
  });

  // 4 — Map fit: does the gun's reach match the ground, and do the perks suit it?
  let fit = 12;
  const fitWhy = [];
  const reach = w && w.profile[0] && w.profile[0].toM ? w.profile[0].toM : 20;
  const suppressed = b.primaryAttachments.includes("Suppressor");
  const effReach = suppressed && w && w.suppressed && w.suppressed.profile[0]
    ? (w.suppressed.profile[0].toM || reach) : reach;

  const size = map ? map.size : "Medium";
  const want = { Tiny: [8, 25], Small: [12, 32], Medium: [18, 46], Large: [35, 99] }[size];
  if (effReach >= want[0] && effReach <= want[1]) {
    fit += 8;
    fitWhy.push(`${effReach} m of full-damage reach suits a ${size.toLowerCase()} map.`);
  } else if (effReach < want[0]) {
    fit -= 6;
    fitWhy.push(`Only ${effReach} m of full-damage reach on a ${size.toLowerCase()} map — you will lose fights you should win.`);
  } else {
    fit -= 1;
    fitWhy.push(`${effReach} m of reach is more than a ${size.toLowerCase()} map needs.`);
  }
  if (suppressed && w && w.suppressed && w.profile[0] && w.profile[0].toM) {
    fitWhy.push(`The suppressor is what cut it, from ${w.profile[0].toM} m.`);
  }
  if (map) {
    if (b.perks.includes(map.loadout.perk)) { fit += 4; fitWhy.push(`${map.loadout.perk} is the called-for perk here.`); }
    if (["Tiny", "Small"].includes(size) && b.perks.includes("Flak Jacket")) { fit += 3; fitWhy.push("Flak Jacket earns its slot on a map this small."); }
    if (size === "Large" && b.perks.includes("Flak Jacket")) { fit -= 3; fitWhy.push("Flak Jacket is close to wasted on a map this size."); }
    if (["Tiny", "Small"].includes(size) && b.perks.includes("Marathon")) { fit -= 3; fitWhy.push("Marathon on a small map just gets you into trouble faster."); }
  } else {
    fitWhy.push("Scored against general TDM — pick a map above for a sharper read.");
  }
  legs.push({ name: "Map fit", pts: clamp(fit, 0, W.mapFit), max: W.mapFit, why: fitWhy.join(" ") });

  // 5 — Killstreak realism: will you actually collect these?
  const prof = DATA.killstreaks.profiles.find((p) => p.id === b.killstreakProfile);
  const costs = (prof ? prof.streaks : []).map((n) =>
    (DATA.killstreaks.killstreaks.find((k) => k.name === n) || { kills: 6 }).kills);
  const hardline = b.perks.includes("Hardline");
  const eff = costs.map((c) => (hardline ? c - 1 : c));
  const lowest = Math.min(...eff, 99);
  const highest = Math.max(...eff, 0);
  let ks = 0;
  ks += clamp((7 - lowest) * 2.5, 0, 8);            // is anything reachable early?
  ks += clamp((13 - highest) * 0.6, 0, 4);          // is the top end plausible?
  if (hardline) ks += DATA.classes.scoring.killstreakRealism.hardlineBonus;
  const ksWhy = prof
    ? `${prof.name}: ${prof.streaks.join(" / ")}. ` +
      (hardline
        ? `Hardline brings them to ${eff.join(" / ")} kills.`
        : `No Hardline, so that's ${eff.join(" / ")} kills in a single life.`) +
      (highest >= 10 && !hardline
        ? " That's a lot of kills in one life — either add Hardline or drop the ceiling."
        : "")
    : "No killstreak profile set.";
  legs.push({ name: "Killstreak realism", pts: clamp(ks, 0, W.killstreaks), max: W.killstreaks, why: ksWhy });

  const total = Math.round(legs.reduce((s, l) => s + l.pts, 0));
  return { total, legs };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function verdictFor(n) {
  if (n >= 80) return ["Strong", "This holds together. Take it out as it is."];
  if (n >= 65) return ["Solid", "Works. One leg below is dragging it — fix that and it's a proper class."];
  if (n >= 48) return ["Situational", "Fine in the right place, punished in the wrong one. Check map fit."];
  return ["Trap", "Something here is actively costing you. Read the weak leg first."];
}

function renderScore() {
  const box = $("#score");
  box.innerHTML = "";
  const map = state.scoreMapId === "general"
    ? null : DATA.maps.maps.find((m) => m.id === state.scoreMapId);
  const { total, legs } = scoreBuild(state.build, map);
  const [v, w] = verdictFor(total);

  box.appendChild(el("div", "score-head",
    `<div class="score-num">${total}<small>/100</small></div>
     <div class="score-verdict"><div class="v">${esc(v)}</div><div class="w">${esc(w)}</div></div>`));

  const legsBox = el("div", "legs");
  legs.forEach((l) => {
    const weak = l.pts / l.max < 0.5;
    legsBox.appendChild(el("div", `leg${weak ? " weak" : ""}`,
      `<div class="leg-top"><span>${esc(l.name)}</span><b>${Math.round(l.pts)} / ${l.max}</b></div>
       <div class="bar"><i style="width:${Math.round((l.pts / l.max) * 100)}%"></i></div>
       <div class="why">${esc(l.why)}</div>`));
  });
  box.appendChild(legsBox);
}
