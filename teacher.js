(() => {
"use strict";
const API = window.MoonAPI; // Google Sheets (Apps Script) — see api.js / config.js
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let code = (params.get("room") || "").replace(/\D/g, ""), k = params.get("k") || "";
let data = null, timer = null, view = "";
const ICON = { 0: "⏳", 1: "📍", 2: "🌗", 3: "☄️", 4: "🌡️", 5: "🏋️", 6: "📜", 7: "🏗️", 8: "✅" };
const SNAME = ["מחכה", "אתר נחיתה", "מופעי הירח", "מטאורים", "יום ולילה", "כבידה", "מסע בזמן", "בונים בסיס", "סיים"];
const NQ = 7;

function views(v) {
  view = v;
  ["t-home", "t-lobby", "t-play", "t-final"].forEach((id) => { $("#" + id).hidden = id !== "t-" + v; });
  $("#btnStart").hidden = v !== "lobby";
  $("#btnEnd").hidden = v !== "play";
  $("#btnNew").hidden = v !== "final";
  $("#tCount").hidden = v === "home";
}
const call = (method, path, body) => API.call(method, path, body);
function drawApi() {
  const has = !!API.url;
  $("#setupBox").hidden = has; $("#btnCreate").hidden = !has;
  $("#apiState").hidden = !has;
  if (has) $("#apiState").innerHTML = `✅ מחובר לגיליון Google${API.source === "config" ? "" : ` · <a href="#" id="apiChange" style="color:inherit">החלפת כתובת</a>`}`;
  const ch = document.getElementById("apiChange");
  if (ch) ch.onclick = (e) => { e.preventDefault(); API.clear(); $("#apiIn").value = ""; drawApi(); };
}
$("#apiSave").onclick = () => {
  if (API.set($("#apiIn").value)) { $("#apiErr").textContent = ""; drawApi(); }
  else $("#apiErr").textContent = "זו לא נראית כתובת /exec של Apps Script. העתיקו אותה שוב מחלון הפריסה.";
};
drawApi();
const SITE_DIR = location.pathname.replace(/[^/]*$/, ""); // "/" on tab.bot, "/shliach-hadachaf-game/" on GitHub Pages
function joinUrl() { const a = API.shareParam; return `${location.origin}${SITE_DIR}?code=${code}${a ? "&api=" + encodeURIComponent(a) : ""}`; }
function qrSvg(text, cell) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}
function drawJoin() {
  $("#qrBig").innerHTML = qrSvg(joinUrl(), 8);
  $("#qrMini").innerHTML = qrSvg(joinUrl(), 4);
  $("#joinUrl").textContent = `${location.host}${SITE_DIR}`.replace(/\/$/, "");
  $("#codeBig").textContent = code; $("#codeMini").textContent = code;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const overall = (p) => p.done ? 100 : p.stage ? Math.round(((p.stage - 1) * 100 + p.prog) / NQ) : 0;

$("#btnCreate").onclick = async () => {
  $("#btnCreate").disabled = true; $("#homeErr").textContent = "";
  try {
    const j = await call("POST", "/api/room");
    code = j.code; k = j.k;
    history.replaceState(null, "", `${location.pathname}?room=${code}&k=${k}`);
    drawJoin(); views("lobby"); poll();
  } catch (e) { $("#homeErr").textContent = e.message; }
  finally { $("#btnCreate").disabled = false; }
};
$("#btnStart").onclick = async () => { $("#btnStart").disabled = true; try { await call("POST", "/api/room/start", { code, k }); await refresh(); } catch (e) { alert(e.message); } $("#btnStart").disabled = false; };
$("#btnEnd").onclick = async () => {
  if (!confirm("לסיים את המשחק לכולם ולהציג את הזוכים?")) return;
  try { await call("POST", "/api/room/end", { code, k }); await refresh(); } catch (e) { alert(e.message); }
};
$("#btnNew").onclick = () => { clearTimeout(timer); timer = null; history.replaceState(null, "", location.pathname); code = ""; k = ""; data = null; views("home"); };
$("#names").addEventListener("click", async (e) => {
  const b = e.target.closest(".name-tag"); if (!b) return;
  if (!confirm(`להוציא את ${b.textContent} מהמשחק?`)) return;
  try { await call("POST", "/api/room/kick", { code, k, id: b.dataset.id }); await refresh(); } catch (ex) { alert(ex.message); }
});

async function refresh() {
  try {
    data = await call("GET", `/api/room?code=${code}&k=${encodeURIComponent(k)}`);
  } catch (e) {
    if (e.status === 404) { clearTimeout(timer); timer = null; views("home"); $("#homeErr").textContent = "המשחק הזה לא נמצא או שפג תוקפו. פתחו משחק חדש."; history.replaceState(null, "", location.pathname); }
    return;
  }
  render();
}
function poll() { clearTimeout(timer); const go = async () => { await refresh(); if (code) timer = setTimeout(go, API.POLL_TEACHER_MS); }; go(); }

function render() {
  const ps = data.players || [];
  $("#tCount").textContent = `${ps.length} תלמידים · קוד ${data.code}`;
  if (data.status === "lobby") { if (view !== "lobby") { drawJoin(); views("lobby"); } renderLobby(ps); }
  else if (data.status === "playing") { if (view !== "play") { drawJoin(); views("play"); } renderPlay(ps); }
  else { if (view !== "final") views("final"); renderFinal(ps); }
}
function renderLobby(ps) {
  $("#lobbyCount").textContent = ps.length === 1 ? "תלמיד אחד הצטרף" : `${ps.length} תלמידים הצטרפו`;
  const box = $("#names");
  const have = new Set([...box.children].map((c) => c.dataset.id));
  const want = new Set(ps.map((p) => p.id));
  [...box.children].forEach((c) => { if (!want.has(c.dataset.id)) c.remove(); });
  ps.forEach((p) => { if (!have.has(p.id)) { const b = document.createElement("button"); b.className = "name-tag"; b.dataset.id = p.id; b.textContent = p.name; b.title = "הוצאה מהמשחק"; box.appendChild(b); } });
}
function renderPlay(ps) {
  const now = data.now;
  const cnt = (s) => ps.filter((p) => (p.done ? 8 : p.stage || 1) === s).length;
  $("#stats").innerHTML = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => `<div class="stat"><b>${cnt(s)}</b>${ICON[s]} ${s < 8 ? s : "סיימו"}</div>`).join("");
  $("#grid").innerHTML = ps.map((p) => {
    const st = p.done ? 8 : p.stage || 0;
    const away = now - p.seen > API.AWAY_MS;
    const site = p.d && p.d.site ? SITE_ICON[p.d.site] : "";
    return `<div class="st-card${p.done ? " done" : ""}${away ? " away" : ""}">
      <div class="st-head"><span class="nm">${esc(p.name)}</span><span title="שלב">${site} ${ICON[st]}</span></div>
      <div class="pbar"><i style="width:${overall(p)}%"></i></div>
      <div class="st-meta"><span>${p.pts} נק׳</span><span>${p.done ? "סיים ✓" : st ? "שלב " + st + "/7" : "מחכה"}</span></div>
    </div>`;
  }).join("") || `<p class="muted" style="font-size:1.3rem">עדיין אין תלמידים. הם יכולים להצטרף גם עכשיו.</p>`;
  const top = [...ps].sort((a, b) => b.pts - a.pts).slice(0, 5);
  $("#top5").innerHTML = top.map((p, i) => `<li><span class="rk">${i + 1}</span><span class="nm">${esc(p.name)} ${p.done ? "✅" : ICON[p.stage || 0]}</span><span>${p.pts}</span></li>`).join("");
}
const SITE_ICON = { mare: "🟤", high: "⛰️", south: "🧊", far: "🌑" };
const SITE_NAME = { mare: "ים השלווה", high: "הרמות", south: "הקוטב הדרומי", far: "הצד הרחוק" };
const EN_NAME = { nuclear: "כור גרעיני", solarbat: "שמש + סוללות", solar: "שמש בלבד", wind: "רוח" };
const STAGE_T = ["אתר נחיתה", "מופעי הירח", "סערת מטאורים", "יום ולילה", "שישית מהמשקל", "מסע בזמן"];
let finalKey = "";
function bars(rows, total, cls) {
  return `<div class="dist">${rows.map(([lbl, v, col, txt]) => `<div class="cmp-row"><span>${lbl}</span><span class="cmp-track"><span class="cmp-fill" style="display:block;width:${total ? Math.max(v ? 6 : 0, (v / total) * 100) : 0}%;background:${col}"></span></span><span>${txt}</span></div>`).join("")}</div>`;
}
function renderFinal(ps) {
  const key = JSON.stringify(ps.map((p) => [p.id, p.pts, p.d]));
  if (key === finalKey) return; finalKey = key;
  const top = [...ps].sort((a, b) => b.pts - a.pts).slice(0, 3);
  $("#podium").innerHTML = [[1, "second", "2"], [0, "first", "1"], [2, "third", "3"]]
    .map(([i, cls, n]) => { const p = top[i]; return p ? `<div class="pod ${cls}"><div class="who">${esc(p.name)}</div><div class="p">${p.pts} נק׳</div><div class="block">${n}</div></div>` : `<div class="pod ${cls}"></div>`; }).join("");
  const ds = ps.map((p) => p.d).filter(Boolean);
  const withSite = ds.filter((d) => d.site);
  const siteRows = ["south", "mare", "high", "far"].map((k) => { const v = withSite.filter((d) => d.site === k).length; return [`${SITE_ICON[k]} ${SITE_NAME[k]}`, v, k === "south" ? "#2fbf71" : k === "far" ? "#ef5b5b" : "#f6b21b", `${v}`]; });
  const accRows = STAGE_T.map((t, i) => {
    let c = 0, n = 0; ds.forEach((d) => { if (d.acc && d.acc[i]) { c += d.acc[i][0]; n += d.acc[i][1]; } });
    const pct = n ? Math.round((c / n) * 100) : null;
    return [t, pct || 0, pct == null ? "#555" : pct >= 75 ? "#2fbf71" : pct >= 50 ? "#f6b21b" : "#ef5b5b", pct == null ? "-" : pct + "%"];
  });
  const withEn = ds.filter((d) => d.en);
  const enRows = ["nuclear", "solarbat", "solar", "wind"].map((k) => { const v = withEn.filter((d) => d.en === k).length; return [EN_NAME[k], v, "#8ec5ff", `${v}`]; });
  const secs = ds.map((d) => d.sec).filter((x) => x > 0);
  const avgMin = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length / 60) : null;
  const weakest = accRows.filter((r) => r[3] !== "-").sort((a, b) => a[1] - b[1])[0];
  $("#summary").innerHTML = `
    <h2>📊 סיכום הכיתה</h2>
    <p style="font-weight:700;margin:.2rem 0 .8rem">${ps.length} תלמידים שיחקו · ${ps.filter((p) => p.done).length} סיימו את כל השלבים${avgMin ? ` · זמן ממוצע ${avgMin} דק׳` : ""}</p>
    <h3 style="margin:.4rem 0">📍 איפה בחרו לנחות?</h3>
    ${bars(siteRows, withSite.length)}
    <h3 style="margin:.8rem 0 .4rem">🎯 אחוז תשובות נכונות בכל שלב</h3>
    ${bars(accRows, 100)}
    <h3 style="margin:.8rem 0 .4rem">⚡ מקור החשמל שנבחר</h3>
    ${bars(enRows, withEn.length)}
    <p class="conclusion big-concl">לדיון: ${withSite.some((d) => d.site === "far") ? "מי שבחר בצד הרחוק – מה היה חסר שם? " : ""}למה הקוטב הדרומי הוא היעד של ארטמיס?${weakest ? ` השלב הכי קשה לכיתה: ${weakest[0]}.` : ""}</p>`;
}

// boot
if (code && k) { drawJoin(); views("lobby"); poll(); } else views("home");
})();
