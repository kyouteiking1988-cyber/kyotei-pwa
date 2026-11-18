/* 競艇予想 PWA */
const COLORS = {
  1: ["#f3f3f3", "#1a1a1a"],
  2: ["#1a1a1a", "#f5f5f5"],
  3: ["#d3212c", "#ffffff"],
  4: ["#1d4fbf", "#ffffff"],
  5: ["#e6c200", "#1a1a1a"],
  6: ["#1b8a3c", "#ffffff"]
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const main = $("#main");

let TODAY = null;
let REPORT = null;
let HISTORY = null;
let META = null;
let lastFetch = 0;
let tickTimer = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[c]));
}

function wakuChip(n) {
  const c = COLORS[n] || ["#444", "#fff"];
  const border = n === 1 ? "border:1px solid #666;" : "";
  return `<span class="waku" style="background:${c[0]};color:${c[1]};${border}">${n ?? "-"}</span>`;
}

function badgeConf(c) {
  if (c === "堅い" || c === "固い") return `<span class="badge b-hard">固い</span>`;
  if (c === "混戦") return `<span class="badge b-mix">混戦</span>`;
  return c ? `<span class="badge b-end">${esc(c)}</span>` : "";
}
function boatByWaku(r, waku) {
  if (!r || waku == null) return null;
  const hit = (r.ranking || []).find((x) => x.waku === waku);
  if (hit) return hit;
  return (r.boats || []).find((x) => x.waku === waku) || null;
}
function honmeiNameOf(r) {
  const b = boatByWaku(r, r && r.honmei);
  return (r && r.honmei_name) || (b && b.name) || "";
}
function honmeiProbOf(r) {
  const b = boatByWaku(r, r && r.honmei);
  if (!b) return null;
  return b.p != null ? b.p : b.win_prob;
}
function switchHeld(r) {
  return r && r.has_exhibition && r.exh_switch_applied === false && r.morning_pred && r.exh_pred && r.morning_pred.honmei !== r.exh_pred.honmei;
}
function badgeSource(r) {
  if (r && (r.has_exhibition || r.pred_source === "exhibition")) {
    const held = switchHeld(r) ? `<span class="badge b-am">本命は朝のまま</span>` : "";
    return `<span class="badge b-exh">展示反映済み</span>${held}`;
  }
  return `<span class="badge b-am">朝予想</span>`;
}
function entryInfo(r) {
  return (r && (r.entry || (r.exh_pred && r.exh_pred.entry))) || {};
}
function badgeEntry(r) {
  const e = entryInfo(r);
  if (e.changed) {
    const ord = e.exh_order ? `<div class="entry-ord">${esc(e.exh_order)}</div>` : "";
    return `<span class="badge b-shift">進入変化</span>${ord}`;
  }
  if (e.has_exh_entry) return `<span class="badge b-waku">枠なり</span>`;
  return "";
}
function movedNote(e) {
  if (!e || !e.moved || !e.moved.length) return "";
  const parts = e.moved.map((m) => {
    const kind = (m.exh_course < m.waku) ? "前づけ" : "後方進入";
    const nm = m.name ? `${m.waku}号 ${m.name}` : `${m.waku}号艇`;
    return `${nm}が${m.exh_course}コースへ（${kind}）`;
  });
  return `<div class="moved">展示進入 ${esc(e.exh_order || "")}。${esc(parts.join("、"))}</div>`;
}
function scenarioCol(p, label, official) {
  if (!p) return `<div class="scen"><div class="k">${label}</div><div class="sub">なし</div></div>`;
  const ranked = p.ranking || [];
  const maxP = Math.max(...ranked.map((x) => x.p || x.win_prob || 0), 0.01);
  const bars = ranked.map((x) => barRow(x.waku, x.name, x.p || x.win_prob || 0, maxP, x.place2_prob)).join("");
  const tris = p.trifecta_top5 || [];
  const exs = p.exacta_top3 || [];
  const tmax = Math.max(...tris.map((x) => x.p || 0), 0.01);
  const emax = Math.max(...exs.map((x) => x.p || 0), 0.01);
  return `<div class="scen${official ? " on-official" : ""}">
    <div class="k">${label}${official ? " · 公式" : ""}</div>
    <div class="picks">
      <div class="pick">${wakuChip(p.honmei)}<div class="lbl">本命</div></div>
      <div class="pick">${wakuChip(p.taiko)}<div class="lbl">対抗</div></div>
      <div class="pick">${wakuChip(p.ana)}<div class="lbl">穴</div></div>
    </div>
    <div class="sub" style="margin:4px 0 2px">${esc(p.confidence || "")} · 安定 ${p.stability ?? "-"}</div>
    ${bars}
    <div class="k" style="margin-top:8px">2連単</div>
    ${exs.map((x) => comboBar(x.label, x.p, emax, "#f0c14b")).join("") || "<div class='sub'>なし</div>"}
    <div class="k" style="margin-top:8px">3連単</div>
    ${tris.map((x) => comboBar(x.label, x.p, tmax, "#4cc2ff")).join("") || "<div class='sub'>なし</div>"}
  </div>`;
}
function entryDuo(r) {
  const e = entryInfo(r);
  if (!e.changed) return "";
  const w = r.waku_nari_pred || (r.exh_pred || {}).waku_nari_pred || (r.exh_pred || {}).waku_nari;
  const x = r.exh_entry_pred || (r.exh_pred || {}).exh_entry_pred || (r.exh_pred || {}).exh_entry;
  return `<h2 class="sec">進入の2想定</h2>${movedNote(e)}
    <div class="duo">${scenarioCol(w, "枠なり想定", false)}${scenarioCol(x, "展示進入想定", true)}</div>
    <div class="sub">公式の本命・ランキングは展示進入想定です。</div>`;
}
function pct(p, digits = 1) {
  if (p == null || Number.isNaN(Number(p))) return "—";
  return (Number(p) * 100).toFixed(digits) + "%";
}
const GRADE_CLASS = {
  SG: "g-sg", PG1: "g-sg", G1: "g-g1", G2: "g-g2", G3: "g-g3",
  "ヴィーナス": "g-venus", "ルーキー": "g-rookie", "一般": "g-ippan"
};
function gradeBadge(g) {
  if (!g) return "";
  const cls = GRADE_CLASS[g] || "g-other";
  return `<span class="gbadge ${cls}">${esc(g)}</span>`;
}
function boatP2(b, r) {
  if (b && b.place2_prob != null) return b.place2_prob;
  if (r && r.place2_probs && b && b.waku != null) return r.place2_probs[String(b.waku)];
  return null;
}
function place2Of(r) {
  if (!r) return null;
  if (r.honmei2 != null) return { waku: r.honmei2, name: r.honmei2_name, p: r.honmei2_prob };
  let best = null;
  (r.ranking || r.boats || []).forEach((x) => {
    const pv = x.place2_prob;
    if (pv == null) return;
    if (!best || pv > best.p) best = { waku: x.waku, name: x.name, p: pv };
  });
  return best;
}
function p2Line(r) {
  const s = place2Of(r);
  if (!s) return "";
  return `<div class="p2line">2着本命 ${wakuChip(s.waku)} ${esc(s.name || "")} ${s.p != null ? pct(s.p) : ""}</div>`;
}
function venueRaceList(v) {
  const id = String(v?.jcd ?? "").padStart(2, "0");
  if (v && v.races && v.races.length && v.races[0].deadline_dt) return v.races;
  return (TODAY?.races || []).filter((r) => String(r.jcd).padStart(2, "0") === id);
}
function venueSale(v, now = Date.now()) {
  const list = venueRaceList(v);
  const upcoming = list
    .map((r) => ({ r, ts: r.deadline_dt ? Date.parse(r.deadline_dt) : NaN }))
    .filter((x) => Number.isFinite(x.ts) && x.ts > now)
    .sort((a, b) => a.ts - b.ts);
  if (!upcoming.length) {
    return { done: true, label: list.length ? "発売終了" : "― ―", deadline_dt: "" };
  }
  const n = upcoming[0].r;
  return { done: false, label: `${n.rno}R ${n.close || ""}`.trim(), deadline_dt: n.deadline_dt || "" };
}
function retPct(roi) {
  if (roi == null || Number.isNaN(Number(roi))) return "—";
  return (100 + Number(roi) * 100).toFixed(1) + "%";
}
function yen(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("ja-JP") + "円";
}
function mark(v) {
  if (v === null || v === undefined || v === "") return "—";
  return Number(v) ? '<span class="ok">○</span>' : '<span class="ng">×</span>';
}
function dateLabel(yyyymmdd) {
  if (!yyyymmdd || String(yyyymmdd).length !== 8) return yyyymmdd || "";
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}年${Number(s.slice(4, 6))}月${Number(s.slice(6, 8))}日`;
}
function shortDate(yyyymmdd) {
  if (!yyyymmdd || String(yyyymmdd).length !== 8) return yyyymmdd || "";
  const s = String(yyyymmdd);
  return `${Number(s.slice(4, 6))}/${Number(s.slice(6, 8))}`;
}

function findVenue(jcd) {
  return (TODAY?.venues || []).find((v) => String(v.jcd) === String(jcd).padStart(2, "0"));
}
function findRace(jcd, rno) {
  const id = String(jcd).padStart(2, "0");
  return (TODAY?.races || []).find((r) => String(r.jcd) === id && String(r.rno) === String(rno));
}
function lookupFocus(ref) {
  return findRace(ref.jcd, ref.rno);
}

function deadlineInfo(r) {
  const close = r?.close || "-";
  const ts = r?.deadline_dt ? Date.parse(r.deadline_dt) : NaN;
  if (!Number.isFinite(ts)) {
    return { close, text: "", state: "unknown", remainMs: null };
  }
  const remain = ts - Date.now();
  if (remain <= 0) return { close, text: "締切済", state: "done", remainMs: remain };
  const m = Math.floor(remain / 60000);
  if (m < 1) return { close, text: "まもなく締切", state: "now", remainMs: remain };
  if (m < 10) return { close, text: `あと${m}分`, state: "now", remainMs: remain };
  if (m < 30) return { close, text: `あと${m}分`, state: "soon", remainMs: remain };
  if (m < 60) return { close, text: `あと${m}分`, state: "live", remainMs: remain };
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return { close, text: `あと${h}時間${rm}分`, state: "live", remainMs: remain };
}

function deadlineHTML(r) {
  const d = deadlineInfo(r);
  return `<div class="deadline" data-deadline="${esc(r?.deadline_dt || "")}">
    <span class="when">締切 ${esc(d.close)}</span>
    ${d.text ? `<span class="clock ${d.state}">${esc(d.text)}</span>` : ""}
  </div>`;
}

function refreshCountdowns() {
  $$("[data-deadline]").forEach((el) => {
    const iso = el.getAttribute("data-deadline");
    const clock = el.querySelector(".clock");
    const d = deadlineInfo({ deadline_dt: iso, close: el.querySelector(".when")?.textContent?.replace(/^締切\s*/, "") });
    if (clock) {
      clock.textContent = d.text;
      clock.className = "clock " + d.state;
    }
  });
  $$("[data-venue-jcd]").forEach((el) => {
    const v = findVenue(el.getAttribute("data-venue-jcd"));
    if (!v) return;
    const sale = venueSale(v);
    el.textContent = sale.label;
    el.classList.toggle("done", sale.done);
    const tile = el.closest(".vtile");
    if (tile) tile.classList.toggle("ended", sale.done);
  });
}

function honmeiProb(r) {
  return honmeiProbOf(r);
}

function raceCard(r, key, color) {
  const kind = r.confidence === "混戦" || key === "upset" ? "mixed" : "solid";
  const hm = honmeiNameOf(r);
  const p = honmeiProb(r);
  const val = key ? (r[key] || 0) : null;
  return `<article class="card tap ${kind}" data-go="#/v/${r.jcd}/r/${r.rno}">
    <div class="row">
      <div>
        <div class="title">${esc(r.venue || "")} ${r.rno}R</div>
        <div class="sub">${esc((r.subtitle || r.title || "").replace(/\s+/g, " "))}</div>
      </div>
      <div class="badges">${badgeConf(r.confidence)}${badgeSource(r)}${badgeEntry(r)}</div>
    </div>
    ${deadlineHTML(r)}
    <div class="honmei">
      ${wakuChip(r.honmei)}
      <div>
        <div class="lbl">本命</div>
        <div class="who">${esc(hm)}</div>
      </div>
      <div class="pct">${p != null ? pct(p) : ""}</div>
    </div>
    ${p2Line(r)}
    ${val != null ? `<div class="scorebar"><span style="width:${Math.min(100, val)}%;background:${color}"></span></div>
    <div class="sub">${key === "stability" ? "安定度" : "荒れ度"} ${val}</div>` : ""}
  </article>`;
}

function exhibitionStatus() {
  if (!TODAY) return { n: 0, exh: 0, focus: 0 };
  const focus = TODAY.focus || {};
  const keys = [...(focus.solid || []), ...(focus.mixed || [])];
  let exh = 0;
  keys.forEach((ref) => {
    const r = lookupFocus(ref);
    if (r && (r.has_exhibition || r.pred_source === "exhibition")) exh++;
  });
  return { n: keys.length, exh, focus: keys.length };
}

function formatUpdated(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const lag = Math.max(0, Math.floor((Date.now() - t) / 60000));
  const lagText = lag < 1 ? "たった今" : lag < 60 ? `${lag}分前` : `${Math.floor(lag / 60)}時間前`;
  return `${hh}:${mm} 更新（${lagText}）`;
}

function renderStatus(tab) {
  const row = $("#statusRow");
  if (!row) return;
  if (tab !== "yoso" || !TODAY) {
    row.innerHTML = "";
    return;
  }
  const st = exhibitionStatus();
  const upd = formatUpdated(TODAY.updated_at || TODAY.predicted_at || META?.generated_at);
  const chips = [];
  if (upd) chips.push(`<span class="chip">${esc(upd)}</span>`);
  if (st.n) {
    const done = st.exh >= st.n;
    chips.push(`<span class="chip ${done ? "ok" : "warn"}">展示反映 ${st.exh}/${st.n}</span>`);
  }
  row.innerHTML = chips.join("");
}

function viewMeet() {
  const vs = TODAY?.venues || [];
  if (!vs.length) return `<div class="empty">開催データがありません</div>`;
  const tiles = vs.map((v) => {
    const holding = v.holding !== false && ((v.races && v.races.length) || v.grade || v.period);
    if (!holding) {
      return `<div class="vtile off"><div class="vn">${esc(v.name)}</div><div class="vdash">― ―</div></div>`;
    }
    const sale = venueSale(v);
    const night = v.nighter || (v.session || "").includes("ナイター");
    const day = v.day_label || "";
    const jcd = String(v.jcd).padStart(2, "0");
    return `<button type="button" class="vtile on${night ? " night" : ""}${sale.done ? " ended" : ""}" data-go="#/v/${jcd}">
      <div class="vtop"><div class="vn">${esc(v.name)}</div>${night ? `<span class="moon" title="ナイター">夜</span>` : ""}</div>
      <div class="vmeta">${gradeBadge(v.grade)}${day ? `<span class="day">${esc(day)}</span>` : ""}</div>
      <div class="vnext${sale.done ? " done" : ""}" data-venue-jcd="${esc(jcd)}">${esc(sale.label)}</div>
    </button>`;
  }).join("");
  return `<div class="meet-grid">${tiles}</div>`;
}
function viewClose() {
  const now = Date.now();
  const races = (TODAY?.races || []).slice().sort((a, b) => {
    const ta = a.deadline_dt ? Date.parse(a.deadline_dt) : Infinity;
    const tb = b.deadline_dt ? Date.parse(b.deadline_dt) : Infinity;
    const ao = Number.isFinite(ta) && ta <= now;
    const bo = Number.isFinite(tb) && tb <= now;
    if (ao !== bo) return ao - bo;
    return ta - tb;
  });
  if (!races.length) return `<div class="empty">レースがありません</div>`;
  return `<div class="metric">締切が近い順です。発売状況はいまの時刻で判定します。</div>${races.map((r) => raceCard(r)).join("")}`;
}
function viewVenue(jcd) {
  const v = findVenue(jcd);
  if (!v) return `<button class="back" data-go="#/">← 開催一覧</button><div class="empty">場が見つかりません</div>`;
  const id = String(jcd).padStart(2, "0");
  const races = (TODAY.races || []).filter((r) => String(r.jcd).padStart(2, "0") === id)
    .sort((a, b) => (a.rno || 0) - (b.rno || 0));
  const sale = venueSale({ ...v, races });
  const night = v.nighter || (v.session || "").includes("ナイター");
  return `<button class="back" data-go="#/">← 開催一覧</button>
    <div class="venue-head">
      <div class="title">${esc(v.name)} ${night ? '<span class="moon">夜</span>' : ""}</div>
      <div class="sub">${gradeBadge(v.grade)} ${esc(v.day_label || "")} · ${esc(v.session || "")} · ${esc(v.title || "")}</div>
      <div class="sub">${sale.done ? "発売終了" : ("次 " + sale.label)}</div>
    </div>
    ${races.map((r) => raceCard(r)).join("") || "<div class='empty'>レースがありません</div>"}`;
}
function viewYoso(seg) {
  if (!TODAY) return `<div class="empty">予想データがまだありません</div>`;
  if (seg === "meet" || seg === "all" || !seg) return viewMeet();
  if (seg === "close") return viewClose();
  const focus = TODAY.focus || {};
  let hard = (focus.solid || []).map(lookupFocus).filter(Boolean);
  let wild = (focus.mixed || []).map(lookupFocus).filter(Boolean);
  if (!hard.length && !wild.length) {
    const all = (TODAY.races || []).filter((r) => r.stability != null);
    hard = [...all].sort((a, b) => b.stability - a.stability).slice(0, 20);
    wild = [...all].sort((a, b) => b.upset - a.upset).slice(0, 20);
  }
  if (seg === "mixed") {
    return `<div class="metric">朝の時点で選んだ混戦20レースです。展示タイムが入ると「展示反映済み」に変わり、本命が変わることもあります。</div>
      ${wild.map((r) => raceCard(r, "upset", "#9b7dff")).join("") || "<div class='empty'>まだありません</div>"}`;
  }
  return `<div class="metric">朝の時点で選んだ固い20レースです。展示タイムが入ると「展示反映済み」に変わります。</div>
    ${hard.map((r) => raceCard(r, "stability", "#f0c14b")).join("") || "<div class='empty'>まだありません</div>"}`;
}


function barRow(n, name, p, maxP, p2) {
  const c = COLORS[n] || ["#888", "#fff"];
  const w = Math.max(4, (p / (maxP || 1)) * 100);
  const edge = n === 1 ? "box-shadow:inset 0 0 0 1px #666;" : "";
  const p2s = (p2 == null || p2 === "") ? "" : `<div class="p2">2着 ${pct(p2)}</div>`;
  return `<div class="bar-row">
    <div class="meta">${wakuChip(n)} ${esc(name || "")}</div>
    <div class="track"><span style="width:${w}%;background:${c[0]};${edge}"></span></div>
    <div class="pcts"><div class="pct">1着 ${pct(p)}</div>${p2s}</div>
  </div>`;
}
function comboBar(label, p, maxP, color) {
  const w = Math.max(4, (p / (maxP || 1)) * 100);
  return `<div class="combo">
    <div class="lab">${esc(label)}</div>
    <div class="track"><span style="width:${w}%;background:${color}"></span></div>
    <div class="pct">${pct(p)}</div>
  </div>`;
}
function gaugeSVG(stability, conf) {
  const s = Math.max(0, Math.min(100, stability || 0));
  const color = conf === "混戦" ? "#d7b3ff" : "#f0c14b";
  return `<svg viewBox="0 0 180 100" width="150" height="84" aria-label="信頼度ゲージ">
    <defs>
      <linearGradient id="gg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#9b7dff"/>
        <stop offset="100%" stop-color="#f0c14b"/>
      </linearGradient>
    </defs>
    <path d="M28,78 A62,62 0 0 1 152,78" fill="none" stroke="#2a3448" stroke-width="12" stroke-linecap="round"/>
    <path d="M28,78 A62,62 0 0 1 152,78" fill="none" stroke="url(#gg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="194" stroke-dashoffset="${194 * (1 - s / 100)}"/>
    <text x="28" y="96" font-size="11" fill="#8b97ad" text-anchor="middle">混戦</text>
    <text x="152" y="96" font-size="11" fill="#8b97ad" text-anchor="middle">固い</text>
  </svg>`;
}
function techLine(t) {
  if (!t || !t.total_wins) return `<span class="tech">決まり手データなし</span>`;
  const tot = t.total_wins || 1;
  const parts = ["逃げ", "差し", "まくり", "まくり差し", "抜き", "恵まれ"]
    .map((k) => [k, t[k] || 0]).filter((x) => x[1] > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, n]) => `${k}${(n / tot * 100).toFixed(0)}%`);
  return `<span class="tech">${esc(parts.join(" · "))}${t.estimated ? "（推定）" : ""}</span>`;
}
function predLine(p, label) {
  if (!p) return "";
  const hm = honmeiNameOf(p);
  const ex = (p.exacta_top3 || []).map((x) => x.label).join(" / ") || "-";
  const tri = (p.trifecta_top5 || []).map((x) => x.label).join(" / ") || "-";
  return `<div class="card" style="padding:10px 12px">
    <div class="kicker">${label}</div>
    <div class="sub">本命 ${wakuChip(p.honmei)} ${esc(hm)}　対抗 ${wakuChip(p.taiko)}　穴 ${wakuChip(p.ana)}</div>${p2Line(p)}
    <div class="sub">2連単 ${esc(ex)}</div>
    <div class="sub">3連単 ${esc(tri)}</div>
  </div>`;
}
function cmpBlock(r) {
  const m = r.morning_pred;
  const e = r.exh_pred || (r.has_exhibition ? r : null);
  if (!m || !e || !(r.has_exhibition || r.pred_source === "exhibition")) return "";
  let changed;
  if (m.honmei !== e.honmei) {
    const gap = r.exh_switch_gap_pp != null ? `（差 ${r.exh_switch_gap_pp}pt / 閾値 ${r.exh_switch_threshold_pp}pt）` : "";
    if (r.exh_switch_applied) {
      changed = `<div class="note">※ 展示後の勝率差が閾値以上のため、公式の本命を ${m.honmei}号艇 → ${e.honmei}号艇 に入れ替えました${gap}</div>`;
    } else if (r.exh_switch_applied === false) {
      changed = `<div class="sub">※ 展示の1着確率では本命が ${e.honmei}号艇ですが、朝の本命 ${m.honmei}号艇との差が閾値に足りないため、公式の本命・買い目は朝予想のままです${gap}</div>`;
    } else {
      changed = `<div class="note">※ 展示反映で本命が ${m.honmei}号艇 → ${e.honmei}号艇 に変わりました</div>`;
    }
  } else {
    changed = `<div class="sub">本命は朝予想から変更なし</div>`;
  }
  return `<h2 class="sec">朝予想と展示反映</h2>${predLine(m, "朝予想")}${predLine(e, "展示反映")}${changed}`;
}

function viewRace(jcd, rno) {
  const v = findVenue(jcd);
  const r = findRace(jcd, rno);
  if (!r) return `<button class="back" data-go="#/">← 戻る</button><div class="empty">レースが見つかりません</div>`;
  const boats = r.boats || [];
  const maxP = Math.max(...boats.map((b) => b.win_prob || 0), 0.01);
  const bars = boats.filter((b) => !b.absent).map((b) => barRow(b.waku, b.name, b.win_prob || 0, maxP, boatP2(b, r))).join("");
  const tris = r.trifecta_top5 || [];
  const exs = r.exacta_top3 || [];
  const tmax = Math.max(...tris.map((x) => x.p || 0), 0.01);
  const emax = Math.max(...exs.map((x) => x.p || 0), 0.01);
  const rows = boats.map((b) => {
    const cr = b.course_record || {};
    const w1 = cr.win1 != null ? (cr.win1 > 1.5 ? cr.win1 : cr.win1 * 100).toFixed(1) + "%" : "-";
    const t2 = cr.top2 != null ? (cr.top2 > 1.5 ? cr.top2 : cr.top2 * 100).toFixed(1) + "%" : "-";
    const exh = b.exhibition != null ? Number(b.exhibition).toFixed(2) : "-";
    return `<tr>
      <td>${wakuChip(b.waku)}</td>
      <td><strong>${esc(b.name)}</strong><div class="tech">${esc(b.grade || "")} · ${esc(b.toban || "")}${b.absent ? " · 欠場" : ""}</div>${techLine(b.tech)}</td>
      <td class="pct" style="width:auto">1着 ${((b.win_prob || 0) * 100).toFixed(1)}%<div class="tech">2着 ${boatP2(b, r) == null ? "-" : ((boatP2(b, r) * 100).toFixed(1) + "%")}</div></td>
      <td class="tech">全${b.nat_win ?? "-"} / 当地${b.loc_win ?? "-"}<br>M${b.motor_top2 ?? "-"}% B${b.boat_top2 ?? "-"}%<br>ST ${b.avg_st ?? "-"}　展 ${exh}${b.exh_course!=null?(`　進入${b.exh_course}C${b.exh_course!==b.waku?"（変化）":""}`):""}<br>コース1着 ${w1} 2連 ${t2}</td>
    </tr>`;
  }).join("");
  const notes = (r.tech_notes || []).map((n) => `<div class="note">※ ${esc(n)}</div>`).join("");
  const backHash = document.referrer && false ? "#/" : (sessionStorage.getItem("kyotei-back") || "#/");
  return `<button class="back" data-go="${esc(backHash)}">← ${esc(v ? v.name : "戻る")}</button>
    <div class="row">
      <div>
        <div class="title">${esc(v ? v.name : r.venue || "")} ${r.rno}R</div>
        <div class="sub">${esc((r.subtitle || "").replace(/\s+/g, " "))}</div>
      </div>
      <div class="badges">${badgeConf(r.confidence)}${badgeSource(r)}${badgeEntry(r)}</div>
    </div>
    ${deadlineHTML(r)}
    ${entryInfo(r).changed ? entryDuo(r) : `<div class="gauge-wrap">
      ${gaugeSVG(r.stability, r.confidence)}
      <div class="txt"><div class="big">${esc(r.confidence === "堅い" ? "固い" : (r.confidence || ""))}</div>
        <div class="sub">安定度 ${r.stability ?? "—"} / 荒れ度 ${r.upset ?? "—"}</div></div>
    </div>
    <div class="picks">
      <div class="pick">${wakuChip(r.honmei)}<div class="lbl">本命</div></div>
      <div class="pick">${wakuChip(r.taiko)}<div class="lbl">対抗</div></div>
      <div class="pick">${wakuChip(r.ana)}<div class="lbl">穴</div></div>
    </div>${p2Line(r)}`}
    ${notes}
    ${cmpBlock(r)}
    ${entryInfo(r).changed ? "" : `<h2 class="sec">1着 / 2着確率</h2>${bars}`}
    <h2 class="sec">出走表</h2>
    <div class="card" style="padding:6px 8px;overflow-x:auto">
      <table class="ent">
        <thead><tr><th>枠</th><th>選手</th><th>予測</th><th>成績</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${entryInfo(r).changed ? "" : `<h2 class="sec">3連単 上位5点</h2>
    ${tris.map((x) => comboBar(x.label, x.p, tmax, "#4cc2ff")).join("") || "<div class='sub'>なし</div>"}
    <h2 class="sec">2連単 上位3点</h2>
    ${exs.map((x) => comboBar(x.label, x.p, emax, "#f0c14b")).join("") || "<div class='sub'>なし</div>"}`}
    <div class="disc">${esc(TODAY.disclaimer || "")}</div>`;
}

function statCard(s, extra = "") {
  if (!s) return "";
  return `<div class="stat ${extra}">
    <div class="k">${esc(s.label || "")}</div>
    <div class="n">n=${s.n ?? 0}</div>
    <div class="v">${pct(s.honmei)}</div>
    <div class="s">本命的中<br>2着本命 ${pct(s.place2)}<br>2連単TOP3 ${pct(s.exacta)}<br>3連単TOP5 ${pct(s.trifecta)}<br>回収率 ${retPct(s.roi)}</div>
  </div>`;
}

function focusCard(r) {
  const kind = r.focus === "solid" ? "solid" : "mixed";
  const kindLabel = kind === "solid" ? "固い" : "混戦";
  const hasExh = r.exh_honmei != null && r.exh_honmei !== "";
  const src = (r.pred_source === "exhibition" || hasExh) ? "展示反映済み" : "朝予想";
  const srcCls = src === "展示反映済み" ? "b-exh" : "b-am";
  const result = r.result_123 || "未確定";
  const kim = r.kimarite || "";
  let payout = "";
  if (r.result_123) {
    payout = `2連単 ${yen(r.exacta_payout)}（${esc(r.official_exacta || "-")}）　3連単 ${yen(r.trifecta_payout)}（${esc(r.official_trifecta || "-")}）`;
  }
  const chg = Number(r.pick_changed) === 1 ? `<div class="chg">展示反映で本命が変わりました</div>` : "";
  const entryChanged = Number(r.entry_changed) === 1;
  const col = (title, honmei, name, conf, exacta, trifecta, h, e, t, empty, extra, h2, h2name, h2hit) => {
    if ((honmei == null || honmei === "") && !exacta) {
      return `<div class="fcol"><div class="k">${title}</div><div class="sub">${empty || "なし"}</div></div>`;
    }
    const p2 = (h2 == null || h2 === "") ? "" : `<div>2着本命 <strong>${esc(h2)}</strong> ${esc(h2name || "")} <span class="mark">${mark(h2hit)}</span></div>`;
    return `<div class="fcol"><div class="k">${title}</div>
      ${extra || ""}
      <div>本命 <strong>${esc(honmei)}</strong> ${esc(name || "")} <span class="mark">${mark(h)}</span></div>
      ${p2}
      <div class="dim">${esc(conf || "")}</div>
      <div>2連 ${esc(exacta || "-")} <span class="mark">${mark(e)}</span></div>
      <div>3連 ${esc(trifecta || "-")} <span class="mark">${mark(t)}</span></div>
    </div>`;
  };
  const morning = col("朝予想", r.morning_honmei, r.morning_honmei_name, r.morning_confidence, r.morning_exacta, r.morning_trifecta, r.morning_honmei_hit, r.morning_exacta_hit, r.morning_trifecta_hit, undefined, "", r.morning_honmei2, r.morning_honmei2_name, r.morning_honmei2_hit);
  if (entryChanged) {
    const waku = col("枠なり想定", r.waku_nari_honmei, r.waku_nari_honmei_name, r.waku_nari_confidence, r.waku_nari_exacta, r.waku_nari_trifecta, r.waku_nari_honmei_hit, r.waku_nari_exacta_hit, r.waku_nari_trifecta_hit, undefined, "", r.waku_nari_honmei2, r.waku_nari_honmei2_name, r.waku_nari_honmei2_hit);
    const extra = r.exh_entry_order ? `<div class="dim">進入 ${esc(r.exh_entry_order)}</div>` : "";
    const exhE = col("展示進入想定", r.exh_entry_honmei, r.exh_entry_honmei_name, r.exh_entry_confidence, r.exh_entry_exacta, r.exh_entry_trifecta, r.exh_entry_honmei_hit, r.exh_entry_exacta_hit, r.exh_entry_trifecta_hit, "なし", extra, r.exh_entry_honmei2, r.exh_entry_honmei2_name, r.exh_entry_honmei2_hit);
    grid = `<div class="fgrid fgrid-am">${morning}</div><div class="fgrid">${waku}${exhE}</div>`;
  } else {
    grid = `<div class="fgrid">
      ${morning}
      ${col("展示反映", r.exh_honmei, r.exh_honmei_name, r.exh_confidence, r.exh_exacta, r.exh_trifecta, r.exh_honmei_hit, r.exh_exacta_hit, r.exh_trifecta_hit, "展示なし（朝予想のまま）", "", r.exh_honmei2, r.exh_honmei2_name, r.exh_honmei2_hit)}
    </div>`;
  }
  const entryLines = [];
  if (r.exh_entry_order) entryLines.push(`展示進入 ${esc(r.exh_entry_order)}`);
  if (r.actual_entry_order) {
    let match = "";
    if (Number(r.actual_matches_exh) === 1) match = "（展示進入どおり）";
    else if (Number(r.actual_matches_waku) === 1) match = "（枠なりどおり）";
    else if (entryChanged) match = "（どちらとも違う）";
    entryLines.push(`実際の進入 ${esc(r.actual_entry_order)}${match}`);
  }
  const entryHtml = entryLines.length ? `<div class="entry-line">${entryLines.join(" · ")}</div>` : "";
  return `<article class="fcard ${kind}${entryChanged ? " shifted" : ""}">
    <div class="row">
      <div>
        <div class="title">${esc(r.venue)} ${r.rno}R</div>
        <div class="sub">${kindLabel} ${r.rank || ""}位 · ${src}</div>
      </div>
      <div class="badges">${badges}</div>
    </div>
    <div class="fresult">結果 <strong>${esc(result)}</strong> ${esc(kim)}<br>${payout}${entryHtml}</div>
    ${grid}${chg}
  </article>`;
}

function sparkline(daily, key = "honmei") {
  const pts = (daily || []).filter((d) => d.n);
  if (!pts.length) return `<div class="sub">まだ日次データがありません</div>`;
  const w = 360, h = 120, pad = 28;
  const ys = pts.map((d) => d[key] ?? 0);
  const vmax = Math.max(1, ...ys);
  const xy = (i, v) => {
    const x = pad + (pts.length === 1 ? 0 : i * (w - 2 * pad) / (pts.length - 1));
    const y = h - pad - (v / vmax) * (h - 2 * pad);
    return [x, y];
  };
  const coords = ys.map((v, i) => xy(i, v));
  const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const dots = coords.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#4cc2ff"/>`).join("");
  const dates = pts.map((p) => p.date);
  const labels = dates.length
    ? `<text x="${pad}" y="${h - 8}" font-size="11" fill="#8b97ad">${shortDate(dates[0])}</text>
       <text x="${w - pad}" y="${h - 8}" font-size="11" fill="#8b97ad" text-anchor="end">${shortDate(dates.at(-1))}</text>`
    : "";
  const grid = [0, 0.5, 1].map((g) => {
    const y = xy(0, g)[1];
    return `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${w - pad}" y2="${y.toFixed(1)}" stroke="#2a3448" stroke-width="1"/>
      <text x="4" y="${(y + 4).toFixed(1)}" font-size="11" fill="#5d6a82">${g * 100}%</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${grid}<path d="${d}" fill="none" stroke="#4cc2ff" stroke-width="2.4"/>${dots}${labels}</svg>`;
}

function viewReport() {
  if (!REPORT) return `<div class="empty">答え合わせは、夜の集計のあとここに入ります。</div>`;
  const aggs = REPORT.aggs || REPORT;
  const day = aggs.today || REPORT.today;
  const summary = aggs.summary || [];
  const d7 = summary.find((s) => /7/.test(s.label || "")) || summary[1];
  const d30 = summary.find((s) => /30/.test(s.label || "")) || summary[2];
  const todayS = summary.find((s) => s.label === "当日") || summary[0];
  const venues = aggs.venues || [];
  const focusRows = REPORT.focus_rows || [];
  const todayFocus = day ? focusRows.filter((r) => r.date === day) : focusRows;
  const mv = aggs.morning_vs_exh || {};
  const focusStats = (aggs.focus_summary || []).map((s) => statCard(s)).join("");
  let mvNote = "展示反映済みの注目レースがまだないため、朝と展示の比較はありません。";
  let mvCards = "";
  if (mv.n) {
    mvCards = [statCard(mv.morning), statCard(mv.exhibition)].join("");
    mvNote = `比較対象 ${mv.n} レース。本命変更 ${mv.pick_changed || 0} レース（展示で本命的中が改善 ${mv.honmei_improved || 0} / 悪化 ${mv.honmei_worsened || 0}）。`;
  }
  const ev = aggs.entry_vs || {};
  let evBlock = "";
  if (ev.n_changed || ev.n) {
    let evNote = `スタート展示で進入が変わった ${ev.n_changed || ev.n || 0} レースを比較。公式成績は展示進入想定を使います。`;
    if (ev.n) evNote += ` 的中比較 ${ev.n} レース。本命が2想定で違うのは ${ev.pick_changed || 0} レース（展示進入の方が改善 ${ev.honmei_improved || 0} / 悪化 ${ev.honmei_worsened || 0}）。`;
    if (ev.actual_n) evNote += ` 実際の進入は、展示進入どおり ${ev.actual_matches_exh || 0} / 枠なりどおり ${ev.actual_matches_waku || 0}（${ev.actual_n} レース中）。`;
    evBlock = `<h2 class="sec">枠なり想定 vs 展示進入想定</h2>
    <div class="sub">${esc(evNote)}</div>
    <div class="grid">${statCard(ev.waku_nari)}${statCard(ev.exh_entry)}</div>`;
  }
  const venueRows = venues.map((v) => {
    const markN = v.enough ? "" : `<span class="dim">（参考）</span>`;
    return `<tr><td>${esc(v.name)}</td><td>${v.n}</td><td>${pct(v.honmei)}</td><td>${pct(v.exacta)}</td><td>${pct(v.trifecta)}</td><td>${retPct(v.roi)} ${markN}</td></tr>`;
  }).join("") || `<tr><td colspan="6">まだありません</td></tr>`;
  const todayList = REPORT.today_list || [];
  const todayRows = todayList.map((r) => {
    if (r.status === "evaluated") {
      const cls = r.honmei_hit ? "hit" : "miss";
      return `<tr><td>${esc(r.venue)} ${r.rno}R</td><td>${r.honmei ?? "-"}</td><td>${esc(r.result_123 || "")}</td>
        <td class="${cls}">${mark(r.honmei_hit)}</td><td>${mark(r.exacta_hit)}</td><td>${mark(r.trifecta_hit)}</td></tr>`;
    }
    return `<tr><td>${esc(r.venue)} ${r.rno}R</td><td>${r.honmei ?? "-"}</td><td>${esc(r.result_123 || (r.status === "late" ? "締切後予測" : "未確定"))}</td>
      <td>—</td><td>—</td><td>—</td></tr>`;
  }).join("") || `<tr><td colspan="6">なし</td></tr>`;

  return `
    <div class="sub" style="margin-bottom:10px">${esc(dateLabel(day))} 時点 · 締切前に予測したレースのみ集計</div>
    <h2 class="sec">7日 / 30日</h2>
    <div class="grid">${statCard(d7)}${statCard(d30)}</div>
    ${todayS && todayS.n ? `<h2 class="sec">当日（全レース）</h2><div class="grid">${statCard(todayS, "wide")}</div>` : ""}
    <h2 class="sec">注目40レース</h2>
    <div class="sub">朝に選んだ固い20・混戦20。評価は展示反映があれば展示後予想、なければ朝予想です。進入が変わったレースの公式集計は展示進入想定です。</div>
    <div class="grid">${focusStats}</div>
    <h2 class="sec">朝予想 vs 展示反映</h2>
    <div class="sub">${esc(mvNote)}</div>
    <div class="grid">${mvCards}</div>
    ${evBlock}
    <h2 class="sec">固いレース TOP20</h2>
    ${todayFocus.filter((r) => r.focus === "solid").map(focusCard).join("") || "<div class='sub'>なし</div>"}
    <h2 class="sec">混戦 TOP20</h2>
    ${todayFocus.filter((r) => r.focus === "mixed").map(focusCard).join("") || "<div class='sub'>なし</div>"}
    <h2 class="sec">本命1着的中率の日次推移</h2>
    <div class="card">${sparkline(aggs.daily, "honmei")}</div>
    <h2 class="sec">得意な場ランキング</h2>
    <div class="sub">本命的中率順。サンプル ${aggs.min_venue_n ?? 8} レース未満は参考表示。</div>
    <div class="card" style="padding:8px 10px;overflow-x:auto">
      <table class="plain">
        <thead><tr><th>場</th><th>n</th><th>本命</th><th>2連単</th><th>3連単</th><th>回収率</th></tr></thead>
        <tbody>${venueRows}</tbody>
      </table>
    </div>
    <h2 class="sec">当日の全レース</h2>
    <div class="card" style="padding:8px 10px;overflow-x:auto">
      <table class="plain">
        <thead><tr><th>レース</th><th>本命</th><th>結果</th><th>本命</th><th>2連</th><th>3連</th></tr></thead>
        <tbody>${todayRows}</tbody>
      </table>
    </div>
    <div class="disc">払戻は公式の100円あたり払戻金を、提案した組番に100円ずつ投票したと仮定した仮想の回収率です。的中を保証するものではありません。</div>`;
}

function viewHistory(day) {
  const days = (HISTORY && HISTORY.days) || (REPORT && REPORT.aggs && REPORT.aggs.daily) || [];
  if (!days.length) return `<div class="empty">まだ履歴がありません。夜の答え合わせから蓄積されます。</div>`;
  if (day) {
    const d = days.find((x) => x.date === day);
    const races = (HISTORY && HISTORY.races && HISTORY.races[day]) || [];
    const focus = ((HISTORY && HISTORY.focus) || []).filter((r) => r.date === day);
    if (!d && !races.length) return `<button class="back" data-go="#/history">← 履歴</button><div class="empty">その日のデータがありません</div>`;
    const rowHtml = races.map((r) => {
      const cls = Number(r.honmei_hit) ? "hit" : "miss";
      return `<tr><td>${esc(r.venue)} ${r.rno}R</td><td>${r.honmei ?? "-"}</td><td>${esc(r.result_123 || "")}</td>
        <td class="${cls}">${mark(r.honmei_hit)}</td><td>${mark(r.exacta_top3_hit ?? r.exacta_hit)}</td><td>${mark(r.trifecta_top5_hit ?? r.trifecta_hit)}</td></tr>`;
    }).join("");
    const rows = rowHtml || "<tr><td colspan='6'>なし</td></tr>";
    return `<button class="back" data-go="#/history">← 履歴</button>
      <div class="title">${esc(dateLabel(day))}</div>
      <div class="grid" style="margin-top:10px">${statCard({ label: "その日", ...(d || {}) }, "wide")}</div>
      ${focus.length ? `<h2 class="sec">注目40</h2>${focus.map(focusCard).join("")}` : ""}
      <h2 class="sec">全レース</h2>
      <div class="card" style="padding:8px 10px;overflow-x:auto">
        <table class="plain">
          <thead><tr><th>レース</th><th>本命</th><th>結果</th><th>本命</th><th>2連</th><th>3連</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
  const list = [...days].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((d) => {
    return `<article class="card tap day-card" data-go="#/history/${d.date}">
      <div class="row">
        <div>
          <div class="title">${esc(dateLabel(d.date))}</div>
          <div class="stats"><span>n=${d.n ?? 0}</span><span>2連 ${pct(d.exacta)}</span><span>3連 ${pct(d.trifecta)}</span></div>
        </div>
        <div class="side">
          <div class="v">${pct(d.honmei)}</div>
          <div class="sub">本命</div>
          <div class="sub">回収率 ${retPct(d.roi)}</div>
        </div>
      </div>
    </article>`;
  }).join("");
  return `<div class="metric">これまでに答え合わせした日の成績です。日付を開くと、その日のレース一覧が見られます。</div>
    <h2 class="sec">本命的中率の推移</h2>
    <div class="card">${sparkline(days, "honmei")}</div>
    <h2 class="sec">日別</h2>
    ${list}`;
}

function parseRoute() {
  const h = location.hash || "#/";
  const race = h.match(/^#\/v\/(\d+)\/r\/(\d+)/);
  if (race) return { tab: "yoso", view: "race", jcd: race[1], rno: race[2], seg: null };
  const ven = h.match(/^#\/v\/(\d+)/);
  if (ven) return { tab: "yoso", view: "venue", jcd: ven[1], seg: null };
  if (h.startsWith("#/report")) return { tab: "report", view: "report", seg: null };
  const hist = h.match(/^#\/history\/(\d{8})/);
  if (hist) return { tab: "history", view: "history-day", day: hist[1], seg: null };
  if (h.startsWith("#/history")) return { tab: "history", view: "history", seg: null };
  if (h.startsWith("#/mixed") || h.startsWith("#/yoso/mixed")) return { tab: "yoso", view: "list", seg: "mixed" };
  if (h.startsWith("#/solid") || h.startsWith("#/yoso/solid")) return { tab: "yoso", view: "list", seg: "solid" };
  if (h.startsWith("#/close") || h.startsWith("#/deadline")) return { tab: "yoso", view: "list", seg: "close" };
  if (h.startsWith("#/all") || h.startsWith("#/yoso/all") || h.startsWith("#/meet")) return { tab: "yoso", view: "list", seg: "meet" };
  return { tab: "yoso", view: "list", seg: "meet" };
}

function route() {
  const r = parseRoute();
  $$(".tabbar .tab").forEach((a) => a.classList.toggle("on", a.dataset.tab === r.tab));
  const segs = $("#segments");
  const title = $("#pageTitle");
  const dateEl = $("#dateLabel");
  if (r.tab === "yoso" && r.view !== "race" && r.view !== "venue") {
    segs.hidden = false;
    segs.style.display = "";
    $$("#segments button").forEach((b) => b.classList.toggle("on", b.dataset.seg === (r.seg || "meet")));
    title.textContent = "競艇予想";
    dateEl.textContent = TODAY ? (TODAY.date_label || dateLabel(TODAY.date)) : "";
  } else {
    segs.hidden = true;
    segs.style.display = "none";
    if (r.tab === "report") {
      title.textContent = "答え合わせ";
      dateEl.textContent = REPORT ? dateLabel((REPORT.aggs || REPORT).today) : "";
    } else if (r.tab === "history") {
      title.textContent = "履歴";
      dateEl.textContent = "";
    } else {
      title.textContent = "競艇予想";
      dateEl.textContent = TODAY ? (TODAY.date_label || dateLabel(TODAY.date)) : "";
    }
  }
  renderStatus(r.view === "race" ? "" : r.tab);
  let html = "";
  if (r.view === "race") html = viewRace(r.jcd, r.rno);
  else if (r.view === "venue") html = viewVenue(r.jcd);
  else if (r.tab === "report") html = viewReport();
  else if (r.view === "history-day") html = viewHistory(r.day);
  else if (r.tab === "history") html = viewHistory();
  else html = viewYoso(r.seg || "meet");
  main.innerHTML = html;
  window.scrollTo(0, 0);
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(path + " " + res.status);
  return res.json();
}

async function loadAll(force) {
  if (!force && Date.now() - lastFetch < 15000 && TODAY) return;
  const btn = $("#refreshBtn");
  if (btn) btn.classList.add("busy");
  try {
    const jobs = [
      loadJSON("data/today.json").then((d) => { TODAY = d; }).catch(() => { if (!TODAY) TODAY = null; }),
      loadJSON("data/report.json").then((d) => { REPORT = d; }).catch(() => { if (!REPORT) REPORT = null; }),
      loadJSON("data/history.json").then((d) => { HISTORY = d; }).catch(() => { if (!HISTORY) HISTORY = null; }),
      loadJSON("data/meta.json").then((d) => { META = d; }).catch(() => {})
    ];
    await Promise.all(jobs);
    lastFetch = Date.now();
    route();
  } finally {
    if (btn) btn.classList.remove("busy");
  }
}

function setupInstall() {
  const banner = $("#installBanner");
  const how = $("#installHow");
  const close = $("#installClose");
  if (!banner) return;
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    banner.hidden = true;
    return;
  }
  if (/(?:^|[?&])noinstall=1(?:&|$)/.test(location.search || "")) {
    banner.hidden = true;
    return;
  }
  if (localStorage.getItem("kyotei-hide-install") === "1") {
    banner.hidden = true;
    return;
  }
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua);
  how.textContent = ios
    ? "Safariの共有ボタンから「ホーム画面に追加」を選んでください。"
    : "ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選んでください。";
  banner.hidden = false;
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    how.textContent = "下の「追加する」を押すと、ホーム画面から開けます。";
    if (!$("#installDo")) {
      const b = document.createElement("button");
      b.id = "installDo";
      b.type = "button";
      b.className = "refresh";
      b.textContent = "追加する";
      b.style.marginTop = "8px";
      how.after(b);
      b.addEventListener("click", async () => {
        if (!deferred) return;
        deferred.prompt();
        await deferred.userChoice;
        deferred = null;
        banner.hidden = true;
      });
    }
  });
  close.addEventListener("click", () => {
    banner.hidden = true;
    localStorage.setItem("kyotei-hide-install", "1");
  });
}

function bind() {
  $$("#segments button").forEach((b) => {
    b.addEventListener("click", () => {
      const seg = b.dataset.seg;
      location.hash = seg === "meet" ? "#/" : (seg === "solid" ? "#/solid" : (seg === "mixed" ? "#/mixed" : "#/close"));
    });
  });
  main.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go]");
    if (!t) return;
    const r = parseRoute();
    if (r.tab === "yoso" && r.view !== "race") {
      sessionStorage.setItem("kyotei-back", location.hash || "#/");
    }
    location.hash = t.getAttribute("data-go");
  });
  $("#refreshBtn")?.addEventListener("click", () => loadAll(true));
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadAll(false);
  });
  tickTimer = setInterval(refreshCountdowns, 15000);
  setInterval(() => {
    if (document.visibilityState === "visible") loadAll(false);
  }, 5 * 60 * 1000);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

setupInstall();
bind();
loadAll(true);
