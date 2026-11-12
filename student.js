(() => {
"use strict";
const API = window.MoonAPI; // Google Sheets (Apps Script) — see api.js / config.js
const $ = (s) => document.querySelector(s);
const KEY = "moon-base-v1";
const NSTAGES = 6; // quiz stages; stage 7 = build the base; then the mission report

// ---------- state ----------
let S = load() || {};
function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
function fresh(code, id, tok, name) {
  S = { code, id, tok, name, seed: Math.floor(Math.random() * 1e9), stage: 0, qi: 0, pts: 0, done: 0, phase: "wait", ans: {}, t0: null, sec: null };
  save();
}
let dirty = true, status = "lobby", pollTimer = null, ended = false;

function show(id) {
  document.querySelectorAll("main > section").forEach((s) => { s.hidden = s.id !== id; });
  window.scrollTo(0, 0);
}
function setPts(p) { S.pts = Math.max(0, Math.round(p)); $("#ptsVal").textContent = S.pts; dirty = true; save(); }

const post = (path, body) => API.call("POST", path, body);
// one readable row per answer for the "תשובות" sheet; queued on the tablet until the sheet confirms it
const plain = (h) => String(h || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
function logAnswer(q, a) {
  let c = "";
  if (q.type === "num") c = `${a.v} ${q.unit || ""} (התשובה: ${fmt(q.ans)})`;
  else if (q.type === "order") c = (a.seq || []).map((k) => { const it = q.items.find((x) => x.k === k); return it ? plain(it.t) : k; }).join(" ← ");
  else c = plain(a.t);
  if (!S.out) S.out = [];
  S.out.push({ id: q.id, stage: `${S.stage}. ${STAGE_NAMES[S.stage] || ""}`, q: plain(q.text), c, ok: a.ok ? true : a.s > 0 ? "part" : false, p: a.s + a.bonus, t: Date.now() });
  save();
}

// seeded random (each student gets their own numbers and option order; stable on refresh)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(arr, key) { return arr[Math.floor(rng(S.seed ^ hash(key))() * arr.length)]; }
function shuffled(arr, key) { const r = rng(S.seed ^ hash(key)), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const fmt = (n) => String(Math.round(n * 10) / 10);

// ---------- visuals (SVG) ----------
function moonIcon(kind, size = 64) {
  const r = 26, c = 32;
  const dark = `<circle cx="${c}" cy="${c}" r="${r}" fill="#2b3550" stroke="#8da0c2" stroke-width="2"/>`;
  const lit = { full: `<circle cx="${c}" cy="${c}" r="${r}" fill="#f5f1dc"/>`,
    fq: `<path d="M${c} ${c - r} A${r} ${r} 0 0 1 ${c} ${c + r} Z" fill="#f5f1dc"/>`,
    lq: `<path d="M${c} ${c - r} A${r} ${r} 0 0 0 ${c} ${c + r} Z" fill="#f5f1dc"/>`,
    new: "" }[kind];
  return `<svg class="moon-ico" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${dark}${lit}</svg>`;
}
function landingMap(sel) {
  const pin = (k, x, y, n) => `<g class="pin${sel === k ? " sel" : ""}" data-k="${k}" role="button" tabindex="0" aria-label="${SITES[k].name}"><circle cx="${x}" cy="${y}" r="24"/><text x="${x}" y="${y + 8}" text-anchor="middle">${n}</text></g>`;
  return `<svg class="map-svg" viewBox="0 0 660 360" role="img" aria-label="מפת הירח: הצד הקרוב והצד הרחוק">
    <defs><radialGradient id="mg" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#d9d9d4"/><stop offset="1" stop-color="#9a9a96"/></radialGradient>
    <radialGradient id="fg" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#cfcfc9"/><stop offset="1" stop-color="#8d8d89"/></radialGradient></defs>
    <text x="490" y="26" class="map-lbl" text-anchor="middle">הצד הקרוב (פונה לכדור הארץ)</text>
    <text x="170" y="26" class="map-lbl" text-anchor="middle">הצד הרחוק (לא נראה מכדור הארץ)</text>
    <circle cx="490" cy="190" r="150" fill="url(#mg)"/>
    <g fill="#55565c" opacity=".85">
      <ellipse cx="440" cy="135" rx="52" ry="40"/><ellipse cx="500" cy="128" rx="30" ry="26"/><ellipse cx="535" cy="180" rx="38" ry="30"/>
      <ellipse cx="590" cy="150" rx="20" ry="16"/><ellipse cx="560" cy="235" rx="22" ry="30"/><ellipse cx="395" cy="200" rx="40" ry="70"/><ellipse cx="455" cy="250" rx="34" ry="22"/>
    </g>
    <g fill="none" stroke="#7d7d78" stroke-width="2" opacity=".7"><circle cx="470" cy="300" r="10"/><circle cx="520" cy="290" r="7"/><circle cx="430" cy="300" r="6"/></g>
    <circle cx="170" cy="190" r="150" fill="url(#fg)"/>
    <g fill="none" stroke="#77776f" stroke-width="2" opacity=".75"><circle cx="120" cy="140" r="22"/><circle cx="200" cy="120" r="14"/><circle cx="150" cy="230" r="30"/><circle cx="230" cy="200" r="10"/><circle cx="95" cy="210" r="9"/><circle cx="210" cy="270" r="12"/></g>
    <ellipse cx="185" cy="160" rx="24" ry="18" fill="#6a6b70" opacity=".6"/>
    ${pin("mare", 528, 178, "א")}${pin("high", 470, 268, "ב")}${pin("south", 490, 334, "ג")}${pin("far", 185, 160, "ד")}
  </svg>`;
}
function orbitDiagram(pos, letters) {
  // view from above Earth's north pole; the Sun is to the right; the Moon orbits counter-clockwise
  const P = { new: [300, 160], fq: [200, 60], full: [100, 160], lq: [200, 260] };
  const moon = (k, lbl) => { const [x, y] = P[k]; return `<g><circle cx="${x}" cy="${y}" r="17" fill="#2b3550" stroke="#8da0c2" stroke-width="1.5"/><path d="M${x} ${y - 17} A17 17 0 0 1 ${x} ${y + 17} Z" fill="#f5f1dc"/>${lbl ? `<text x="${x}" y="${y + (k === "lq" ? 42 : -26)}" class="pos-lbl" text-anchor="middle">${lbl}</text>` : ""}</g>`; };
  const moons = letters ? Object.keys(P).map((k) => moon(k, letters[k])).join("") : moon(pos);
  return `<svg class="orbit-svg" viewBox="0 0 470 320" role="img" aria-label="מיקום השמש, כדור הארץ והירח במבט מלמעלה">
    <defs><radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6c2"/><stop offset=".5" stop-color="#ffd24a"/><stop offset="1" stop-color="#ff9d1f" stop-opacity="0"/></radialGradient>
    <marker id="arw" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#ffd24a"/></marker>
    <marker id="arw2" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#8ec5ff"/></marker></defs>
    <circle cx="440" cy="160" r="60" fill="url(#sun)"/><text x="440" y="166" text-anchor="middle" class="sun-lbl">שמש</text>
    <g stroke="#ffd24a" stroke-width="2" opacity=".55" marker-end="url(#arw)"><line x1="385" y1="100" x2="345" y2="100"/><line x1="385" y1="160" x2="345" y2="160"/><line x1="385" y1="220" x2="345" y2="220"/></g>
    <circle cx="200" cy="160" r="100" fill="none" stroke="#8ec5ff" stroke-width="1.5" stroke-dasharray="5 6" opacity=".6"/>
    <path d="M286 106 A100 100 0 0 0 254 76" fill="none" stroke="#8ec5ff" stroke-width="3" marker-end="url(#arw2)"/>
    <circle cx="200" cy="160" r="28" fill="#1f4fa0"/><path d="M200 132 A28 28 0 0 1 200 188 Z" fill="#3f9be8"/><path d="M190 145 q8 -6 14 2 q6 10 -4 16 q-10 2 -10 -8z" fill="#3fae62" opacity=".9"/>
    <text x="200" y="210" text-anchor="middle" class="earth-lbl">כדור הארץ</text>
    ${moons}
    <text x="235" y="312" text-anchor="middle" class="note-lbl">מבט מלמעלה, מעל הקוטב הצפוני · החץ = כיוון התנועה</text>
  </svg>`;
}
function craterPic() {
  return `<svg class="crater-svg" viewBox="0 0 460 170" role="img" aria-label="שני מכתשים: א׳ רחב, ב׳ צר">
    <rect x="0" y="70" width="460" height="100" rx="16" fill="#8c8c86"/><rect x="0" y="70" width="460" height="18" fill="#a5a59e"/>
    <ellipse cx="300" cy="105" rx="120" ry="30" fill="#5c5c57" stroke="#c9c9c0" stroke-width="5"/><ellipse cx="300" cy="110" rx="100" ry="20" fill="#4a4a46"/>
    <ellipse cx="80" cy="105" rx="40" ry="11" fill="#5c5c57" stroke="#c9c9c0" stroke-width="4"/>
    <text x="300" y="50" text-anchor="middle" class="cr-lbl">מכתש א׳ · בערך 30 מ׳</text>
    <text x="80" y="50" text-anchor="middle" class="cr-lbl">ב׳ · בערך 10 מ׳</text>
  </svg>`;
}
const thermo = () => `<div class="thermo"><div class="t-day">☀️ יום<br><b>בערך 120°C+</b></div><div class="t-night">🌑 לילה<br><b>בערך 170°C−</b></div></div>`;

// ---------- content ----------
const SITES = {
  mare: { name: "ים השלווה", short: "מישור כהה וחלק בצד הקרוב", icon: "🟤" },
  high: { name: "הרמות הבהירות", short: "שטח הררי מלא מכתשים בצד הקרוב", icon: "⛰️" },
  south: { name: "הקוטב הדרומי", short: "שפת מכתש ליד הקוטב הדרומי", icon: "🧊" },
  far: { name: "הצד הרחוק", short: "אגן שקט בצד שלא רואים מכדור הארץ", icon: "🌑" },
};
const STAGES = [
  null,
  { emoji: "📍", title: "בוחרים אתר נחיתה", text: "איפה הכי כדאי לבנות את הבסיס?", text2: "בחרו על המפה. אחרי כל תשובה תקבלו הסבר." },
  { emoji: "🌗", title: "מופעי הירח", text: "איך הירח נראה מכדור הארץ, ולמה הוא משתנה?", text2: "הסתכלו טוב על השמש, כדור הארץ והירח." },
  { emoji: "☄️", title: "סערת מטאורים", text: "אבנים מהחלל פוגעות בירח. מה המכתשים מספרים לנו?", text2: "זכרו את ניסוי הקמח והאבנים." },
  { emoji: "🌡️", title: "יום ולילה בירח", text: "על הירח חם מאוד ביום וקר מאוד בלילה.", text2: "בחרו חשמל ובידוד שמתאימים למקום שבחרתם." },
  { emoji: "🏋️", title: "שישית מהמשקל", text: "בירח הכול קל פי 6 מבכדור הארץ.", text2: "חשבו את התשובה. מותר להשתמש בדף טיוטה." },
  { emoji: "⏳", title: "מסע בזמן", text: "מתי נוצר הירח? מתי הגיעו אליו בני אדם? ומתי ישראל?", text2: "סדרו את ההיסטוריה של הירח." },
  { emoji: "🏗️", title: "בונים את הבסיס", text: "על כל שלב שהצלחתם בו קיבלתם חלק לבסיס.", text2: "הציבו את החלקים על הקרקע ובנו את הבסיס שלכם." },
];

function factBox(items) { return `<div class="fact-in"><div class="fact-h">🛰️ ידעתם?</div><ul class="facts">${items.map(([e, t]) => `<li><span class="fe">${e}</span><span>${t}</span></li>`).join("")}</ul></div>`; }
function questions(stage) {
  if (stage === 1) return [
    { id: "site", type: "map", text: "בחרו מקום לבסיס. צריך: קשר עם כדור הארץ כל הזמן, נחיתה בטוחה, ועדיף גם מים. הקישו על אות במפה או על כרטיס.",
      opts: [
        { k: "mare", t: "א · ים השלווה: מישור חלק וכהה בצד הקרוב", s: 80, f: "בחירה טובה! השטח חלק ונוח לנחיתה. כדור הארץ תמיד נראה בשמיים, אז יש קשר כל הזמן. כאן נחתה אפולו 11. חסרון אחד: אין שם מים." },
        { k: "high", t: "ב · הרמות: הרים ומכתשים בצד הקרוב", s: 50, f: "יש קשר עם כדור הארץ, כי זה הצד הקרוב. אבל יש שם הרבה סלעים ומכתשים, והנחיתה מסוכנת." },
        { k: "south", t: "ג · הקוטב הדרומי: על שפה של מכתש", s: 100, f: "בחירה מצוינת! בתוך מכתשים חשוכים יש קרח של מים. על ההרים שמסביב יש שמש רוב הזמן. כדור הארץ נראה שם נמוך, ממש ליד האופק, אז מוסיפים לוויין שעוזר לקשר." },
        { k: "far", t: "ד · הצד הרחוק: אגן גדול ושקט", s: 0, f: "מהצד הרחוק לא רואים את כדור הארץ אף פעם. לכן אין שם קשר בלי לוויין מיוחד. והדרישה הראשונה הייתה קשר כל הזמן." },
      ] },
    { id: "sync", type: "choice", text: "צוות בבסיס בצד הקרוב שם לב: כדור הארץ תמיד נמצא באותו מקום בשמיים. למה?", visual: `<div class="pic-emoji">🌍🙂🌙</div>`,
      opts: [
        { t: "הירח מסתובב סביב עצמו פעם אחת, בזמן שהוא מקיף פעם אחת את כדור הארץ", s: 100 },
        { t: "הירח לא מסתובב סביב עצמו בכלל", s: 0, f: "אם הירח לא היה מסתובב, היינו רואים את כל הצדדים שלו במשך החודש." },
        { t: "כדור הארץ ענק, אז רואים אותו מכל מקום", s: 0, f: "מהצד הרחוק לא רואים את כדור הארץ בכלל, למרות שהוא גדול." },
      ],
      why: "זה כמו לרקוד סביב חבר ולהסתכל עליו כל הזמן: מסתובבים בדיוק פעם אחת בכל סיבוב. ככה הירח מראה לנו תמיד את אותו צד." },
    { id: "orbit", type: "choice", text: "כמה זמן לוקח לירח להקיף את כדור הארץ פעם אחת?",
      opts: [ { t: "בערך חודש", s: 100 }, { t: "יום אחד", s: 0, f: "ביום אחד כדור הארץ מסתובב סביב עצמו. הירח איטי הרבה יותר." }, { t: "שנה", s: 0, f: "בשנה כדור הארץ מקיף את השמש." }, { t: "שבוע", s: 0 } ],
      why: "הירח מקיף את כדור הארץ בערך ב-27 ימים. מכאן בא הרעיון של 'חודש'. בעברית 'ירח' הוא גם שם ישן לחודש!" },
    { id: "dark", type: "choice", text: "דני אומר: \"לא בונים בצד הרחוק, כי שם תמיד חושך.\" דני צודק?", visual: `<div class="pic-emoji">🤔 ${moonIcon("new", 56)}</div>`,
      opts: [
        { t: "לא. השמש מאירה גם את הצד הרחוק. הבעיה שם היא שאין קשר", s: 100 },
        { t: "כן. השמש אף פעם לא מאירה את הצד הרחוק", s: 0 },
        { t: "כן. הצד הרחוק מואר רק בליקוי ירח", s: 0 },
      ],
      why: "השמש מאירה כל צד של הירח בתורו. כשאנחנו רואים 'ירח חדש', הצד הרחוק דווקא מואר כולו! הוא רק מוסתר מאיתנו." },
    { id: "f1", type: "choice", fact: true, text: "שאלת בונוס: מי היה האדם הראשון שהלך על הירח?",
      visual: factBox([
        ["🇺🇸", "אפולו 11, 1969: ניל ארמסטרונג ובאז אולדרין נחתו בים השלווה. הם היו בני האדם הראשונים על הירח."],
        ["🇮🇱", "בראשית, 2019: החללית הישראלית הראשונה. היא הקיפה את הירח, והתרסקה בניסיון לנחות."],
        ["🧊", "תוכנית ארטמיס רוצה לבנות בסיס ליד הקוטב הדרומי, בגלל הקרח. ממים אפשר להכין מי שתייה, אוויר לנשימה ואפילו דלק."]]),
      opts: [ { t: "ניל ארמסטרונג", s: 100 }, { t: "יורי גגארין", s: 0, f: "גגארין היה האדם הראשון בחלל (1961), אבל הוא לא היה על הירח." }, { t: "אילן רמון", s: 0, f: "אילן רמון היה האסטרונאוט הישראלי הראשון. הוא טס בחלל, לא לירח." } ],
      why: "ארמסטרונג יצא ראשון, ואחריו באז אולדרין." },
  ];
  if (stage === 2) {
    const start = pick(["fq", "lq"], "phase-start");
    const NAMES = { new: "ירח חדש", fq: "רבע ראשון", full: "ירח מלא", lq: "רבע אחרון" };
    const phaseOpts = (correct, fbs) => ["new", "fq", "full", "lq"].map((k) => ({ k, t: NAMES[k], icon: moonIcon(k, 58), s: k === correct ? 100 : 0, f: fbs && fbs[k] }));
    const week = start === "fq" ? "full" : "new";
    return [
      { id: "light", type: "choice", text: "בלילה הירח נראה זוהר. מאיפה מגיע האור שלו?", visual: `<div class="pic-emoji">☀️ ➜ ${moonIcon("full", 56)} ➜ 👀</div>`,
        opts: [ { t: "הירח מחזיר את האור של השמש", s: 100 }, { t: "הירח מייצר אור בעצמו, כמו נורה", s: 0 }, { t: "יש על הירח הרי געש בוערים", s: 0 } ],
        why: "הירח לא מאיר בעצמו. הוא כמו מראה אפורה: השמש מאירה אותו, והאור חוזר אלינו." },
      { id: "ph1", type: "choice", grid: true, text: "זה המצב היום (מבט מלמעלה). איך ייראה הירח מישראל?", visual: orbitDiagram(start),
        opts: phaseOpts(start, start === "fq" ? { lq: "כמעט! זה חצי ירח, אבל הצד המואר הפוך. מישראל, ברבע ראשון הצד הימני מואר." } : { fq: "כמעט! זה חצי ירח, אבל הצד המואר הפוך. מישראל, ברבע אחרון הצד השמאלי מואר." }),
        why: "השמש מאירה תמיד חצי מהירח. מהמקום הזה אנחנו רואים רק חצי מהחצי המואר, אז נראה חצי ירח." },
      { id: "ph2", type: "choice", grid: true, text: "המשימה יוצאת לעבודה בעוד שבוע. איזה ירח יראו אז מכדור הארץ?", visual: orbitDiagram(start),
        opts: phaseOpts(week),
        why: `כל המופעים חוזרים בערך כל 29.5 ימים. בשבוע הירח עובר בערך רבע סיבוב. אחרי ${NAMES[start]} מגיע ${NAMES[week]}.` },
      { id: "ph3", type: "choice", text: "בכדור הארץ רואים היום \"ירח חדש\". מה קורה עכשיו בבסיס בצד הקרוב?",
        opts: [
          { t: "לילה בבסיס, ובשמיים נראה כדור הארץ מואר כולו", s: 100 },
          { t: "צהריים, והשמש למעלה בשמיים", s: 0, f: "בירח חדש השמש מאירה את הצד הרחוק, לא את הצד שלנו." },
          { t: "אי אפשר לדעת", s: 0 },
        ],
        why: "בירח חדש הירח נמצא בין כדור הארץ לשמש. הצד הקרוב פונה הרחק מהשמש, אז אצלו לילה. כדור הארץ מואר, ומהבסיס הוא נראה עגול ומאיר." },
      { id: "ph4", type: "choice", text: "באיזה מקום יכול לקרות ליקוי ירח?", visual: orbitDiagram(null, { new: "א", fq: "ב", full: "ג", lq: "ד" }),
        opts: [
          { t: "ג: הירח מאחורי כדור הארץ (ירח מלא)", s: 100 },
          { t: "א: הירח בין כדור הארץ לשמש (ירח חדש)", s: 0, f: "כאן יכול לקרות ליקוי חמה: הירח מסתיר לנו את השמש." },
          { t: "ב: רבע ראשון", s: 0 }, { t: "ד: רבע אחרון", s: 0 },
        ],
        why: "בליקוי ירח הירח נכנס לצל של כדור הארץ. זה קורה רק כשכדור הארץ באמצע, בין השמש לירח." },
      { id: "f2", type: "choice", fact: true, text: "שאלת בונוס: איך נראה הירח בזמן ליקוי ירח מלא?",
        visual: factBox([
          ["🔒", "פעם הירח הסתובב מהר יותר. כדור הארץ האט אותו לאט לאט, עד שנשאר מולנו תמיד אותו צד."],
          ["🌊", "הירח מושך את המים באוקיינוסים. כך נוצרים הגאות והשפל."],
          ["🔴", "בליקוי ירח מלא הירח לא נעלם. האוויר של כדור הארץ מעביר אליו קצת אור אדום, כמו בשקיעה."]]),
        opts: [ { t: "אדמדם", s: 100 }, { t: "נעלם לגמרי", s: 0 }, { t: "ירוק", s: 0 } ],
        why: "זה אותו אור אדום שרואים בשקיעה. לכן קוראים לפעמים לליקוי כזה 'ירח דם'." },
    ];
  }
  if (stage === 3) return [
    { id: "cr1", type: "choice", text: "שני מטאוריטים פגעו ליד הבסיס, באותה מהירות. מכתש א׳ רחב פי 3 ממכתש ב׳. מה למדנו?", visual: craterPic(),
      opts: [
        { t: "המטאוריט של א׳ היה גדול וכבד יותר", s: 100 },
        { t: "המטאוריט של ב׳ היה גדול יותר", s: 0 },
        { t: "אי אפשר לדעת כלום ממכתש", s: 0, f: "דווקא אפשר! גודל המכתש מספר כמה חזקה הייתה הפגיעה." },
      ],
      why: "כמו בניסוי הקמח: אבן גדולה יותר עשתה בור גדול יותר." },
    { id: "cr2", type: "choice", text: "בניסוי הקמח מפילים שתי אבנים זהות. אחת מגובה 20 ס״מ, ואחת מגובה מטר. של מי המכתש יהיה גדול יותר?", visual: `<div class="pic-emoji">🪨⬇️ 🥣</div>`,
      opts: [
        { t: "של האבן מגובה מטר, כי היא נופלת מהר יותר", s: 100 },
        { t: "של האבן מגובה 20 ס״מ", s: 0 },
        { t: "אותו גודל, כי האבנים זהות", s: 0, f: "גם המהירות חשובה, לא רק הגודל." },
      ],
      why: "מהירות גבוהה = פגיעה חזקה = מכתש גדול. מטאוריטים פוגעים בירח מהר מאוד, עשרות אלפי קמ״ש!" },
    { id: "cr3", type: "choice", text: "על הירח יש מכתשים מלפני מיליארדי שנים. על כדור הארץ כמעט לא רואים מכתשים. למה?",
      opts: [
        { t: "לירח אין אוויר, רוח וגשם, אז שום דבר לא מוחק את המכתשים", s: 100 },
        { t: "מטאוריטים לא פוגעים בכדור הארץ", s: 0, f: "הם פוגעים גם בנו. ההבדל הוא מה קורה אחרי." },
        { t: "כל המכתשים על הירח חדשים", s: 0 },
      ],
      why: "אצלנו האוויר שורף את רוב האבנים הקטנות, ורוח, מים וגשם מוחקים מכתשים. על הירח אין כלום מזה." },
    { id: "burn", type: "choice", text: "בלילה בכדור הארץ רואים לפעמים 'כוכב נופל'. האם בבסיס על הירח יראו כוכבים נופלים?", visual: `<div class="pic-emoji">🌠❓</div>`,
      opts: [
        { t: "לא. כוכב נופל הוא אבן שנשרפת באוויר, ולירח אין אוויר", s: 100 },
        { t: "כן, המון", s: 0, f: "אבנים פוגעות בירח, אבל בלי אוויר הן לא נשרפות ולא זוהרות בדרך." },
        { t: "רק ביום", s: 0 },
      ],
      why: "'כוכב נופל' הוא בכלל לא כוכב. זו אבן קטנה שנשרפת באוויר של כדור הארץ. על הירח היא פשוט פוגעת בקרקע." },
    { id: "shield", type: "choice", text: "איזה מגן תבנו לבסיס?",
      opts: [
        { k: "regolith", t: "שכבה עבה של אדמת ירח, בערך מטר, מעל הבסיס", s: 100, f: "חכם! האדמה כבר נמצאת שם, והיא עוצרת אבנים קטנות וגם קרינה מהשמש." },
        { k: "thin", t: "קיר דק של אלומיניום", s: 20, f: "אבנים זעירות פוגעות בירח כל הזמן. קיר דק יתחורר עם הזמן." },
        { k: "concrete", t: "קיר בטון ענק שמביאים מכדור הארץ", s: 30, f: "מגן חזק, אבל לשלוח כל קילו לירח עולה המון כסף. עדיף להשתמש במה שיש שם." },
        { k: "none", t: "לא צריך מגן, האבנים נשרפות בדרך", s: 0, f: "זה קורה רק בכדור הארץ, בזכות האוויר. לירח אין אוויר." },
      ] },
    { id: "form", type: "choice", text: "אסטרונאוטים הביאו סלעים מהירח. הסלעים דומים מאוד לסלעים של כדור הארץ. מה זה רומז על איך נוצר הירח?", visual: `<div class="pic-emoji">🌍💥🪐 ➜ 🌙</div>`,
      opts: [
        { t: "גוף גדול התנגש בכדור הארץ, וחתיכות שעפו יצרו את הירח", s: 100 },
        { t: "הירח הגיע ממקום רחוק ונתפס", s: 0, f: "אז היינו מצפים שהסלעים שלו יהיו שונים מאוד משלנו." },
        { t: "הירח עשוי מגבינה", s: 0, f: "😄 זו רק אגדה." },
      ],
      why: "לפני בערך 4.5 מיליארד שנה גוף בגודל של מאדים התנגש בכדור הארץ הצעיר. החומר שעף לחלל התחבר והפך לירח." },
    { id: "f3", type: "choice", fact: true, text: "שאלת בונוס: למה העקבות של אסטרונאוטי אפולו עדיין נמצאים על הירח?",
      visual: factBox([
        ["👣", "על הירח אין רוח ואין גשם. לכן העקבות של האסטרונאוטים עדיין שם."],
        ["🕳️", "אחד המכתשים הגדולים במערכת השמש נמצא ליד הקוטב הדרומי של הירח. הרוחב שלו בערך 2,500 ק״מ!"],
        ["🔭", "את המכתשים הגדולים אפשר לראות גם מכדור הארץ, עם משקפת או טלסקופ קטן."]]),
      opts: [ { t: "אין שם רוח וגשם שימחקו אותם", s: 100 }, { t: "שומרים עליהם", s: 0 }, { t: "צבעו אותם", s: 0 } ],
      why: "בלי מזג אוויר, כמעט שום דבר לא משתנה על הקרקע של הירח." },
  ];
  if (stage === 4) {
    const pole = S.ans.site && S.ans.site.k === "south";
    const where = S.ans.site ? SITES[S.ans.site.k].name : "האתר שבחרתם";
    const energy = pole ? [
      { k: "solarbat", t: "פאנלים סולאריים + סוללות", s: 100, f: "מצוין! ליד הקוטב יש הרים שהשמש מאירה כמעט כל הזמן. הסוללות עוזרות כשיש קצת צל." },
      { k: "nuclear", t: "כור גרעיני קטן", s: 80, f: "יעבוד גם בחושך. אבל באתר שלכם יש שמש כמעט כל הזמן, ושמש פשוטה יותר." },
      { k: "solar", t: "פאנלים סולאריים בלבד", s: 50, f: "כמעט! גם בקוטב יש זמנים של צל, ובלי סוללות החשמל ייגמר." },
      { k: "wind", t: "טורבינות רוח", s: 0, f: "לירח אין אוויר, אז אין רוח בכלל." },
    ] : [
      { k: "nuclear", t: "כור גרעיני קטן", s: 100, f: "מצוין! כור קטן נותן חשמל גם בלילה הארוך. נאס״א מפתחת כורים כאלה בשביל הירח." },
      { k: "solarbat", t: "פאנלים סולאריים + סוללות", s: 70, f: "אפשרי, אבל צריך סוללות לשבועיים של חושך. זה המון סוללות!" },
      { k: "solar", t: "פאנלים סולאריים בלבד", s: 0, f: "בלילה של שבועיים אין שמש, והבסיס יישאר בלי חשמל." },
      { k: "wind", t: "טורבינות רוח", s: 0, f: "לירח אין אוויר, אז אין רוח בכלל." },
    ];
    return [
      { id: "hot", type: "choice", text: "על הירח ביום חם מאוד, בערך 120 מעלות. בלילה קר מאוד, בערך מינוס 170. למה ההבדל כל כך גדול?", visual: thermo(),
        opts: [
          { t: "לירח אין אוויר (אטמוספירה) ששומר על החום", s: 100 },
          { t: "הירח קרוב יותר לשמש", s: 0, f: "הירח וכדור הארץ נמצאים בערך באותו מרחק מהשמש." },
          { t: "הקרקע של הירח עשויה ממתכת", s: 0 },
        ],
        why: "האוויר של כדור הארץ הוא כמו שמיכה: ביום הוא מגן מהשמש, ובלילה הוא שומר חום. לירח אין שמיכה כזאת." },
      { id: "day", type: "choice", text: "כמה זמן נמשך היום (האור) בבסיס באמצע הירח?", visual: `<div class="pic-emoji">☀️⏳🌑</div>`,
        opts: [
          { t: "בערך שבועיים, ואחריו לילה של בערך שבועיים", s: 100 },
          { t: "12 שעות, כמו אצלנו", s: 0 }, { t: "שעה אחת", s: 0 }, { t: "חצי שנה", s: 0 },
        ],
        why: "הירח מסתובב לאט מאוד. מזריחה לזריחה עובר בערך חודש: בערך שבועיים אור ושבועיים חושך." },
      { id: "energy", type: "choice", text: `הבסיס שלכם נמצא ב${where}. מאיפה תקבלו חשמל?`, visual: `<div class="pic-emoji">🔋⚡</div>`, opts: energy },
      { id: "ins", type: "choice", text: "איך תגנו על הבסיס מהחום ביום ומהקור בלילה?",
        opts: [
          { k: "good", t: "בידוד עבה, אדמת ירח מעל, וצבע לבן ומבריק מבחוץ", s: 100 },
          { k: "black", t: "צבע שחור מבחוץ, כדי לספוג חום", s: 10, f: "ביום הצבע השחור יחמם את הבסיס מאוד, ובלילה הוא לא יעזור." },
          { k: "window", t: "חלונות גדולים שנפתחים לאוורור", s: 0, f: "בחוץ אין אוויר! אם פותחים חלון, כל האוויר בורח מהבסיס." },
          { k: "metal", t: "קירות דקים של מתכת", s: 0, f: "מתכת מעבירה חום מהר. החום והקור ייכנסו פנימה." },
        ],
        why: "צבע לבן מחזיר את אור השמש. בידוד עבה ואדמה מעליו שומרים על טמפרטורה נעימה בפנים." },
      { id: "water", type: "choice", text: "מצאתם קרח של מים. מה אפשר להכין ממנו בבסיס?", visual: `<div class="pic-emoji">🧊 ➜ 💧🫁🚀</div>`,
        opts: [
          { t: "מי שתייה, חמצן לנשימה ודלק לטילים", s: 100 },
          { t: "רק מי שתייה", s: 30, f: "נכון, אבל לא רק! מים בנויים ממימן וחמצן, ואפשר להפריד אותם." },
          { t: "שום דבר, קרח בחלל לא שימושי", s: 0 },
        ],
        why: "מים בנויים ממימן ומחמצן. את החמצן נושמים, ומימן וחמצן ביחד הם דלק לטילים." },
      { id: "f4", type: "choice", fact: true, text: "שאלת בונוס: איפה המקומות הקרים ביותר על הירח?",
        visual: factBox([
          ["🌅", "משימות אפולו נחתו בבוקר של יום הירח. השמש הייתה נמוכה, הצללים עזרו לראות סלעים, ועוד לא היה חם מדי."],
          ["🌑", "לילה על הירח נמשך בערך שבועיים. ציוד בלי חימום פשוט קופא."],
          ["🧊", "יש מכתשים ליד הקטבים שהשמש אף פעם לא מגיעה לתחתית שלהם. שם קר יותר ממינוס 200 מעלות, והקרח נשמר."]]),
        opts: [ { t: "בתחתית מכתשים ליד הקטבים", s: 100 }, { t: "באמצע הצד הרחוק", s: 0, f: "גם הצד הרחוק מקבל שמש." }, { t: "על ההרים הגבוהים", s: 0 } ],
        why: "לשם השמש לא מגיעה אף פעם. בדיוק בגלל זה ארטמיס רוצה לנחות שם." },
    ];
  }
  if (stage === 5) {
    const m = pick([36, 42, 48, 54, 60, 66], "m"), c = pick([5, 10], "c"), h = pick([10, 20, 30], "h"), r = pick([3, 4, 5], "r");
    const numOpts = (right, wrongs) => [{ t: `${right}`, s: 100 }, ...wrongs.map(([v, f]) => ({ t: `${v}`, s: 0, f }))];
    return [
      { id: "w", type: "num", unit: "ק״ג", ans: m / 6, tol: 0, wrongs: [[m * 6, "הכפלתם ב-6 במקום לחלק. בירח המאזניים מראים פחות!"]],
        text: `נועה שוקלת עם החליפה ${m} ק״ג. בירח המשקל קטן פי 6. מה יראו המאזניים בירח? (<bdi dir="ltr">${m} ÷ 6</bdi>)`,
        visual: `<div class="pic-emoji">👩‍🚀⚖️</div>`,
        why: `<bdi dir="ltr">${m} ÷ 6 = ${m / 6}</bdi>. בירח המאזניים מראים שישית מהמשקל.` },
      { id: "mass", type: "choice", text: "האם נועה עצמה נהייתה קטנה יותר בירח?",
        opts: [
          { t: "לא. היא אותה נועה, רק שהירח מושך אותה חלש יותר", s: 100 },
          { t: "כן, היא התכווצה", s: 0 },
          { t: "כן, היא איבדה חצי מהגוף", s: 0 },
        ],
        why: "כמות החומר בגוף (המסה) לא משתנה. רק כוח המשיכה משתנה. לכן גם בירח קשה לעצור עגלה כבדה שנוסעת!" },
      { id: "carry", type: "choice", grid: true, text: `על כדור הארץ נועה סוחבת תיק של ${c} ק״ג. בירח הכול קל פי 6. כמה ק״ג של ציוד היא תוכל לסחוב באותו מאמץ?`, visual: `<div class="pic-emoji">🎒×6</div>`,
        opts: numOpts(c * 6, [[c, "בירח הציוד קל יותר, אז אפשר לסחוב יותר."], [c + 6, "לא מוסיפים 6, כופלים ב-6."], [Math.max(1, Math.round(c / 6)), "חילקתם ב-6. בירח אפשר לסחוב יותר, לא פחות."]]).map((o) => ({ ...o, t: o.t + " ק״ג" })),
        why: `<bdi dir="ltr">${c} × 6 = ${c * 6}</bdi> ק״ג.` },
      { id: "jump", type: "choice", grid: true, text: `על כדור הארץ נועה קופצת לגובה ${h} ס״מ. בירח היא תקפוץ גבוה פי 6. לאיזה גובה?`, visual: `<div class="pic-emoji">🦘🌙</div>`,
        opts: numOpts(h * 6, [[h + 6, "לא מוסיפים 6, כופלים ב-6."], [h, "בירח קופצים גבוה יותר!"], [h * 60, "זה פי 60, גבוה מדי."]]).map((o) => ({ ...o, t: o.t + " ס״מ" })),
        why: `<bdi dir="ltr">${h} × 6 = ${h * 6}</bdi> ס״מ! באמת, החליפה הכבדה מפריעה, ולכן האסטרונאוטים קיפצו כמו קנגורו.` },
      { id: "rock", type: "num", unit: "ק״ג", ans: r * 6, tol: 0, wrongs: [[r, "זה מה שהסלע שוקל בירח. בכדור הארץ הוא כבד פי 6."]],
        text: `נועה מרימה סלע. בירח המאזניים מראים ${r} ק״ג. כמה הסלע ישקול כשיגיע לכדור הארץ? (<bdi dir="ltr">${r} × 6</bdi>)`, visual: `<div class="pic-emoji">🪨⚖️🌍</div>`,
        why: `<bdi dir="ltr">${r} × 6 = ${r * 6}</bdi>. בכדור הארץ הכול כבד פי 6 מבירח.` },
      { id: "drop", type: "choice", text: "באפולו 15 (1971) האסטרונאוט דייוויד סקוט הפיל על הירח פטיש ונוצה באותו רגע. מה קרה?", visual: `<div class="pic-emoji">🔨🪶</div>`,
        opts: [
          { t: "שניהם נחתו על הקרקע יחד", s: 100 },
          { t: "הפטיש נחת ראשון", s: 0, f: "בכדור הארץ זה מה שקורה, כי האוויר מאט את הנוצה." },
          { t: "הנוצה ריחפה ולא נפלה", s: 0, f: "גם בירח יש כוח משיכה, רק חלש יותר." },
        ],
        why: "על הירח אין אוויר שמאט את הנוצה, אז הכול נופל באותה מהירות. גלילאו חשב על זה כבר לפני כ-400 שנה!" },
      { id: "f5", type: "choice", fact: true, text: "שאלת בונוס: למה הירח מושך חלש יותר מכדור הארץ?",
        visual: factBox([
          ["⚖️", "הירח קטן וקל בהרבה מכדור הארץ. בערך 81 ירחים 'שוקלים' כמו כדור ארץ אחד."],
          ["🦘", "האסטרונאוטים גילו שהכי נוח להתקדם בירח בקפיצות קטנות."],
          ["🎥", "את הפטיש והנוצה של אפולו 15 צילמו, ואפשר לראות את הסרטון עד היום."]]),
        opts: [ { t: "כי הוא הרבה יותר קטן וקל", s: 100 }, { t: "כי אין בו אוויר", s: 0, f: "אוויר לא קשור לכוח המשיכה." }, { t: "כי הוא רחוק מהשמש", s: 0 } ],
        why: "ככל שגוף כבד יותר, הוא מושך חזק יותר. הירח קל, אז הוא מושך חלש." },
    ];
  }
  if (stage === 6) return [
    { id: "time", type: "order", text: "סדרו את האירועים מהראשון לאחרון. הקישו עליהם לפי הסדר.",
      items: [
        { k: "impact", t: "💥 התנגשות ענקית יוצרת את הירח", y: "לפני 4.5 מיליארד שנה" },
        { k: "a11", t: "👨‍🚀 אפולו 11: האדם הראשון על הירח", y: "1969" },
        { k: "a15", t: "🔨🪶 אפולו 15: הפטיש והנוצה", y: "1971" },
        { k: "beresheet", t: "🇮🇱 בראשית: החללית הישראלית", y: "2019" },
        { k: "artemis", t: "🚀 ארטמיס: חוזרים לירח, לקוטב הדרומי", y: "העתיד הקרוב" },
      ],
      why: "קודם נוצר הירח, מיליארדי שנים לפני שהיו בני אדם. אחר כך אפולו 11 (1969), אפולו 15 (1971), בראשית (2019), ועכשיו ארטמיס." },
    { id: "years", type: "choice", grid: true, text: "אפולו 11 נחתה ב-1969. בראשית הגיעה לירח ב-2019. כמה שנים עברו ביניהן?", visual: `<div class="pic-emoji">1969 ➜ 2019</div>`,
      opts: [ { t: "50 שנה", s: 100 }, { t: "40 שנה", s: 0 }, { t: "60 שנה", s: 0 }, { t: "500 שנה", s: 0 } ],
      why: '<bdi dir="ltr">2019 − 1969 = 50</bdi>. חצי מאה!' },
    { id: "ber", type: "choice", text: "מה קרה לחללית בראשית?", visual: `<div class="pic-emoji">🇮🇱🛰️🌙</div>`,
      opts: [
        { t: "היא נכנסה למסלול סביב הירח, ובניסיון לנחות היא התרסקה", s: 100 },
        { t: "היא נחתה ובנתה בסיס", s: 0 },
        { t: "היא לא יצאה מכדור הארץ", s: 0, f: "היא דווקא הגיעה עד הירח והקיפה אותו!" },
      ],
      why: "בראשית הייתה חללית קטנה שבנו בישראל. היא הקיפה את הירח, וכך ישראל הייתה למדינה השביעית שהקיפה את הירח. בנחיתה היא התרסקה, אבל הניסיון לימד המון." },
    { id: "f6", type: "choice", fact: true, text: "שאלת בונוס: למה ארטמיס רוצה לנחות דווקא ליד הקוטב הדרומי?",
      visual: factBox([
        ["👩‍🚀", "בתוכנית ארטמיס נאס״א רוצה להחזיר בני אדם לירח, והפעם גם את האישה הראשונה."],
        ["🏕️", "המטרה היא לא רק לבקר, אלא להישאר: לבנות בסיס, כמו זה שאתם מתכננים."],
        ["🔴", "הירח הוא גם תרגול לפני מסע ארוך הרבה יותר: אל מאדים."]]),
      opts: [ { t: "כי יש שם קרח של מים", s: 100 }, { t: "כי שם הכי חם", s: 0 }, { t: "כי משם לא רואים את כדור הארץ", s: 0 } ],
      why: "מים הם הדבר הכי חשוב לבסיס: שתייה, אוויר לנשימה ודלק." },
  ];
  return [];
}
const STAGE_NAMES = ["", "אתר נחיתה", "מופעי הירח", "סערת מטאורים", "יום ולילה", "שישית מהמשקל", "מסע בזמן", "בונים את הבסיס"];

// ---------- join ----------
const params = new URLSearchParams(location.search);
const urlCode = (params.get("code") || "").replace(/\D/g, "").slice(0, 4);
if (urlCode) $("#code").value = urlCode;
$("#code").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); });

$("#joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#code").value.trim(), name = $("#name").value.trim();
  const err = $("#joinErr");
  if (!/^\d{4}$/.test(code)) { err.textContent = "קוד הכיתה הוא 4 ספרות"; return; }
  if (!name) { err.textContent = "כתבו את השם הפרטי"; return; }
  err.textContent = ""; $("#joinBtn").disabled = true;
  try {
    const j = await post("/api/join", { code, name });
    fresh(code, j.id, j.tok, j.name);
    status = j.status;
    enterGame();
  } catch (ex) { err.textContent = ex.message; }
  finally { $("#joinBtn").disabled = false; }
});

