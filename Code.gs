/**
 * משימת בסיס ירח — שרת המשחק בתוך Google Sheets (Apps Script)
 * ------------------------------------------------------------
 * מדביקים את כל הקובץ הזה ב"הרחבות ← Apps Script" של הגיליון, שומרים,
 * מפעילים פעם אחת את הפונקציה setup, ופורסים כ"אפליקציית אינטרנט"
 * (הרצה בתור: אני · גישה: כל אחד). הכתובת שמסתיימת ב-/exec היא כתובת המשחק.
 *
 * לשוניות שנוצרות: "חדרים", "תלמידים", "תשובות".
 * הלוח של המורה קורא מצב חי מזיכרון מטמון (CacheService), וכל שינוי נכתב גם לגיליון.
 */

var SHEET_ROOMS = 'חדרים';
var SHEET_PLAYERS = 'תלמידים';
var SHEET_ANSWERS = 'תשובות';

var H_ROOMS = ['קוד חדר', 'מצב', 'נפתח', 'התחיל', 'הסתיים', 'מספר תלמידים', 'מפתח מורה (טכני)'];
var H_PLAYERS = ['קוד חדר', 'שם', 'שלב', 'התקדמות בשלב (%)', 'ניקוד', 'סיים', 'אתר נחיתה', 'מקור חשמל',
  'זמן משחק (דקות)', 'הצטרף', 'נראה לאחרונה', 'מזהה (טכני)', 'טוקן (טכני)', 'נתונים (טכני)', 'שאלות שנרשמו (טכני)'];
var H_ANSWERS = ['זמן', 'קוד חדר', 'שם', 'שלב', 'שאלה', 'בחירה', 'נכון?', 'נקודות'];

// player-sheet column numbers (1-based)
var P = { CODE: 1, NAME: 2, STAGE: 3, PROG: 4, PTS: 5, DONE: 6, SITE: 7, EN: 8, MIN: 9, JOINED: 10, SEEN: 11, ID: 12, TOK: 13, D: 14, LOGGED: 15 };
var R = { CODE: 1, STATUS: 2, CREATED: 3, STARTED: 4, ENDED: 5, COUNT: 6, K: 7 };

var DAY = 24 * 60 * 60 * 1000;
var CACHE_SEC = 6 * 60 * 60;          // live room state, rewritten on every change
var MAX_PLAYERS = 80;

var STATUS_HE = { lobby: 'ממתינים', playing: 'משחקים', ended: 'הסתיים' };
var STATUS_EN = { 'ממתינים': 'lobby', 'משחקים': 'playing', 'הסתיים': 'ended' };
var SITE_HE = { mare: 'ים השלווה', high: 'הרמות', south: 'הקוטב הדרומי', far: 'הצד הרחוק' };
var EN_HE = { nuclear: 'כור גרעיני', solarbat: 'שמש + סוללות', solar: 'שמש בלבד', wind: 'רוח' };
var STAGE_HE = ['', 'אתר נחיתה', 'מופעי הירח', 'סערת מטאורים', 'יום ולילה', 'שישית מהמשקל', 'מסע בזמן', 'בונים בסיס', 'סיים'];

/* ===================== entry points ===================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.a) return out_({ ok: true, app: 'משימת בסיס ירח', message: 'השרת עובד ✓ שלחו את הכתובת הזאת ל-Tab.' });
  return handle_(p.a, p);
}

function doPost(e) {
  var b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; } catch (err) { b = {}; }
  var p = (e && e.parameter) || {};
  return handle_(b.a || p.a, b);
}

function handle_(a, b) {
  try {
    var res;
    switch (String(a || '')) {
      case 'create': res = createRoom_(); break;
      case 'room': res = teacherState_(b); break;
      case 'start': case 'end': case 'kick': res = teacherAction_(a, b); break;
      case 'join': res = join_(b); break;
      case 'report': res = report_(b); break;
      case 'ping': res = { ok: true, now: Date.now() }; break;
      default: res = fail_('פעולה לא מוכרת', 404);
    }
    return out_(res);
  } catch (err) {
    return out_(fail_('שגיאת שרת: ' + (err && err.message ? err.message : err), 500));
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(msg, status) { return { error: msg, status: status || 400 }; }

/* ===================== one-time setup ===================== */

