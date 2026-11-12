// משימת בסיס ירח — שכבת חיבור לשרת: Google Sheets (Apps Script Web App)
(() => {
"use strict";
const CFG = window.MOON_CONFIG || {};
const LS = "moon-base-api";
const params = new URLSearchParams(location.search);
const valid = (u) => /^(https:\/\/script\.google(usercontent)?\.com\/|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)\S*\/exec$/.test(String(u || "").trim());
let url = "", source = "";
const fromParam = (params.get("api") || "").trim();
if (valid(fromParam)) { url = fromParam; source = "param"; try { localStorage.setItem(LS, url); } catch {} }
else if (valid(CFG.SHEETS_URL)) { url = CFG.SHEETS_URL.trim(); source = "config"; }
else { try { const s = localStorage.getItem(LS) || ""; if (valid(s)) { url = s; source = "saved"; } } catch {} }

const ACTIONS = {
  "POST /api/room": "create", "GET /api/room": "room",
  "POST /api/room/start": "start", "POST /api/room/end": "end", "POST /api/room/kick": "kick",
  "POST /api/join": "join", "POST /api/report": "report",
};
function err(msg, status) { const e = new Error(msg); e.status = status; return e; }

async function call(method, path, body) {
  if (!url) throw err("המשחק עוד לא מחובר לגיליון של המורה. סרקו שוב את קוד ה-QR מהלוח.", 0);
  const [p, qs] = path.split("?");
  const a = ACTIONS[method + " " + p];
  if (!a) throw err("פעולה לא מוכרת", 404);
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
  let r;
  try {
    if (method === "GET") {
      const q = new URLSearchParams(qs || ""); q.set("a", a); q.set("_", Date.now());
      r = await fetch(url + "?" + q.toString(), { method: "GET", redirect: "follow", cache: "no-store", signal: ctl.signal });
    } else {
      // text/plain keeps this a "simple" request: no CORS preflight, which Apps Script cannot answer.
      r = await fetch(url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ a }, body || {})), signal: ctl.signal });
    }
  } catch (e) { throw err("אין חיבור לשרת, מנסים שוב...", 0); }
  finally { clearTimeout(tm); }
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok || !j) throw err("השרת לא ענה כמו שצריך, נסו שוב", r.ok ? 502 : r.status);
  if (j.error) throw err(j.error, j.status || 400);
  return j;
}
function set(u) {
  u = String(u || "").trim();
  if (!valid(u)) return false;
  url = u; source = "saved"; try { localStorage.setItem(LS, u); } catch {}
  return true;
}
function clear() { try { localStorage.removeItem(LS); } catch {} if (source !== "config") { url = ""; source = ""; } }

window.MoonAPI = {
  sheets: true,
  call, set, clear, valid,
  get url() { return url; },
  get source() { return source; },
  // students need the address too when it is not written in config.js: it rides the QR link
  get shareParam() { return url && source !== "config" ? url : ""; },
  POLL_TEACHER_MS: 3000,
  POLL_LOBBY_MS: 4000,
  HEARTBEAT_MS: 20000,   // during play: only when something changed, plus a slow heartbeat to hear "game ended"
  SEND_DELAY_MS: 1500,  // after an answer
  SOFT_DELAY_MS: 10000, // after a progress-only change ("next" button, base building)
  AWAY_MS: 50000,
};
})();