function enterGame() {
  $("#ptsChip").hidden = false; $("#whoName").textContent = S.name; $("#ptsVal").textContent = S.pts || 0;
  $("#waitName").textContent = S.name;
  dirty = true;
  route();
  startPolling();
}
function route() {
  if (status === "ended" && !ended) { ended = true; showEnd(true); return; }
  if (S.done) { showEnd(false); return; }
  if (status !== "playing") { show("scr-wait"); return; }
  if (!S.stage) { S.stage = 1; S.qi = 0; S.phase = "intro"; S.t0 = Date.now(); save(); }
  if (S.phase === "intro") intro(S.stage);
  else if (S.phase === "q" || S.phase === "fb") showQ();
  else if (S.phase === "fact") showStageDone(S.stage);
  else if (S.phase === "build") showBuild();
  else intro(S.stage);
}

// ---------- reporting ----------
function summary() {
  const acc = [];
  for (let s = 1; s <= NSTAGES; s++) {
    const qs = questions(s); let c = 0, t = 0;
    qs.forEach((q) => { const a = S.ans[q.id]; if (a) { t++; if (a.ok) c++; } });
    acc.push([c, t]);
  }
  const k = (id) => (S.ans[id] && S.ans[id].k) || null;
  return { site: k("site"), en: k("energy"), sh: k("shield"), ins: k("ins"), acc, sec: S.sec, nb: S.base ? Object.keys(S.base).length : 0 };
}
function stageProg() { if (S.stage >= 7) return S.base ? Math.min(90, Object.keys(S.base).length * 15) : 0; const qs = questions(S.stage); if (!qs.length) return 0; return Math.round((S.qi / qs.length) * 100); }
// Apps Script-friendly rhythm: lobby every ~4 s; during play only when something changed (after a short
// pause that batches clicks), plus a slow heartbeat so the tablet hears when the teacher ends the game.
let lastSent = 0, dirtySince = 0, backoffUntil = 0;
function startPolling() {
  if (pollTimer) return;
  const tick = async () => {
    const now = Date.now();
    if (dirty && !dirtySince) dirtySince = now;
    if (now < backoffUntil) { pollTimer = setTimeout(tick, 500); return; }
    // a new answer (or finishing) leaves after a short pause; a progress-only change waits longer and rides along
    const wait = (S.out && S.out.length) || S.done ? API.SEND_DELAY_MS : API.SOFT_DELAY_MS;
    const due = status === "lobby" ? (dirty || now - lastSent >= API.POLL_LOBBY_MS)
      : status === "ended" ? (dirty && now - dirtySince >= API.SEND_DELAY_MS)
      : (dirty && now - dirtySince >= wait) || now - lastSent >= API.HEARTBEAT_MS;
    if (!due) { pollTimer = setTimeout(tick, 500); return; }
    lastSent = now;
    let sent = [];
    try {
      const body = { code: S.code, id: S.id, tok: S.tok };
      if (dirty) body.st = { stage: S.done ? 8 : S.stage, prog: S.done ? 100 : stageProg(), pts: S.pts, done: S.done, d: summary() };
      if (S.out && S.out.length) { sent = S.out.slice(0, 20); body.ans = sent; }
      dirty = false; dirtySince = 0;
      const j = await post("/api/report", body);
      if (sent.length) { const ids = new Set(sent.map((x) => x.id)); S.out = (S.out || []).filter((x) => !ids.has(x.id)); save(); if (S.out.length) dirty = true; }
      const prev = status; status = j.status;
      if (prev !== status) {
        if (status === "playing" && $("#scr-wait").hidden === false) route();
        if (status === "ended") route();
      }
    } catch (ex) {
      dirty = true; backoffUntil = Date.now() + 2500 + Math.random() * 2500;
      if (ex.status === 404) {
        localStorage.removeItem(KEY); clearTimeout(pollTimer); pollTimer = null;
        $("#ptsChip").hidden = true; $("#steps").hidden = true; show("scr-join"); $("#joinErr").textContent = "יצאתם מהמשחק. אפשר להצטרף שוב."; return;
      }
    }
    pollTimer = setTimeout(tick, 400 + Math.random() * 300);
  };
  pollTimer = setTimeout(tick, 50);
}