/** הפעילו פעם אחת מתוך העורך (בחירת setup ← הפעלה). יוצר את הלשוניות ומבקש הרשאה. */
function setup() {
  var ss = ss_();
  sheet_(ss, SHEET_ROOMS, H_ROOMS);
  sheet_(ss, SHEET_PLAYERS, H_PLAYERS);
  sheet_(ss, SHEET_ANSWERS, H_ANSWERS);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  return 'מוכן ✓';
}

function ss_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (err) { ss = null; }
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) ss = SpreadsheetApp.openById(id);
  }
  if (!ss) throw new Error('הסקריפט לא מחובר לגיליון. פתחו אותו מתוך הגיליון: הרחבות ← Apps Script.');
  return ss;
}

function sheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    try { sh.setRightToLeft(true); } catch (err) {}
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#0b1a3a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    try { sh.setRightToLeft(true); } catch (err) {}
  }
  return sh;
}
function sheets_() {
  var ss = ss_();
  return { rooms: sheet_(ss, SHEET_ROOMS, H_ROOMS), players: sheet_(ss, SHEET_PLAYERS, H_PLAYERS), answers: sheet_(ss, SHEET_ANSWERS, H_ANSWERS) };
}

/* ===================== helpers ===================== */

function rand_(n) {
  var chars = 'abcdefghijkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
function cleanName_(s) {
  return String(s || '').replace(/[<>&"'`\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
}
function num_(v, lo, hi) { var n = Number(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; }
function okCode_(c) { return /^\d{4}$/.test(String(c || '')); }
function ms_(v) { if (v instanceof Date) return v.getTime(); var n = Number(v); return isFinite(n) && n > 0 ? n : null; }
function date_(ms) { return ms ? new Date(ms) : ''; }
// a typed name must never be read by Sheets as a formula
function safeText_(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('יש עומס רגעי, מנסים שוב...', 503);
  try { return fn(); } finally { lock.releaseLock(); }
}

var cache_ = null;
function cache() { if (!cache_) cache_ = CacheService.getScriptCache(); return cache_; }
function ckey_(code) { return 'room:' + code; }
function skey_(code, id) { return 'seen:' + code + ':' + id; }

/** Live room state: {code,k,status,created,started,ended,row, players:{id:{...,row}}} */
function loadRoom_(code, sh) {
  if (!okCode_(code)) return null;
  var raw = cache().get(ckey_(code));
  if (raw) { try { var st = JSON.parse(raw); if (st && st.code === code) return st; } catch (err) {} }
  return rebuildRoom_(code, sh || sheets_());
}
function saveRoom_(st) {
  try { cache().put(ckey_(st.code), JSON.stringify(st), CACHE_SEC); } catch (err) { /* too big or cache down: next read rebuilds from the sheet */ }
}
function rebuildRoom_(code, sh) {
  var last = sh.rooms.getLastRow();
  if (last < 2) return null;
  var rows = sh.rooms.getRange(2, 1, last - 1, H_ROOMS.length).getValues();
  var st = null;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][R.CODE - 1]) === code) {
      var r = rows[i];
      st = { code: code, k: String(r[R.K - 1]), status: STATUS_EN[r[R.STATUS - 1]] || String(r[R.STATUS - 1]) || 'lobby',
        created: ms_(r[R.CREATED - 1]), started: ms_(r[R.STARTED - 1]), ended: ms_(r[R.ENDED - 1]), row: i + 2, players: {} };
      break;
    }
  }
  if (!st) return null;
  var pl = sh.players.getLastRow();
  if (pl >= 2) {
    var ps = sh.players.getRange(2, 1, pl - 1, H_PLAYERS.length).getValues();
    for (var j = 0; j < ps.length; j++) {
      var p = ps[j];
      if (String(p[P.CODE - 1]) !== code) continue;
      var joined = ms_(p[P.JOINED - 1]) || 0;
      if (joined < st.created) continue;            // an older room that used the same code
      if (String(p[P.DONE - 1]) === 'הוצא') continue; // kicked by the teacher
      var d = null; try { d = p[P.D - 1] ? JSON.parse(p[P.D - 1]) : null; } catch (err) {}
      var id = String(p[P.ID - 1]);
      st.players[id] = { id: id, tok: String(p[P.TOK - 1]), name: String(p[P.NAME - 1]).replace(/^'/, ''),
        stage: Number(p[P.STAGE - 1]) || 0, prog: Number(p[P.PROG - 1]) || 0, pts: Number(p[P.PTS - 1]) || 0,
        d: d, done: String(p[P.DONE - 1]) === 'כן' ? 1 : 0, joined: joined, seen: ms_(p[P.SEEN - 1]) || joined, row: j + 2, lg: String(p[P.LOGGED - 1] || '') };
    }
  }
  saveRoom_(st);
  return st;
}
function live_(st) { return st && st.created && Date.now() - st.created <= DAY; }

function playerRow_(p, code) {
  var d = p.d || {};
  var minutes = d.sec ? Math.round(d.sec / 6) / 10 : '';
  return [code, safeText_(p.name), p.done ? 'סיים' : (STAGE_HE[p.stage] || 'מחכה'), p.prog, p.pts, p.done ? 'כן' : 'לא',
    SITE_HE[d.site] || '', EN_HE[d.en] || '', minutes, date_(p.joined), date_(p.seen), p.id, p.tok,
    p.d ? JSON.stringify(p.d) : '', p.lg || ''];
}

/* ===================== actions ===================== */

function createRoom_() {
  return withLock_(function () {
    var sh = sheets_(), now = Date.now();
    var used = {};
    var last = sh.rooms.getLastRow();
    if (last >= 2) {
      var rows = sh.rooms.getRange(2, 1, last - 1, 3).getValues();
      for (var i = 0; i < rows.length; i++) {
        var c = ms_(rows[i][2]);
        if (c && now - c < 30 * DAY) used[String(rows[i][0])] = true; // don't reuse a code for a month
      }
    }
    var code = null;
    for (var t = 0; t < 200 && !code; t++) {
      var c2 = String(1000 + Math.floor(Math.random() * 9000));
      if (!used[c2]) code = c2;
    }
    if (!code) return fail_('לא הצלחנו ליצור קוד, נסו שוב', 503);
    var k = rand_(16), row = sh.rooms.getLastRow() + 1;
    sh.rooms.getRange(row, 1, 1, H_ROOMS.length).setValues([[code, STATUS_HE.lobby, new Date(now), '', '', 0, k]]);
    saveRoom_({ code: code, k: k, status: 'lobby', created: now, started: null, ended: null, row: row, players: {} });
    return { code: code, k: k };
  });
}

function publicPlayers_(st) {
  var list = [], keys = [];
  for (var id0 in st.players) keys.push(skey_(st.code, id0));
  var seen = {};
  try { seen = keys.length ? cache().getAll(keys) || {} : {}; } catch (err) { seen = {}; }
  for (var id in st.players) {
    var p = st.players[id];
    var hb = Number(seen[skey_(st.code, id)]) || 0;
    list.push({ id: p.id, name: p.name, stage: p.stage, prog: p.prog, pts: p.pts, d: p.d, done: p.done, joined: p.joined, seen: Math.max(p.seen || 0, hb) });
  }
  list.sort(function (a, b) { return a.joined - b.joined; });
  return list;
}

function teacherState_(b) {
  var code = String(b.code || '');
  var st = loadRoom_(code);                       // cache first: no sheet read on a normal poll
  if (!st || !live_(st) || !b.k || st.k !== String(b.k)) return fail_('החדר לא נמצא או שפג תוקפו', 404);
  return { code: st.code, status: st.status, created: st.created, started: st.started, ended: st.ended, now: Date.now(), players: publicPlayers_(st) };
}

function teacherAction_(a, b) {
  return withLock_(function () {
    var sh = sheets_(), code = String(b.code || '');
    var st = loadRoom_(code, sh);
    if (!st || !live_(st) || !b.k || st.k !== String(b.k)) return fail_('החדר לא נמצא', 404);
    var now = Date.now();
    if (a === 'start') {
      st.status = 'playing'; if (!st.started) st.started = now;
      sh.rooms.getRange(st.row, R.STATUS, 1, 3).setValues([[STATUS_HE.playing, date_(st.created), date_(st.started)]]);
    } else if (a === 'end') {
      st.status = 'ended'; st.ended = now;
      sh.rooms.getRange(st.row, R.STATUS).setValue(STATUS_HE.ended);
      sh.rooms.getRange(st.row, R.ENDED).setValue(new Date(now));
    } else {
      var p = st.players[String(b.id || '')];
      if (p) {
        sh.players.getRange(p.row, P.DONE).setValue('הוצא');
        delete st.players[p.id];
        sh.rooms.getRange(st.row, R.COUNT).setValue(Object.keys(st.players).length);
      }
    }
    saveRoom_(st);
    return { ok: true };
  });
}

function join_(b) {
  return withLock_(function () {
    var sh = sheets_(), code = String(b.code || '');
    var st = loadRoom_(code, sh);
    if (!st || !live_(st)) return fail_('לא מצאנו משחק עם הקוד הזה', 404);
    if (st.status === 'ended') return fail_('המשחק הזה כבר הסתיים', 409);
    var name = cleanName_(b.name);
    if (!name) return fail_('צריך לכתוב שם', 400);
    var names = {}, n = 0;
    for (var id in st.players) { names[st.players[id].name] = true; n++; }
    if (n >= MAX_PLAYERS) return fail_('החדר מלא', 409);
    if (names[name]) { var i = 2; while (names[name + ' ' + i]) i++; name = name + ' ' + i; }
    var now = Date.now();
    var p = { id: rand_(10), tok: rand_(16), name: name, stage: 0, prog: 0, pts: 0, d: null, done: 0, joined: now, seen: now, lg: '' };
    p.row = sh.players.getLastRow() + 1;
    sh.players.getRange(p.row, 1, 1, H_PLAYERS.length).setValues([playerRow_(p, code)]);
    st.players[p.id] = p;
    sh.rooms.getRange(st.row, R.COUNT).setValue(n + 1);
    saveRoom_(st);
    return { id: p.id, tok: p.tok, name: name, status: st.status };
  });
}

/** Student heartbeat + progress + new answer rows. Returns the room status. */
function report_(b) {
  var code = String(b.code || '');
  if (!okCode_(code)) return fail_('קוד לא תקין', 400);
  var hasState = b.st && typeof b.st === 'object';
  var ans = Array.isArray(b.ans) ? b.ans.slice(0, 40) : [];

  // A bare heartbeat changes nothing in the sheet: it is answered from the cache, with no lock and no sheet call.
  if (!hasState && !ans.length) {
    var st0 = loadRoom_(code);
    var p0 = st0 && st0.players[String(b.id || '')];
    if (!st0 || !p0 || p0.tok !== String(b.tok || '')) return fail_('השחקן לא נמצא', 404);
    try { cache().put(skey_(code, p0.id), String(Date.now()), CACHE_SEC); } catch (err) {}
    return { status: st0.status };
  }

  return withLock_(function () {
    var sh = sheets_();
    var st = loadRoom_(code, sh);
    if (!st) return fail_('החדר לא נמצא', 404);
    var p = st.players[String(b.id || '')];
    if (!p || p.tok !== String(b.tok || '')) return fail_('השחקן לא נמצא', 404);
    var now = Date.now(), changed = false;
    if (hasState) {
      var s = b.st;
      p.stage = num_(s.stage, 0, 8) || 0;
      p.prog = Math.round(num_(s.prog, 0, 100) || 0);
      p.pts = Math.round(num_(s.pts, -999, 99999) || 0);
      p.done = s.done ? 1 : 0;
      if (s.d && typeof s.d === 'object') { var dj = JSON.stringify(s.d); if (dj.length <= 3000) p.d = s.d; }
      changed = true;
    }
    p.seen = now;
    // answer rows, each question logged once per student even if the tablet re-sends it
    var logged = {}; String(p.lg || '').split(',').forEach(function (q) { if (q) logged[q] = true; });
    var rows = [];
    ans.forEach(function (x) {
      if (!x || typeof x !== 'object') return;
      var qid = String(x.id || '').replace(/[^\w-]/g, '').slice(0, 20);
      if (!qid || logged[qid]) return;
      logged[qid] = true;
      var when = num_(x.t, now - DAY, now + 60000) || now;
      rows.push([new Date(when), code, safeText_(p.name), String(x.stage || '').slice(0, 40), safeText_(String(x.q || '').slice(0, 300)),
        safeText_(String(x.c || '').slice(0, 300)), x.ok === true ? 'כן' : x.ok === 'part' ? 'חלקית' : 'לא', Math.round(num_(x.p, -999, 9999) || 0)]);
    });
    if (rows.length) {
      p.lg = Object.keys(logged).join(',');
      var ar = sh.answers.getLastRow() + 1;
      sh.answers.getRange(ar, 1, rows.length, H_ANSWERS.length).setValues(rows);
      changed = true;
    }
    if (changed) sh.players.getRange(p.row, 1, 1, H_PLAYERS.length).setValues([playerRow_(p, code)]);
    saveRoom_(st);
    return { status: st.status, logged: rows.length };
  });
}