// ---------- step dots ----------
const STEP_ICONS = ["", "📍", "🌗", "☄️", "🌡️", "🏋️", "📜", "🏗️", "📋"];
function drawSteps() {
  const box = $("#steps"); box.hidden = false;
  const cur = S.done ? 8 : S.stage;
  box.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<span class="${n < cur ? "done" : n === cur ? "now" : ""}">${STEP_ICONS[n]}</span>`).join("");
}

// ---------- flow ----------
function intro(n) {
  S.phase = "intro"; S.stage = n; S.qi = 0; save(); dirty = true; drawSteps();
  const d = STAGES[n];
  $("#introTag").textContent = `שלב ${n} מתוך 7`; $("#introEmoji").textContent = d.emoji;
  $("#introTitle").textContent = d.title; $("#introText").textContent = d.text; $("#introText2").textContent = d.text2;
  show("scr-intro");
  $("#introGo").onclick = () => { S.qStart = Date.now(); if (n === 7) { S.phase = "build"; save(); showBuild(); } else { S.phase = "q"; save(); showQ(); } };
}

function showQ() {
  const qs = questions(S.stage), q = qs[S.qi];
  if (!q) { S.phase = "fact"; save(); showStageDone(S.stage); return; }
  drawSteps();
  show("scr-q");
  $("#qTitle").textContent = q.fact ? `שלב ${S.stage}: ידעתם?` : `שלב ${S.stage}: ${STAGE_NAMES[S.stage]}`;
  $("#qMeta").textContent = `${S.qi + 1}/${qs.length}`;
  $("#qText").innerHTML = q.text; // authored content only
  $("#qText").classList.toggle("bonus", !!q.fact);
  const vis = $("#qVisual");
  vis.innerHTML = q.type === "map" ? landingMap(S.ans[q.id] && S.ans[q.id].k) : (q.visual || "");
  vis.hidden = !vis.innerHTML;
  // fact card first, then the question
  if (q.fact) vis.after($("#qText")); else vis.before($("#qText"));
  const optsBox = $("#qOpts"); optsBox.innerHTML = ""; optsBox.className = "opts" + (q.grid ? " grid4" : "");
  $("#qFb").hidden = true; $("#qNext").hidden = true; $("#qNum").hidden = q.type !== "num";
  const answered = S.ans[q.id];
  if (!answered && !S.qStart) { S.qStart = Date.now(); save(); }
  if (q.type === "num") {
    optsBox.hidden = true;
    $("#numUnit").textContent = q.unit; const inp = $("#numIn"); inp.value = answered ? answered.v : ""; inp.disabled = !!answered; $("#numGo").disabled = !!answered;
    inp.classList.remove("ok", "bad");
    $("#qNum").onsubmit = (e) => { e.preventDefault(); const v = parseFloat(String(inp.value).replace(",", ".")); if (!Number.isFinite(v)) { inp.classList.add("shake"); setTimeout(() => inp.classList.remove("shake"), 450); return; } answerNum(q, v); };
  } else if (q.type === "order") {
    optsBox.hidden = false; renderOrder(q, answered);
  } else {
    optsBox.hidden = false;
    const order = q.type === "map" ? q.opts : shuffled(q.opts, q.id);
    order.forEach((o) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "opt"; b.dataset.k = o.k || o.t;
      b.innerHTML = (o.icon || "") + `<span>${o.t}</span>`;
      b.onclick = () => { if (!S.ans[q.id]) answerChoice(q, o); };
      optsBox.appendChild(b);
    });
    if (q.type === "map") vis.querySelectorAll(".pin").forEach((p) => {
      const go = () => { if (!S.ans[q.id]) answerChoice(q, q.opts.find((o) => o.k === p.dataset.k)); };
      p.addEventListener("click", go); p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }
  if (answered) renderFeedback(q, answered);
}
let orderPick = [];
function renderOrder(q, answered) {
  const box = $("#qOpts"); box.className = "opts order";
  if (!answered) orderPick = [];
  const items = shuffled(q.items, q.id);
  const draw = () => {
    box.innerHTML = "";
    items.forEach((it) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "opt ord"; b.dataset.k = it.k;
      const pos = answered ? answered.seq.indexOf(it.k) : orderPick.indexOf(it.k);
      b.innerHTML = `<span class="ord-n">${pos >= 0 ? pos + 1 : ""}</span><span>${it.t}</span>`;
      if (pos >= 0) b.classList.add("picked");
      if (answered) {
        b.disabled = true; const right = q.items.findIndex((x) => x.k === it.k);
        b.classList.add(pos === right ? "ok" : "bad");
        b.innerHTML += `<small class="ord-y">${right + 1}. ${it.y}</small>`;
      } else b.onclick = () => {
        const i = orderPick.indexOf(it.k);
        if (i >= 0) orderPick.splice(i); else orderPick.push(it.k);
        draw();
        if (orderPick.length === q.items.length) answerOrder(q, orderPick.slice());
      };
      box.appendChild(b);
    });
    if (!answered) { const h = document.createElement("p"); h.className = "ord-hint"; h.textContent = orderPick.length ? "טעיתם? הקישו על אירוע שכבר בחרתם כדי לחזור ממנו." : "הקישו קודם על האירוע הכי מוקדם."; box.appendChild(h); }
  };
  draw();
}
function answerOrder(q, seq) {
  let right = 0; seq.forEach((k, i) => { if (q.items[i].k === k) right++; });
  const s = Math.round((right / q.items.length) * 100), ok = right === q.items.length, bonus = bonusFor(ok);
  const a = { seq, s, ok, bonus, f: ok ? null : `${right} מתוך ${q.items.length} במקום הנכון.` };
  S.ans[q.id] = a; S.phase = "fb"; logAnswer(q, a); setPts(S.pts + s + bonus);
  renderOrder(q, a); renderFeedback(q, a); fly(a);
}
function bonusFor(ok) {
  if (!ok) return 0;
  const sec = (Date.now() - (S.qStart || Date.now())) / 1000;
  return Math.round(10 * Math.min(1, Math.max(0, 1 - (sec - 15) / 60))); // mild: up to +10, fades out after about a minute
}
function answerChoice(q, o) {
  const ok = o.s >= 70, bonus = bonusFor(ok);
  const a = { k: o.k || null, t: o.t, s: o.s, ok, bonus };
  S.ans[q.id] = a; S.phase = "fb"; logAnswer(q, a); setPts(S.pts + o.s + bonus);
  renderFeedback(q, a); fly(a);
}
function answerNum(q, v) {
  const err = Math.abs(v - q.ans), ok = err <= q.tol + 1e-9;
  const close = !ok && err <= Math.max(1, Math.abs(q.ans) * 0.15);
  const s = ok ? 100 : close ? 50 : 0, bonus = bonusFor(ok);
  let f = null;
  if (!ok) for (const [wv, msg] of q.wrongs || []) if (Math.abs(v - wv) < 0.01) f = msg;
  if (!ok && !f) f = close ? "קרוב! בדקו שוב את החישוב." : "לא בדיוק. נסו לחשב שוב בראש.";
  const a = { v, s, ok, bonus, f };
  S.ans[q.id] = a; S.phase = "fb"; logAnswer(q, a); setPts(S.pts + s + bonus);
  renderFeedback(q, a); fly(a);
}
function fly(a) {
  if (a.s + a.bonus <= 0) return;
  const n = document.createElement("div"); n.className = "fly-pts " + (a.ok ? "good" : a.s ? "mid" : "bad");
  n.textContent = a.s + a.bonus > 0 ? `+${a.s + a.bonus}` : "0"; document.body.appendChild(n); setTimeout(() => n.remove(), 1200);
}
function renderFeedback(q, a) {
  if (q.type === "choice" || q.type === "map") {
    const best = Math.max(...q.opts.map((o) => o.s));
    $("#qOpts").querySelectorAll(".opt").forEach((b) => {
      const o = q.opts.find((x) => (x.k || x.t) === b.dataset.k);
      b.disabled = true;
      if (o.s === best) b.classList.add("ok");
      else if ((a.k || a.t) === b.dataset.k) b.classList.add(o.s >= 70 ? "ok" : o.s > 0 ? "mid" : "bad");
      else b.classList.add("dim");
      if ((a.k || a.t) === b.dataset.k) b.classList.add("chosen");
    });
    if (q.type === "map") $("#qVisual").querySelectorAll(".pin").forEach((p) => p.classList.toggle("sel", p.dataset.k === a.k));
  } else if (q.type === "num") { $("#numIn").disabled = true; $("#numGo").disabled = true; $("#numIn").classList.toggle("ok", a.ok); $("#numIn").classList.toggle("bad", !a.ok); }
  const chosen = q.opts ? q.opts.find((o) => (o.k || o.t) === (a.k || a.t)) : null;
  const fb = $("#qFb"); fb.hidden = false; fb.className = "fb " + (a.ok ? "good" : a.s > 0 ? "mid" : "bad");
  const head = a.ok ? (a.s === 100 ? "✅ נכון!" : "👍 בחירה טובה") : a.s > 0 ? "🤏 כמעט" : "❌ לא בדיוק";
  const pts = `<span class="fb-pts"><bdi dir="ltr">+${a.s}</bdi> נק׳${a.bonus ? ` · בונוס <bdi dir="ltr">+${a.bonus}</bdi>` : ""}</span>`;
  const own = q.type === "num" || q.type === "order" ? (a.ok ? "" : a.f) : chosen && chosen.f;
  const ans = q.type === "num" ? `<p class="fb-ans">התשובה: <b>${fmt(q.ans)} ${q.unit}</b> · כתבתם ${fmt(a.v)}</p>` : "";
  fb.innerHTML = `<div class="fb-head">${head} ${pts}</div>${ans}${own ? `<p>${own}</p>` : ""}${q.why ? `<p class="why"><b>למה?</b> ${q.why}</p>` : ""}`;
  const nx = $("#qNext"); nx.hidden = false;
  const last = S.qi >= questions(S.stage).length - 1;
  nx.textContent = last ? "סיום השלב ←" : "הלאה ←";
  nx.onclick = () => { S.qi++; S.qStart = Date.now(); S.phase = "q"; dirty = true; save(); showQ(); };
  setTimeout(() => fb.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
}

function stageScore(n) { const qs = questions(n); let c = 0, p = 0; qs.forEach((q) => { const a = S.ans[q.id]; if (a) { if (a.ok) c++; p += a.s + a.bonus; } }); return { c, t: qs.length, p }; }
const MODULES = [
  { k: "lander", e: "🚀", t: "חללית נחיתה", st: -1 },
  { k: "antenna", e: "📡", t: "אנטנת קשר", st: 1 },
  { k: "dome", e: "🔭", t: "מצפה כוכבים", st: 2 },
  { k: "home", e: "🏠", t: "מגורים מוגנים", st: 3 },
  { k: "power", e: "⚡", t: "תחנת חשמל", st: 4 },
  { k: "rover", e: "🚙", t: "רכב ירח", st: 5 },
  { k: "lab", e: "🧪", t: "מעבדה", st: 6 },
  { k: "water", e: "🧊", t: "מפעל מים", st: 0 },
  { k: "green", e: "🌱", t: "חממה", st: 0 },
];
function earned() {
  return MODULES.map((m) => {
    let ok;
    if (m.k === "lander") ok = true;
    else if (m.k === "water") ok = !!(S.ans.site && S.ans.site.k === "south") || !!(S.ans.water && S.ans.water.ok);
    else if (m.k === "green") ok = (S.ans.ins && S.ans.ins.ok) && (S.ans.energy && S.ans.energy.ok);
    else { const sc = stageScore(m.st); ok = sc.t && sc.c / sc.t >= 0.5; }
    if (m.k === "power" && S.ans.energy) m = { ...m, e: { nuclear: "⚛️", solarbat: "🔆", solar: "🔆", wind: "🌬️" }[S.ans.energy.k] || "⚡" };
    return { ...m, ok: !!ok };
  });
}
function showStageDone(n) {
  S.phase = "fact"; save(); dirty = true; drawSteps();
  show("scr-fact");
  const sc = stageScore(n), mod = MODULES.find((m) => m.st === n);
  const got = sc.t && sc.c / sc.t >= 0.5;
  const card = $("#factCard");
  card.innerHTML = `<div class="center"><span class="stage-tag">שלב ${n} הושלם</span>
    <div class="big-emoji" style="margin:.6rem 0">${got ? mod.e : "🔧"}</div>
    <h2 style="margin:.2rem 0">${got ? `קיבלתם: ${mod.t}!` : "כמעט..."}</h2>
    <p style="font-weight:700;font-size:1.2rem;margin:.3rem 0">${sc.c} מתוך ${sc.t} נכונות · ${sc.p} נקודות</p>
    <p style="color:#5a6b85;margin:.2rem 0">${got ? "החלק הזה מחכה לכם בשלב בניית הבסיס." : `צריך לפחות חצי נכונות כדי לקבל ${mod.t}. לא נורא, ממשיכים!`}</p></div>`;
  const b = document.createElement("button"); b.className = "btn wide"; b.style.marginTop = "1rem";
  b.textContent = `לשלב ${n + 1}: ${STAGE_NAMES[n + 1]} ←`;
  b.onclick = () => intro(n + 1);
  card.appendChild(b);
}

// ---------- stage 7: build the base ----------
let buildSel = null;
function showBuild() {
  S.phase = "build"; S.stage = 7; save(); dirty = true; drawSteps();
  show("scr-fact");
  if (!S.base) S.base = {};
  const mods = earned();
  const card = $("#factCard");
  const placed = new Set(Object.values(S.base));
  card.innerHTML = `<div class="center"><span class="stage-tag">שלב 7 מתוך 7</span><h2 style="margin:.4rem 0">🏗️ בנו את הבסיס שלכם</h2>
    <p style="margin:.2rem 0;color:#5a6b85;font-weight:600">הקישו על חלק, ואז על משבצת בקרקע. חלק נעול 🔒 = שלב שעוד לא הצלחתם בו.</p></div>
    <div class="lot" id="lot">${Array.from({ length: 9 }, (_, i) => { const k = S.base[i]; const m = k && mods.find((x) => x.k === k); return `<button type="button" class="slot${m ? " full" : ""}" data-i="${i}" aria-label="משבצת ${i + 1}">${m ? `<span class="se">${m.e}</span><small>${m.t}</small>` : "+"}</button>`; }).join("")}</div>
    <div class="tray2" id="tray2">${mods.map((m) => `<button type="button" class="mod${m.ok ? "" : " locked"}${placed.has(m.k) ? " used" : ""}${buildSel === m.k ? " sel" : ""}" data-k="${m.k}" ${m.ok ? "" : "disabled"}><span class="se">${m.ok ? m.e : "🔒"}</span><small>${m.t}</small></button>`).join("")}</div>`;
  card.querySelectorAll(".mod").forEach((b) => b.onclick = () => { buildSel = b.dataset.k; showBuild(); });
  card.querySelectorAll(".slot").forEach((b) => b.onclick = () => {
    const i = b.dataset.i;
    if (S.base[i]) { delete S.base[i]; save(); showBuild(); return; }
    if (!buildSel) return;
    for (const j in S.base) if (S.base[j] === buildSel) delete S.base[j];
    S.base[i] = buildSel; buildSel = null; save(); showBuild();
  });
  const n = Object.keys(S.base).length, avail = mods.filter((m) => m.ok).length;
  const p = document.createElement("p"); p.className = "center"; p.style.cssText = "font-weight:700;margin:.6rem 0 0";
  p.textContent = `הצבתם ${n} מתוך ${avail} חלקים`; card.appendChild(p);
  const b = document.createElement("button"); b.className = "btn wide"; b.style.marginTop = ".6rem"; b.id = "buildDone";
  b.textContent = "הבסיס מוכן! לדו״ח המשימה 📋"; b.disabled = n === 0;
  b.onclick = () => {
    const bonus = Math.min(avail, n) * 10;
    S.ans.build = { s: bonus, ok: true, bonus: 0, n }; S.done = 1; S.stage = 8;
    if (!S.out) S.out = [];
    S.out.push({ id: "build", stage: "7. בונים את הבסיס", q: "בניית הבסיס מהחלקים שהרוויחו", c: `הציבו ${n} מתוך ${avail} חלקים`, ok: true, p: bonus, t: Date.now() });
    S.sec = Math.round((Date.now() - (S.t0 || Date.now())) / 1000); setPts(S.pts + bonus); dirty = true; save(); showEnd(false);
  };
  card.appendChild(b);
}

function showEnd(byTeacher) {
  show("scr-end"); if (S.stage) drawSteps();
  $("#endTitle").textContent = byTeacher && !S.done ? "המשימה הסתיימה" : "דו״ח המשימה";
  let max = 0; for (let s = 1; s <= NSTAGES; s++) max += questions(s).length * 100;
  const ratio = max ? S.pts / max : 0;
  const stars = ratio >= 0.8 ? 3 : ratio >= 0.55 ? 2 : 1;
  $("#endStars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
  $("#endStars").setAttribute("aria-label", `${stars} כוכבים מתוך 3`);
  $("#endScore").textContent = S.pts;
  const a = (id) => S.ans[id];
  const enLbl = { nuclear: "כור גרעיני קטן", solarbat: "שמש + סוללות", solar: "שמש בלבד", wind: "טורבינות רוח" };
  const shLbl = { regolith: "שכבת אדמת ירח", thin: "קיר אלומיניום דק", concrete: "בטון מכדור הארץ", none: "בלי מגן" };
  const inLbl = { good: "בידוד + אדמה + צבע לבן", black: "צבע שחור", window: "חלונות לאוורור", metal: "קירות מתכת דקים" };
  const rows = [
    ["📍", "אתר נחיתה", a("site") ? SITES[a("site").k].name : null, 1],
    ["🌗", "מופעי הירח", null, 2],
    ["☄️", "מגן מפני מטאוריטים", a("shield") ? shLbl[a("shield").k] : null, 3],
    ["🌡️", "חשמל ובידוד", a("energy") ? `${enLbl[a("energy").k]}${a("ins") ? " · " + inLbl[a("ins").k] : ""}` : null, 4],
    ["🏋️", "חישובי כבידה", null, 5],
    ["📜", "מסע בזמן", null, 6],
  ];
  const mods = earned();
  const baseRow = S.base && Object.keys(S.base).length ? `<div class="mini-lot">${Array.from({ length: 9 }, (_, i) => { const m = S.base[i] && mods.find((x) => x.k === S.base[i]); return `<span>${m ? m.e : ""}</span>`; }).join("")}</div>` : "";
  $("#endReport").innerHTML = `${baseRow}<div class="rep">${rows.map(([e, l, v, n]) => { const sc = stageScore(n); const any = questions(n).some((q) => S.ans[q.id]); return `<div class="rep-row"><span class="re">${e}</span><span class="rl"><b>${l}</b>${v ? `<small>${v}</small>` : ""}</span><span class="rs">${any ? `${sc.c}/${sc.t}` : "—"}</span></div>`; }).join("")}</div>`;
}

// ---------- boot ----------
if (S && S.id && S.code && (!urlCode || urlCode === S.code)) {
  status = "lobby";
  $("#ptsChip").hidden = false; $("#whoName").textContent = S.name; $("#ptsVal").textContent = S.pts || 0; $("#waitName").textContent = S.name;
  (async () => {
    try { const j = await post("/api/report", { code: S.code, id: S.id, tok: S.tok }); status = j.status; enterGame(); }
    catch (ex) { if (ex.status === 404) { localStorage.removeItem(KEY); $("#ptsChip").hidden = true; show("scr-join"); } else { enterGame(); } }
  })();
} else {
  show("scr-join");
  if (urlCode) setTimeout(() => $("#name").focus(), 100);
}
})();
