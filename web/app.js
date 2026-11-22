// ZKöy web istemcisi (A · Fener). Tek WebSocket, sunucu sözleşmesi docs/API.md.
// Derleme adımı yok; her değişimde ekran baştan çizilir, açık olan alan korunur.
// İki dil: Türkçe ve İngilizce. Her metin L(tr, en) ile yazılır; dil değişince
// sayfa yeniden yüklenir (oturum telefonda saklı, masadan düşülmez).
"use strict";

/* ── küçük yardımcılar ── */

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ── dil: ?lang=en, sonra bu telefonda seçilen, sonra tarayıcının dili ── */

const LANG = (() => {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "en" || q === "tr") { store.set("zkoy.lang", q); return q; }
  const saved = store.get("zkoy.lang");
  if (saved === "en" || saved === "tr") return saved;
  return (navigator.language || "tr").toLowerCase().startsWith("tr") ? "tr" : "en";
})();
const EN = LANG === "en";
const L = (tr, en) => (EN ? en : tr);
const LOC = EN ? "en" : "tr";
document.documentElement.lang = LANG;
document.title = L("ZKöy · Vampir Köylü", "ZKöy · Vampire Village");

function setLang(l) {
  store.set("zkoy.lang", l);
  const u = new URL(location.href);
  u.searchParams.delete("lang");
  location.replace(u.toString());
}
const langButton = () => h("button", { class: "ghost small", lang: EN ? "tr" : "en", "aria-label": L("Switch to English", "Türkçeye geç"), onclick: () => setLang(EN ? "tr" : "en") }, EN ? "TR" : "EN");

const nightN = (r) => L(`${r}. gece`, `Night ${r}`);
const dayN = (r) => L(`${r}. gün`, `Day ${r}`);
/** Sunucu duyuruları iki dilde gelir. */
const annText = (a) => (EN && a.en ? a.en : a.text);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v; // yalnız QR SVG'si için, kullanıcı metni asla
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

const device = store.get("zkoy.device") || (() => {
  const d = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
  store.set("zkoy.device", d);
  return d;
})();

const NIGHT_LOOK = L("Ebe “gece çöküyor” deyince telefonuna bak.", "When the narrator says “night falls”, look at your phone.");
const ROLE = {
  vampir: {
    name: L("Vampir", "Vampire"), tag: L("GECE · AV", "NIGHT · HUNT"),
    text: L("Köyü içeriden avlarsın. Sayınız köyün geri kalanına eşitlenince kazanırsınız.", "You hunt the village from inside. You win when your number equals the rest of the village."),
    steps: [NIGHT_LOOK,
      L("Takımınla aynı kurbanı seç; takımının seçimini ekranda görürsün.", "Pick the same victim as your team; you see their picks on screen."),
      L("Sabah sakin ol. Gündüz köylü gibi konuş, suçu başkasına at.", "Stay calm in the morning. By day, talk like a villager and point at someone else.")],
  },
  doktor: {
    name: L("Doktor", "Doctor"), tag: L("GECE · KORUMA", "NIGHT · PROTECT"),
    text: L("Köyün hayat sigortasısın. Koruduğun kişi o gece ölmez.", "You are the village's life insurance. Whoever you protect does not die that night."),
    steps: [NIGHT_LOOK,
      L("Birini koru; kendini de koruyabilirsin.", "Protect someone; you may protect yourself."),
      L("Doktor olduğunu belli etme, vampirlerin ilk hedefi olursun.", "Do not reveal you are the doctor, or you become the vampires' first target.")],
  },
  gozcu: {
    name: L("Gözcü", "Seer"), tag: L("GECE · SORGU", "NIGHT · CHECK"),
    text: L("Gece birine bakarsın: vampir mi, değil mi. Yalnız sen öğrenirsin.", "Each night you look at one player: vampire or not. Only you learn it."),
    steps: [NIGHT_LOOK,
      L("Birini sorgula; cevap sabah ekranında.", "Check someone; the answer is on your morning screen."),
      L("Bildiğini gündüz akıllıca kullan; açık edersen avlanırsın.", "Use what you know wisely by day; reveal it and you will be hunted.")],
  },
  deli: {
    name: L("Deli", "Fool"), tag: L("GÜNDÜZ · OYUN", "DAY · PLAY"),
    text: L("Köy seni asarsa sen de kazanırsın, kim kazanırsa kazansın.", "If the village hangs you, you win too, whoever else wins."),
    steps: [L("Gece uyursun, telefonun “köy uyuyor” der.", "You sleep at night; your phone says “the village sleeps”."),
      L("Gündüz şüpheli görün ama belli etme.", "Look suspicious by day, but not too obviously."),
      L("Asılırsan zafer senin.", "If you are hanged, the win is yours.")],
  },
  koylu: {
    name: L("Köylü", "Villager"), tag: L("GÜNDÜZ · AKIL", "DAY · WITS"),
    text: L("Gece uyursun. Gündüz konuşur, dinler, doğru kişiyi asarsın.", "You sleep at night. By day you talk, listen and hang the right person."),
    steps: [L("Gece gözlerini kapat, telefonun “köy uyuyor” der.", "Close your eyes at night; your phone says “the village sleeps”."),
      L("Gündüz konuş, dinle, çelişkileri yakala.", "Talk and listen by day; catch the contradictions."),
      L("Doğru kişiyi suçla; bütün vampirler asılınca köy kazanır.", "Accuse the right person; the village wins when every vampire is hanged.")],
  },
};

/** İlk açılış: köyün 5 kuralı (tasarım 13-17). */
const RULES = [
  { theme: "night", title: L("Kim kimdir?", "Who is who?"), lead: L("Rolünü yalnız sen bilirsin. Masadakiler tahmin eder.", "Only you know your role. The table has to guess."), roles: true },
  { theme: "night rule-night", big: L("gece", "night"), title: L("Herkes gözünü kapatır.", "Everyone closes their eyes."),
    lines: [[L("Vampirler", "Vampires"), L("bir kurban seçer.", "pick a victim."), "#F2D9D5"], [L("Doktor", "The doctor"), L("birini korur.", "protects someone."), "#D7F0E6"], [L("Gözcü", "The seer"), L("birine bakar.", "checks someone."), "#E1DBFA"]],
    foot: L("Hepsi telefondan, sessizce. Rolü olmayanın ekranında yalnız “Köy uyuyor” yazar; kimin hamle yaptığını ekrandan kimse anlayamaz.", "All on the phone, in silence. A phone without a night role only says “The village sleeps”, so nobody can tell from a screen who made a move.") },
  { theme: "day", title: L("Gündüz dava kurulur.", "By day, the village holds trials."),
    steps: [
      [L("Suçla.", "Accuse."), L("Şüphelendiğin kişiye dokun.", "Tap the player you suspect.")],
      [L("Destek topla.", "Gather support."), L("En az 3 kişi desteklerse dava açılır (büyük masada 4-5). Muhtar'ın desteği 2 sayılır.", "With at least 3 backers a trial opens (4-5 at a big table). The Muhtar's support counts twice.")],
      [L("Savunma.", "Defence."), L("Sanık konuşur, kimse sözünü kesmez.", "The accused speaks; nobody interrupts.")],
      [L("Açık oy.", "Open vote."), L("Assın ya da asmasın. Oylar herkesin ekranında.", "Hang or spare. Every vote shows on every screen.")],
      [L("Yarıyı geçerse asılır", "More than half hangs"), L("ve rolü açıklanır. Geçmezse beraat eder, o gün bir daha yargılanmaz.", "and the role is revealed. Otherwise the accused is acquitted and cannot be tried again that day.")]],
    foot: L("Sanık kendi davasında oy kullanmaz. Gün bitince Muhtar geceye geçirir.", "The accused does not vote in their own trial. When the day is over, the Muhtar brings the night.") },
  { theme: "day dawn", badge: "Muhtar ×2", title: L("Köyün bir Muhtarı var.", "The village has a Muhtar."),
    lines: [["", L("Oyunun başında seçilir. Aday çıkmazsa kura çekilir.", "Elected at the start. If nobody stands, lots are drawn.")],
      ["", L("Davada oyu iki sayılır (13 ve üstü oyuncuda üç).", "Their vote counts twice in a trial (three times with 13 or more players).")],
      ["", L("Günü yönetir: güne geçer, oylamayı açar, günü kapatır.", "They run the day: start it, open the vote, close it.")],
      ["", L("Ölürse makamı birine bırakır.", "If they die, they hand the office to someone.")]],
    foot: L("Muhtar bir makam, rol değil. Vampir de Muhtar olabilir.", "Muhtar (headman) is an office, not a role. A vampire can be Muhtar too.") },
  { theme: "night end", title: L("Kim kazanır?", "Who wins?"), win: true },
];
/** "O bir ___." — ünlü uyumu elle. */
const WAS = EN
  ? { vampir: "a vampire", doktor: "the doctor", gozcu: "the seer", deli: "the fool", koylu: "a villager" }
  : { vampir: "vampirdi", doktor: "doktordu", gozcu: "gözcüydü", deli: "deliydi", koylu: "köylüydü" };
const PHASE = EN
  ? { LOBBY: "Room", ELECTION: "Election", NIGHT: "Night", DAWN: "Dawn", DAY: "Square", EXECUTION: "Execution", END: "End" }
  : { LOBBY: "Oda", ELECTION: "Seçim", NIGHT: "Gece", DAWN: "Şafak", DAY: "Meydan", EXECUTION: "İnfaz", END: "Son" };
/** "O bir köylüydü." / "They were a villager." */
const wasLine = (role) => h("p", { style: "font-size:20px" }, L("O bir ", "They were "), h("b", {}, WAS[role] || "?"), ".");

/* ── durum ── */

const params = new URLSearchParams(location.search);
const pathCode = (location.pathname.match(/^\/j\/([A-Za-z0-9]{4,8})/) || [])[1];
const watchCode = params.get("perde");
/** `/e/KOD`: bir turnuvanın puan tablosu (perdeye yansıtılır, telefonda da açılır). */
const boardCode = ((location.pathname.match(/^\/e\/([A-Za-z0-9]{2,16})\/?$/) || [])[1] || "").toUpperCase() || null;
/** `/?test=1` ile kurulan masa test etiketlidir: oynanır, mühürlenir, sayaçlara girmez. */
const testMode = params.get("test") === "1";

/**
 * Turnuva kurucusu: `/?t=KOD&k=ANAHTAR` linkini bir kez açar; bu telefondan
 * kurulan masalar o turnuvanın puan tablosuna yazılır. Anahtar adres
 * çubuğunda kalmasın diye hemen silinir.
 */
let tour = store.get("zkoy.tour");
if (params.get("t") && params.get("k")) {
  tour = { code: params.get("t").toUpperCase(), key: params.get("k") };
  store.set("zkoy.tour", tour);
  const u = new URL(location.href);
  u.searchParams.delete("t");
  u.searchParams.delete("k");
  history.replaceState(null, "", u.pathname + u.search);
}
function dropTour() {
  tour = null;
  store.del("zkoy.tour");
  render();
}
const tourTitle = (t) => (EN ? t.titleEn : t.title);

/**
 * Kuraya bu telefonun katkısı: sunucu rolleri kendi sırrı + bütün telefonların
 * bu sayılarıyla çeker, yani dağıtımı tek başına seçemez.
 */
function nonce() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Lobide görülen kura kilidi telefonda saklanır; oyun sonunda açılanla karşılaştırılır. */
const commitKey = (code) => `zkoy.kilit.${code}`;

/** Oyun sürerken ekran kararmasın: gece telefon masada durur, sabahı ekran haber verir. */
let wakeLock = null;
async function keepAwake() {
  if (!("wakeLock" in navigator) || wakeLock || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => (wakeLock = null));
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (session && s && s.phase !== "END") keepAwake();
});
let session = store.get("zkoy.session"); // {code, token}
let s = null; // meydan
let m = null; // bana özel
let online = false;
let ws = null;
let cardOpen = false;
let draft = { name: store.get("zkoy.name") || "", code: (pathCode || "").toUpperCase(), will: null };
let lastKey = null;
/** Kural kartı adımı (0-4) ya da null. İlk ziyarette kendiliğinden açılır. */
let rulesStep = store.get("zkoy.rulesSeen") ? null : 0;
/** Oda kurma ekranı açık mı + seçilen kurallar. */
let setup = false;
let setupRules = { gozcu: null, accusedVotes: false };
/** Oyun sonu: ifşa partisi ve mühür ayrıntısı. */
let showIfsa = false;
let showSeal = false;
/** Görülen ebe anlatımları (oda başına, sekme ömrü boyunca). */
const ebeSeen = new Set((() => { try { return JSON.parse(sessionStorage.getItem("zkoy.ebe") || "[]"); } catch { return []; } })());
function markEbe(key) {
  ebeSeen.add(key);
  try { sessionStorage.setItem("zkoy.ebe", JSON.stringify([...ebeSeen])); } catch {}
  render();
}

const NO_LINK = () => L("Bağlantı yok, yeniden bağlanıyor…", "No connection, reconnecting…");
function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  else toast(NO_LINK());
}
const act = (a, extra) => send({ t: "act", a, ...extra });
const cmd = (c, extra) => send({ t: "cmd", c, ...extra });

let toastTimer = null;
function toast(text) {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/* ── bağlantı ── */

let retry = 0;
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    online = true;
    retry = 0;
    if (watchCode) {
      send({ t: "hello", device, lang: LANG });
      send({ t: "watch", code: watchCode.toUpperCase() });
    } else if (session) send({ t: "hello", device, code: session.code, token: session.token, lang: LANG });
    else send({ t: "hello", device, lang: LANG });
    render();
  };
  ws.onmessage = (ev) => {
    const f = JSON.parse(ev.data);
    if (f.t === "joined") {
      setup = false;
      showIfsa = showSeal = false;
      session = { code: f.code, token: f.token };
      store.set("zkoy.session", session);
      history.replaceState(null, "", `/j/${f.code}`);
    } else if (f.t === "state") {
      const prevPhase = s && s.phase;
      s = f.s;
      if (prevPhase === "LOBBY" && s.phase === "ELECTION") cardOpen = true;
      if (prevPhase !== s.phase && navigator.vibrate) navigator.vibrate(60);
      if (s.phase === "LOBBY" && s.seedCommit && !store.get(commitKey(s.code))) store.set(commitKey(s.code), s.seedCommit);
      if (s.phase === "END") {
        if (wakeLock) wakeLock.release().catch(() => {});
      } else if (!watchCode) keepAwake();
    } else if (f.t === "me") {
      m = f.m;
    } else if (f.t === "error") {
      if (/oturum geçersiz|böyle bir oda yok|Session expired|No such room/.test(f.e) && session) {
        store.del("zkoy.session");
        session = null;
        s = m = null;
      }
      // Turnuva linki geçersizse unut; kurucu normal masa kurabilsin.
      if (/turnuva anahtarı|tournament link/.test(f.e)) { tour = null; store.del("zkoy.tour"); }
      toast(f.e);
    }
    render();
  };
  ws.onclose = () => {
    online = false;
    render();
    setTimeout(connect, Math.min(8000, 600 * 2 ** retry++));
  };
}

/* ── çizim ── */

function render() {
  const app = document.getElementById("app");
  const focus = document.activeElement && document.activeElement.id;
  const caret = focus && document.activeElement.selectionStart;
  let view;
  let key;
  const ebe = !watchCode && session && s && m && !cardOpen ? pendingEbe() : null;
  if (boardCode) [view, key] = [viewBoard(), "board"];
  else if (watchCode) [view, key] = [viewScreen(), "perde"];
  else if (rulesStep !== null) [view, key] = [viewRules(rulesStep), `kural:${rulesStep}`];
  else if (!session || !s || !m) [view, key] = setup ? [viewSetup(), "setup"] : [viewEntry(), "entry"];
  else if (cardOpen && m.role) [view, key] = [viewCard(), "card"];
  else if (ebe) [view, key] = [viewEbe(ebe), `ebe:${ebe.key}`];
  else if (s.phase === "END" && showIfsa) [view, key] = [viewIfsa(), `ifsa:${showSeal}`];
  else {
    view = { LOBBY: viewLobby, ELECTION: viewElection, NIGHT: viewNight, DAWN: viewDawn, DAY: viewDay, EXECUTION: viewExecution, END: viewEnd }[s.phase]();
    key = `${s.phase}:${s.round}:${s.day && s.day.stage}`;
  }
  // Giriş animasyonu yalnız ekran değişince oynar; aynı ekranın tazelenmesi
  // (her bot/oyuncu hamlesi) kartı yeniden döndürmesin.
  if (key === lastKey) view.el.classList.add("still");
  lastKey = key;
  // Kurucu koptuysa masa sahipsiz kalmasın: her ekranın başında devralma çağrısı.
  if (!watchCode && session && s && m && m.can.includes("claimHost") && rulesStep === null)
    view.el.prepend(h("div", { class: "callout" },
      h("span", { style: "flex-grow:1" }, h("small", {}, L("KURUCU KOPTU", "HOST DROPPED OUT")), L(`${nameOf(s.hostPid)} bir süredir bağlı değil.`, `${nameOf(s.hostPid)} has been offline for a while.`)),
      h("button", { onclick: () => cmd("claimHost") }, L("Masayı devral", "Take over the table"))));
  document.body.className = view.theme;
  // Sayfanın en dış zemini ve tarayıcı çubuğu da temayla döner (iOS esnemesinde beyaz görünmesin).
  const ground = view.theme.includes("day") ? "#FAF7EF" : "#11101B";
  document.documentElement.style.backgroundColor = ground;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", ground);
  app.replaceChildren(view.el);
  if (focus) {
    const el = document.getElementById(focus);
    if (el) {
      el.focus();
      if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret);
    }
  }
  if (key !== prevScrollKey) window.scrollTo(0, 0);
  prevScrollKey = key;
}
let prevScrollKey = null;

/* ── ebe anlatımları (tasarım 10-12) ── */

/** Şu an gösterilmesi gereken, henüz görülmemiş anlatım. */
function pendingEbe() {
  const c = s.code;
  if (s.phase === "ELECTION" && !ebeSeen.has(`${c}:sec`)) return { key: `${c}:sec`, kind: "sec" };
  if (s.phase === "NIGHT" && m.alive && !ebeSeen.has(`${c}:gece:${s.round}`)) return { key: `${c}:gece:${s.round}`, kind: "gece" };
  const t = s.day.trial;
  if (s.phase === "DAY" && t && !ebeSeen.has(`${c}:dava:${s.round}:${t.accused}`)) return { key: `${c}:dava:${s.round}:${t.accused}`, kind: "dava" };
  return null;
}

function viewEbe(e) {
  const done = () => markEbe(e.key);
  const head = (dark) => h("div", { class: "bar" }, h("span", { class: "mono", style: `font-size:12px;letter-spacing:0.1em;color:${dark ? "var(--gold)" : "#8A5F00"}` }, L("EBE ANLATIYOR", "THE NARRATOR SAYS")), bar("").lastChild);
  if (e.kind === "sec") {
    const facts = [
      ["01", EN
        ? h("span", {}, "The Muhtar's vote counts ", h("b", {}, s.muhtarWeight === 3 ? "three times" : "twice"), " in a trial.")
        : h("span", {}, "Muhtar'ın oyu davada ", h("b", {}, s.muhtarWeight === 3 ? "üç" : "iki"), " sayılır.")],
      ["02", L("Günü o yönetir: güne geçer, oylamayı açar, günü kapatır.", "They run the day: start it, open the vote, close it.")],
      ["03", L("Ölürse makamı birine bırakır. Vampir de Muhtar olabilir.", "If they die, they hand the office to someone. A vampire can be Muhtar too.")],
    ];
    return {
      theme: "night ebe-sec",
      el: h("section", { class: "screen" }, head(true),
        h("div", { class: "dawn-hero" },
          h("span", { class: "mono muted", style: "letter-spacing:0.1em" }, L("ROLLER DAĞITILDI", "ROLES ARE DEALT")),
          h("h1", { class: "ebe-title" }, L("Önce bir Muhtar seçin.", "First, elect a Muhtar.")),
          h("div", { class: "facts" }, facts.map(([n, t]) => h("div", {}, h("span", { class: "mono", style: "color:var(--gold)" }, n), h("span", {}, t)))),
          h("p", { class: "muted" }, L("Aday olmak isteyen elini kaldırsın. Aday çıkmazsa kura çekilir.", "Whoever wants to stand, raise a hand. If nobody does, lots are drawn."))),
        h("button", { class: "btn", onclick: done }, L("Seçime geç", "Go to the election"))),
    };
  }
  if (e.kind === "gece") {
    const actor = ["vampir", "doktor", "gozcu"].includes(m.role);
    const muhtarTag = s.muhtar ? `MUHTAR: ${nameOf(s.muhtar).toLocaleUpperCase(LOC)} · ` : "";
    return {
      theme: "night ebe-gece",
      el: h("section", { class: "screen" }, head(true),
        h("div", { class: "dawn-hero", style: "align-items:center;text-align:center" },
          h("div", { class: "lantern dim", "aria-hidden": "true" }),
          h("span", { class: "mono muted", style: "letter-spacing:0.1em" }, `${muhtarTag}${L(`${s.round}. GECE`, `NIGHT ${s.round}`)}`),
          h("h1", { class: "ebe-title big" }, L("Gece çöküyor.", "Night falls.")),
          h("p", { style: "max-width:300px;font-size:18px" }, L("Herkes gözlerini kapatsın. Rolü olan telefonuna baksın, kimse konuşmasın.", "Everyone close your eyes. If you have a role, look at your phone. Nobody talks.")),
          h("p", { class: "muted", style: "max-width:290px" }, actor
            ? L("Senin bu gece bir hamlen var. Sessizce yap, sonra telefonu masaya bırak.", "You have a move tonight. Make it quietly, then put the phone down.")
            : L("Sabah olunca ekranın aydınlanır. O zamana kadar masaya bırak.", "Your screen lights up when morning comes. Until then, leave it on the table."))),
        h("button", { class: actor ? "btn" : "ghost", onclick: done }, actor ? L("Hamleme geç", "Go to my move") : L("Gözlerim kapalı", "My eyes are closed"))),
    };
  }
  const t = s.day.trial;
  const mine = t.accused === m.pid;
  return {
    theme: "day",
    el: h("section", { class: "screen" }, head(false),
      h("div", { class: "dawn-hero" },
        h("span", { class: "mono", style: "letter-spacing:0.1em;color:var(--wax)" }, L(`${s.round}. GÜN · DAVA AÇILDI`, `DAY ${s.round} · TRIAL OPENED`)),
        h("h1", { class: "ebe-title" }, mine ? L("Dava sana açıldı.", "You are on trial.") : L(`${nameOf(t.accused)} yargılanıyor.`, `${nameOf(t.accused)} is on trial.`)),
        h("div", { class: "will" },
          h("div", { class: "kv" }, h("span", { class: "muted" }, L("Suçlayan", "Accuser")), h("b", {}, nameOf(t.accuser))),
          h("div", { class: "kv" }, h("span", { class: "muted" }, L("Destekleyenler", "Backers")), h("b", { style: "text-align:right" }, (t.backers || [t.seconder]).filter((b) => b !== t.accuser).map(nameOf).join(", ")))),
        h("p", { style: "font-size:18px" }, mine
          ? L("Şimdi sen konuşuyorsun. Masaya kendini savun; bitince “Savunmam bitti”ye bas, oylama açılsın.", "Your turn to speak. Defend yourself to the table; when you are done, press “My defence is over” and the vote opens.")
          : L(`Şimdi ${nameOf(t.accused)} konuşuyor. Sözünü kesmeyin. Savunması bitince ya da Muhtar derse oylama açılır.`, `${nameOf(t.accused)} speaks now. Do not interrupt. The vote opens when they are done or the Muhtar says so.`))),
      h("button", { class: "btn", onclick: done }, mine ? L("Savunmaya geç", "Go to my defence") : L("Dinliyorum", "I'm listening"))),
  };
}

/* ── köyün kuralları (tasarım 13-17) ── */

function closeRules() {
  store.set("zkoy.rulesSeen", true);
  rulesStep = null;
  render();
}

function viewRules(i) {
  const r = RULES[i];
  const last = i === RULES.length - 1;
  const dots = h("span", { class: "dots", "aria-label": `${i + 1} / ${RULES.length}` }, RULES.map((_, j) => h("span", { class: j === i ? "on" : "" })));
  const next = () => { if (last) closeRules(); else { rulesStep = i + 1; render(); } };
  const back = () => { rulesStep = i - 1; render(); };
  let body;
  if (r.roles) {
    const short = {
      vampir: L("Gece takımıyla birini avlar. Gündüz köylü gibi davranır.", "Hunts someone with their team at night. Acts like a villager by day."),
      koylu: L("Gece uyur. Gündüz konuşur, dinler, doğru kişiyi asar.", "Sleeps at night. By day, talks, listens and hangs the right person."),
      doktor: L("Her gece birini korur, kendini de. Koruduğu ölmez.", "Protects someone every night, themselves included. The protected one does not die."),
      gozcu: L("Her gece birine bakar: vampir mi, değil mi.", "Checks one player every night: vampire or not."),
      deli: L("Köy onu asarsa o da kazanır.", "Wins too if the village hangs them."),
    };
    body = h("div", { class: "stack" }, ["vampir", "koylu", "doktor", "gozcu", "deli"].map((k) =>
      h("div", { class: `rolebox ${k}` },
        h("span", { class: "rn" }, ROLE[k].name, k === "gozcu" ? h("small", {}, L(" 13+ oyuncuda", " 13+ players")) : k === "deli" ? h("small", {}, L(" 8+ oyuncuda", " 8+ players")) : null),
        h("span", {}, short[k]))));
  } else if (r.steps) {
    body = h("div", { class: "rows" }, r.steps.map(([b, t], j) =>
      h("div", { class: "row step" }, h("span", { class: "mono", style: "color:var(--wax)" }, `0${j + 1}`), h("span", {}, h("b", {}, b), " ", t))));
  } else if (r.win) {
    const wins = [
      [L("Köy", "Village"), L("Bütün vampirler asılınca.", "When every vampire is hanged."), ""],
      [L("Vampirler", "Vampires"), L("Sayıları köyün geri kalanına eşitlenince.", "When their number equals the rest of the village."), "#F2D9D5"],
      [L("Deli", "Fool"), L("Köy onu asarsa, kim kazanırsa kazansın.", "If the village hangs them, whoever else wins."), "#F6E7C0"],
    ];
    body = h("div", { class: "stack" },
      h("div", { class: "rows" }, wins.map(([n, t, c]) =>
        h("div", { class: "row", style: "flex-direction:column;align-items:flex-start;gap:4px;padding:14px 0" }, h("span", { style: `font-family:var(--d-font);font-weight:800;font-size:22px;${c ? `color:${c}` : ""}` }, n), h("span", { class: "muted", style: "font-size:16px" }, t)))),
      h("div", { class: "ledger" }, h("span", { class: "t" }, L("● MÜHÜR", "● SEAL")), h("span", {}, L("Her gece hamlesi ve her oy mühürlenir. Oyun bitince kim ne yaptı herkes görür; kimse “ben o gece onu seçmedim” diyemez.", "Every night move and every vote is sealed. When the game ends everyone sees who did what; nobody can say “I didn't pick them that night”."))));
  } else {
    body = h("div", { class: "stack", style: "gap:14px" },
      r.big && h("span", { class: "rule-big", "aria-hidden": "true" }, r.big),
      r.badge && h("span", { class: "badge", style: "align-self:flex-start;font-size:14px;padding:6px 12px" }, r.badge),
      h("div", { class: "stack", style: "gap:12px;font-size:17px" }, r.lines.map(([b, t, c]) => h("span", {}, b ? h("b", { style: c ? `color:${c}` : "" }, b + " ") : null, t))));
  }
  return {
    theme: r.theme,
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, `${L("Köyün kuralları", "How to play")} · ${i + 1} / ${RULES.length}`), !last && h("button", { class: "ghost small", onclick: closeRules }, L("Atla", "Skip"))),
      h("h1", { class: "rule-title", style: r.win ? "color:var(--gold)" : "" }, r.title),
      r.lead && h("p", {}, r.lead),
      body,
      r.foot && h("p", { class: "muted" }, r.foot),
      h("div", { class: "rule-nav push" }, dots,
        i > 0 && h("button", { class: "ghost", onclick: back }, L("Geri", "Back")),
        h("button", { class: "btn", onclick: next }, last ? L("Hazırım", "I'm ready") : L("İleri", "Next")))),
  };
}

/* ── oda kurma (tasarım 18) ── */

const NAME_FIRST = () => L("Önce adını yaz.", "Write your name first.");

function viewSetup() {
  const seg = (field, options) => h("div", { class: "seg", role: "radiogroup" }, options.map(([v, label]) =>
    h("button", { role: "radio", "aria-checked": String(setupRules[field] === v), class: setupRules[field] === v ? "on" : "", onclick: () => { setupRules[field] = v; render(); } }, label)));
  const create = () => {
    const name = (draft.name || "").trim();
    if (!name) { setup = false; render(); return toast(NAME_FIRST()); }
    send({ t: "create", name, rules: setupRules, n: nonce(), test: testMode, tour: tour || undefined });
  };
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("button", { class: "ghost small", onclick: () => { setup = false; render(); } }, L("← Geri", "← Back")), h("span", { class: "eyebrow" }, L("Oda kur", "Create a room"))),
      h("h1", {}, L("Masanın kuralları", "Table rules")),
      h("div", { class: "stack" },
        h("span", { class: "q" }, L("Gözcü olsun mu?", "Should there be a seer?")),
        h("span", { class: "muted" }, L("Küçük masada gözcü vampiri çabuk bulur.", "At a small table the seer finds the vampire fast.")),
        seg("gozcu", [[null, L("Otomatik", "Auto")], [true, L("Var", "Yes")], [false, L("Yok", "No")]]),
        h("span", { class: "mono muted", style: "font-size:12px" }, L("otomatik = 13 ve üstü oyuncuda var", "auto = yes with 13 or more players"))),
      h("div", { class: "stack push" },
        tour && h("div", { class: "bar" },
          h("span", {}, L("Turnuva masası: ", "Tournament table: "), h("b", {}, tour.code)),
          h("button", { class: "link", onclick: dropTour }, L("Turnuvasız kur", "Without tournament"))),
        h("span", { class: "muted" }, L("İlk oyunsa varsayılanlar iyi. Sonra değiştirirsiniz.", "The defaults suit a first game. You can change them later.")),
        h("button", { class: "btn", onclick: create }, L("Odayı kur", "Create the room")))),
  };
}

function bar(label) {
  const seals = s ? s.seals : null;
  return h("div", { class: "bar" },
    h("span", { class: "eyebrow" }, label),
    online
      ? seals && h("span", { class: "seal", title: L("Zincire yazılan kayıtlar", "Records written to chain") },
        L(`● ${seals.memoCount} mühür${seals.pending ? ` · ${seals.pending} yolda` : ""}`, `● ${seals.memoCount} sealed${seals.pending ? ` · ${seals.pending} on the way` : ""}`))
      : h("span", { class: "offline" }, L("bağlantı koptu…", "connection lost…")));
}

const nameOf = (id) => (s.players.find((p) => p.id === id) || {}).name || "?";
const alive = () => s.players.filter((p) => p.alive);
const initial = (n) => n.slice(0, 1).toLocaleUpperCase(LOC);
const YOU = () => L(" (sen)", " (you)");

function viewEntry() {
  const create = () => {
    const name = document.getElementById("ad").value.trim();
    if (!name) {
      document.getElementById("ad").focus();
      return toast(NAME_FIRST());
    }
    store.set("zkoy.name", name);
    draft.name = name;
    setup = true;
    render();
  };
  const join = () => {
    const name = document.getElementById("ad").value.trim();
    const code = document.getElementById("kod").value.trim().toUpperCase();
    if (!name) {
      document.getElementById("ad").focus();
      return toast(NAME_FIRST());
    }
    if (code.length < 4) {
      document.getElementById("kod").focus();
      return toast(L("Oda kodunu yaz.", "Write the room code."));
    }
    store.set("zkoy.name", name);
    send({ t: "join", code, name, n: nonce() });
  };
  const joining = !!draft.code;
  return {
    theme: "night entry",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow mono" }, L("Vampir Köylü", "Vampire Village")), h("span", { style: "display:flex;gap:10px;align-items:center" }, h("span", { class: "muted mono" }, "zkoy.fun"), langButton())),
      h("div", { class: "entry-hero" },
        h("div", { class: "lantern", "aria-hidden": "true" }),
        h("h1", { class: "hero" }, "ZKöy"),
        h("p", {}, L("Köy uyuyor. Aranızda vampir var. Her gece, her oy mühürleniyor.", "The village sleeps. A vampire is among you. Every night and every vote is sealed."))),
      h("div", { class: "stack" },
        h("label", { class: "lbl", for: "ad" }, L("ADIN", "YOUR NAME")),
        h("input", { id: "ad", maxlength: "16", autocomplete: "nickname", placeholder: L("Masada seni ne diye çağırıyorlar?", "What does the table call you?"), value: draft.name, oninput: (e) => (draft.name = e.target.value) }),
        joining
          ? h("button", { class: "btn", onclick: join }, L(`${draft.code} odasına otur`, `Sit at ${draft.code}`))
          : h("button", { class: "btn", onclick: create }, L("Oda kur", "Create a room")),
        h("div", { class: "duo" },
          h("label", { class: "sr", for: "kod" }, L("Oda kodu", "Room code")),
          h("input", { id: "kod", class: "code", maxlength: "8", placeholder: L("ODA KODU", "ROOM CODE"), value: draft.code, oninput: (e) => (draft.code = e.target.value.toUpperCase()) }),
          joining ? h("button", { class: "ghost gold", onclick: () => { draft.code = ""; history.replaceState(null, "", "/"); render(); } }, L("Oda kur", "New room")) : h("button", { class: "ghost gold", onclick: join }, L("Gir", "Join"))),
        h("div", { class: "bar", style: "justify-content:center;gap:16px" },
          h("span", { class: "muted" }, L("QR'ı okuttuysan kod hazır gelir.", "Scanned the QR? The code is already in.")),
          h("button", { class: "link", onclick: () => { rulesStep = 0; render(); } }, L("Nasıl oynanır?", "How to play?"))))),
  };
}

function qrSvg(text) {
  if (!window.qrcode) return "";
  const q = window.qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}

/** Motorun rolePlan'ının aynısı: masadaki rol dağılımı (herkese açık bilgi). */
function composition(n, rules) {
  const vampir = n >= 13 ? 3 : n >= 10 ? 2 : 1;
  const gozcu = (rules.gozcu === null ? n >= 13 : rules.gozcu) ? 1 : 0;
  const deli = n >= 8 ? 1 : 0;
  return { vampir, doktor: 1, gozcu, deli, koylu: Math.max(0, n - vampir - 1 - gozcu - deli) };
}

/** "3 vampir" / "3 vampires". */
const many = (n, tr, en) => (EN ? `${n} ${en}${n === 1 ? "" : "s"}` : `${n} ${tr}`);

function viewLobby() {
  const link = `${location.origin}/j/${s.code}`;
  const n = s.players.length;
  const c = composition(Math.max(n, 7), s.rules);
  const chip = (cls, text) => h("span", { class: `chip-role ${cls}` }, text);
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, L("Oda", "Room")), h("span", { style: "display:flex;gap:10px;align-items:center" }, h("button", { class: "ghost small", onclick: () => { rulesStep = 0; render(); } }, L("Nasıl oynanır?", "How to play?")), langButton())),
      h("div", { class: "lobby-head" },
        h("div", { class: "qr sm", html: qrSvg(link), role: "img", "aria-label": L(`Katılım QR kodu: ${link}`, `Join QR code: ${link}`) }),
        h("div", { class: "stack", style: "gap:6px" },
          h("div", { class: "room-code" }, s.code),
          h("span", { class: "muted" }, L("Okut ya da kodu yaz, masaya otur.", "Scan it or type the code to take a seat.")),
          h("button", { class: "link", style: "align-self:flex-start", onclick: () => copyLink(link) }, L("Linki kopyala", "Copy the link")))),
      h("div", { class: "stack", style: "gap:8px" },
        h("span", { class: "eyebrow" }, n < 7 ? L("7 kişi olunca masada", "With 7 players the table has") : L("Bu masada", "At this table")),
        h("div", { class: "chips" },
          chip("vampir", many(c.vampir, "vampir", "vampire")), chip("doktor", L("1 doktor", "1 doctor")),
          c.gozcu ? chip("gozcu", L("1 gözcü", "1 seer")) : chip("off", L("gözcü yok", "no seer")),
          c.deli ? chip("deli", L("1 deli", "1 fool")) : null,
          chip("koylu", many(c.koylu, "köylü", "villager")),
          s.tournament ? chip("deli", L(`turnuva · ${tourTitle(s.tournament)}`, `tournament · ${tourTitle(s.tournament)}`)) : null,
          s.test ? chip("off", L("test masası · sayaçlara girmez", "test table · not counted")) : null),
        h("span", { class: "muted", style: "font-size:13px" }, L(
          `Masa büyüdükçe dağılım kendiliğinden değişir. Sanık kendi davasında ${s.rules.accusedVotes ? "oy kullanır" : "oy kullanmaz"}.`,
          `The mix changes on its own as the table grows. The accused ${s.rules.accusedVotes ? "votes" : "does not vote"} in their own trial.`))),
      h("div", { class: "bar" }, h("span", { style: "font-family:var(--d-font);font-weight:800;font-size:26px" }, L("Masa", "Table")), h("span", { class: "mono muted" }, L(`${n} / 15 · en az 7`, `${n} / 15 · at least 7`))),
      h("div", { class: "seats" }, s.players.map((p) =>
        h("div", { class: `seat${p.isHost ? " host" : ""}` },
          h("span", { class: `av${p.isHost ? " gold" : ""}` }, initial(p.name)),
          h("span", { style: p.id === m.pid ? "font-weight:600" : "" }, p.name + (p.id === m.pid ? YOU() : "")),
          p.isHost ? h("span", { class: "tag" }, L("kurucu", "host"))
            : m.can.includes("kick") && h("button", { class: "x", "aria-label": L(`${p.name} masadan çıkar`, `Remove ${p.name}`), onclick: () => cmd("kick", { x: p.id }) }, "✕")))),
      h("div", { class: "stack push" },
        m.can.includes("start")
          ? h("button", { class: "btn", disabled: n < 7, onclick: () => cmd("start") }, n < 7 ? L(`${7 - n} kişi daha lazım`, `${7 - n} more needed`) : L("Köyü uyut, başlat", "Put the village to sleep, start"))
          : h("p", { class: "muted" }, L(`${nameOf(s.hostPid)} başlatınca rol kartın gelecek. Telefonunu kimseye gösterme.`, `Your role card arrives when ${nameOf(s.hostPid)} starts. Show your phone to nobody.`)))),
  };
}

function copyText(text, done) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(done), () => toast(text));
  else toast(text);
}

function copyLink(link) {
  const ok = () => toast(L("Link kopyalandı.", "Link copied."));
  if (navigator.share) navigator.share({ title: "ZKöy", text: L("Masaya otur:", "Take a seat:"), url: link }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(link).then(ok, () => toast(link));
  else toast(link);
}

function viewCard() {
  const r = ROLE[m.role];
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, L("Rolün · yalnız sen görüyorsun", "Your role · only you can see it")), h("span", { class: "seal" }, L("● mühürlendi", "● sealed"))),
      h("div", { class: `card ${m.role}` },
        h("span", { class: "mono", style: "font-size:12px;letter-spacing:0.1em;opacity:0.8" }, r.tag),
        h("div", { class: "stack" }, h("h2", {}, r.name), h("p", {}, r.text)),
        m.team.length
          ? h("div", { class: "foot" }, h("span", { style: "font-size:13px;opacity:0.8" }, L("Takımın", "Your team")), h("span", { style: "font-family:var(--d-font);font-weight:600;font-size:24px" }, m.team.map(nameOf).join(", ")))
          : h("div", { class: "foot" }, h("span", { style: "font-size:13px;opacity:0.8" }, L("Kimseye gösterme.", "Show nobody.")))),
      h("div", { class: "stack", style: "gap:10px" },
        h("span", { class: "eyebrow" }, L("Senin gecen böyle geçer", "This is how your night goes")),
        r.steps.map((t, i) => h("div", { class: "facts one" }, h("div", {}, h("span", { class: "mono", style: "color:var(--wax-soft)" }, String(i + 1)), h("span", {}, t))))),
      h("button", { class: "ghost", onclick: () => { cardOpen = false; render(); } }, s.phase === "ELECTION" && !ebeSeen.has(`${s.code}:sec`) ? L("Anladım, devam", "Got it, continue") : L("Kartı kapat", "Close the card"))),
  };
}

const cardButton = () => h("button", { class: "ghost", style: "min-height:40px;font-size:14px", onclick: () => { cardOpen = true; render(); } }, L("Kartım", "My card"));

function viewElection() {
  const total = alive().length;
  const mine = s.election.votes[m.pid];
  const missing = alive().filter((p) => !s.election.votes[p.id]).map((p) => p.name);
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, L("Seçim · oyun başlamadan", "Election · before the game")), cardButton()),
      h("div", { class: "stack" }, h("h1", {}, L("Köyün Muhtarı kim olsun?", "Who should be the village's Muhtar?")),
        h("p", {}, L(`Muhtar'ın oyu ${s.muhtarWeight} sayılır, günü o yönetir. Vampir de seçilebilir.`, `The Muhtar's vote counts ${s.muhtarWeight} times, and they run the day. A vampire can be elected too.`))),
      s.election.candidates.length === 0 && h("p", { class: "muted" }, L("Henüz aday yok. Aday olan olmazsa kura çekilir.", "No candidates yet. If nobody stands, lots are drawn.")),
      h("div", { class: "stack" }, s.election.candidates.map((c) => {
        const count = s.election.tally[c] || 0;
        return h("button", { class: `cand${mine === c ? " on" : ""}`, disabled: !m.can.includes("mvote"), onclick: () => act("mvote", { x: c }) },
          h("span", { class: `av${mine === c ? " gold" : ""}` }, initial(nameOf(c))),
          h("span", { style: "flex-grow:1" }, h("span", { style: "font-weight:600;font-size:18px" }, nameOf(c)), h("span", { class: "meter" }, h("span", { style: `width:${Math.round((count / total) * 100)}%` }))),
          h("span", { class: "n" }, count));
      })),
      mine && h("p", { class: "muted" }, L(
        `Senin oyun: ${nameOf(mine)}${missing.length ? ` · oy vermeyen: ${missing.join(", ")}` : ""}`,
        `Your vote: ${nameOf(mine)}${missing.length ? ` · not voted yet: ${missing.join(", ")}` : ""}`)),
      h("div", { class: "stack push" },
        m.can.includes("nominate") && h("button", { class: "ghost gold", onclick: () => act("nominate") }, L("Ben de adayım", "I'll stand")),
        m.can.includes("closeElection") && missing.length > 0 && h("button", { class: "ghost", onclick: () => cmd("closeElection") }, L("Seçimi bitir (kurucu)", "End the election (host)")))),
  };
}

function viewNight() {
  const role = m.alive ? m.role : null;
  const acting = m.can.includes("night");
  let body;
  if (!acting) {
    body = h("div", { class: "entry-hero" },
      h("div", { class: "lantern", "aria-hidden": "true" }),
      h("h1", {}, m.alive ? L("Köy uyuyor.", "The village sleeps.") : L("Hayaletler izliyor.", "The ghosts are watching.")),
      h("p", {}, m.alive
        ? L("Gözlerini kapat. Telefonunu masaya bırak; sabah seni uyandırırız.", "Close your eyes. Leave your phone on the table; we will wake you in the morning.")
        : L("Gecenin hamlelerini göremezsin; sabahı bekle.", "You cannot see the night's moves; wait for the morning.")));
  } else {
    const current = role === "vampir" ? m.night.targets[m.pid] : role === "doktor" ? m.night.save : m.night.query;
    const title = EN
      ? { vampir: "Who do we take?", doktor: "Who are you protecting tonight?", gozcu: "Who are you checking?" }[role]
      : { vampir: "Kimi alıyoruz?", doktor: "Bu gece kimi koruyorsun?", gozcu: "Kime bakıyorsun?" }[role];
    const pool = alive().filter((p) => (role === "doktor" ? true : p.id !== m.pid) && !(role === "vampir" && m.team.includes(p.id)));
    const teamPicks = role === "vampir"
      ? m.team.filter((id) => m.night.targets[id]).map((id) => L(`${nameOf(id)}'nın seçimi: ${nameOf(m.night.targets[id])}`, `${nameOf(id)}'s pick: ${nameOf(m.night.targets[id])}`))
      : [];
    const last = role === "gozcu" && m.gozcuLog.length ? m.gozcuLog[m.gozcuLog.length - 1] : null;
    body = h("div", { class: "stack" },
      h("h1", { style: role === "vampir" ? "color:#F2D9D5" : "" }, title),
      teamPicks.length ? h("p", {}, teamPicks.join(" · ") + L(". Aynı kişiyi seçin.", ". Pick the same person.")) : null,
      last && h("p", {}, L(`Dünkü sorgun: ${nameOf(last.target)} ${last.vamp ? "VAMPİR" : "vampir değil"}.`, `Last night's check: ${nameOf(last.target)} ${last.vamp ? "IS A VAMPIRE" : "is not a vampire"}.`)),
      h("div", { class: "picks night-pick" }, pool.map((p) =>
        h("button", { class: `pick${current === p.id ? " on" : ""}`, onclick: () => act("night", { x: p.id }) }, p.name + (p.id === m.pid ? YOU() : "") + (current === p.id ? " ✓" : ""))),
        role === "vampir" && m.team.map((id) => h("div", { class: "pick note", style: "display:flex;align-items:center;justify-content:center" }, `${nameOf(id)} · ${L("takım", "team")}`))));
  }
  return {
    theme: "night",
    el: h("section", { class: "screen", style: acting && role === "vampir" ? "background:radial-gradient(80% 40% at 50% 100%, #3B1412 0%, transparent 70%)" : "" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, nightN(s.round)), h("span", { style: "display:flex;gap:10px;align-items:center" }, bar("").lastChild, cardButton())),
      body,
      h("div", { class: "stack push" },
        m.can.includes("closeNight") && h("button", { class: "ghost", onclick: () => cmd("closeNight") }, L("Geceyi bitir (kurucu)", "End the night (host)")),
        m.can.includes("will") && willBox())),
  };
}

/** Vasiyet kutusu açık mı: ekran her yayında baştan çizilir, kutu yazarken kapanmasın. */
let willOpen = false;

function willBox() {
  const save = () => {
    const txt = document.getElementById("will").value.trim();
    if (!txt) return toast(L("Önce vasiyetini yaz.", "Write your last words first."));
    if (!ws || ws.readyState !== 1) return toast(NO_LINK());
    act("will", { txt });
    willOpen = false;
    toast(L("Vasiyetin kaydedildi; birazdan mühürlenir.", "Your last words are saved and will be sealed shortly."));
    render();
  };
  if (draft.will === null) draft.will = m.will || "";
  return h("details", { open: willOpen, ontoggle: (e) => (willOpen = e.target.open) },
    h("summary", { class: "muted", style: "cursor:pointer;min-height:44px;display:flex;align-items:center" }, m.will
      ? L("Vasiyetin yazılı · düzenle", "Your last words are written · edit")
      : L("Vasiyet bırak (ölünce okunur)", "Leave last words (read out when you die)")),
    h("div", { class: "stack", style: "margin-top:8px" },
      h("label", { class: "sr", for: "will" }, L("Vasiyet", "Last words")),
      h("textarea", { id: "will", maxlength: "200", placeholder: L("Ölürsem köy şunu bilsin…", "If I die, the village should know…"), oninput: (e) => (draft.will = e.target.value) }, draft.will),
      h("button", { class: "ghost", onclick: save }, L("Kaydet", "Save"))));
}

function viewDawn() {
  const ann = [...s.announcements].reverse().find((a) => a.kind === "dawn");
  const died = s.lastNight && s.lastNight.died;
  const dead = died && s.players.find((p) => p.id === died);
  return {
    theme: "day dawn",
    el: h("section", { class: "screen" },
      bar(L(`Şafak · ${s.round}. gün`, `Dawn · day ${s.round}`)),
      h("div", { class: "dawn-hero" },
        h("span", { class: "mono muted", style: "letter-spacing:0.1em" }, L("SABAH OLDU", "MORNING")),
        dead
          ? h("h1", {}, L(`${dead.name} ölü bulundu.`, `${dead.name} was found dead.`))
          : h("h1", {}, s.lastNight && s.lastNight.saved ? L("Doktor yetişti.", "The doctor got there in time.") : L("Sessiz bir gece.", "A quiet night.")),
        dead ? wasLine(dead.role) : h("p", {}, ann ? annText(ann) : L("Kimse ölmedi.", "Nobody died.")),
        ann && ann.will && h("div", { class: "will" }, h("span", { class: "eyebrow", style: "font-size:12px" }, L("Vasiyeti", "Last words")), h("q", {}, ann.will)),
        m.heirRight && heirPicker()),
      h("div", { class: "stack" },
        m.can.includes("startDay")
          ? h("button", { class: "btn", onclick: () => cmd("startDay") }, L("Güne geç", "Start the day"))
          : h("p", { class: "muted" }, s.muhtar
            ? L(`Muhtar ${nameOf(s.muhtar)} hazır olunca güne geçer.`, `Muhtar ${nameOf(s.muhtar)} starts the day when ready.`)
            : L("Kurucu hazır olunca güne geçer.", "The host starts the day when ready.")))),
  };
}

function heirPicker() {
  return h("div", { class: "stack" },
    h("p", { style: "font-weight:600" }, L("Muhtar sendin. Makamı kime bırakıyorsun?", "You were the Muhtar. Who gets the office?")),
    h("div", { class: "picks" }, alive().map((p) => h("button", { class: "pick", onclick: () => act("heir", { x: p.id }) }, p.name))));
}

function viewDay() {
  const d = s.day;
  if (d.stage === "trial" || d.stage === "verdict") return viewTrial();
  // suçlanan → destekleyenler (ilki suçlayan); eşik `need`, Muhtar desteği oyu kadar.
  const pending = Object.entries(d.backers || {});
  const mine = pending.find(([, list]) => list.includes(m.pid));
  return {
    theme: "day",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, `${dayN(s.round)} · ${L("meydan", "square")}`), h("span", { style: "display:flex;gap:10px;align-items:center" }, bar("").lastChild, cardButton())),
      h("h1", {}, m.alive ? L("Kimden şüpheleniyorsun?", "Who do you suspect?") : L("Hayaletsin. Kim asılacak?", "You are a ghost. Who will hang?")),
      pending.length > 0 && h("div", { class: "stack" }, pending.map(([x, list]) => {
        const got = (d.support || {})[x] || list.length;
        const imIn = list.includes(m.pid);
        return h("div", { class: "callout" },
          h("span", { style: "flex-grow:1;display:flex;flex-direction:column;gap:6px" },
            h("small", {}, L(`SUÇLAMA · ${got}/${d.need} DESTEK`, `ACCUSATION · ${got}/${d.need} SUPPORT`)),
            h("span", { style: "font-size:17px" }, h("b", { style: "color:#F4B728" }, nameOf(x)), h("span", { style: "color:#C9C4DB" }, ` · ${list.map(nameOf).join(", ")}`)),
            h("span", { class: "meter-sm" }, h("span", { style: `width:${Math.min(100, Math.round((got / d.need) * 100))}%` }))),
          imIn ? h("span", { class: "mine" }, L("Destekliyorsun", "You back this"))
            : m.can.includes("second") && x !== m.pid && h("button", { onclick: () => act("second", { x }) }, L("Destekle", "Back")));
      })),
      h("div", { class: "rows" }, s.players.map((p) => {
        const accused = !!(d.backers || {})[p.id];
        const canAccuse = m.can.includes("accuse") && p.alive && p.id !== m.pid && !d.triedToday.includes(p.id);
        const canProphecy = m.can.includes("gvote") && p.alive;
        return h("div", { class: `row${p.alive ? "" : " dead"}` },
          h("span", { class: `av${p.isMuhtar ? " gold" : p.alive ? "" : " dead"}` }, initial(p.name)),
          h("span", { class: "who", style: p.id === m.pid ? "font-weight:600" : "" }, p.name),
          p.isMuhtar && h("span", { class: "badge" }, `Muhtar ×${s.muhtarWeight}`),
          accused && h("span", { class: "note" }, L("suçlandı", "accused")),
          d.triedToday.includes(p.id) && h("span", { class: "note" }, L("beraat", "acquitted")),
          !p.alive && h("span", { class: "note", style: "color:var(--muted)" }, `${(ROLE[p.role] || {}).name || ""} · ${L("öldü", "dead")}`),
          canAccuse && h("button", { onclick: () => act("accuse", { x: p.id }) }, L("Suçla", "Accuse")),
          canProphecy && h("button", { onclick: () => act("gvote", { x: p.id }) }, m.myProphecy === p.id ? L("Kehanetim ✓", "My prophecy ✓") : L("Kehanet", "Prophecy")));
      })),
      h("p", { class: "muted" }, mine
        ? L(`Desteğin ${nameOf(mine[0])} üzerinde. Başkasını suçlarsan ya da desteklersen desteğin oraya geçer.`, `You back the accusation against ${nameOf(mine[0])}. Accuse or back someone else and your support moves there.`)
        : L(`Birini suçla. Destek ${d.need}'e ulaşınca dava açılır; Muhtar'ın desteği ${s.muhtarWeight} sayılır.`, `Accuse someone. A trial opens at ${d.need} support; the Muhtar's support counts ${s.muhtarWeight} times.`)),
      h("div", { class: "stack push" },
        m.can.includes("will") && willBox(),
        m.can.includes("closeDay") && h("button", { class: "btn", onclick: () => cmd("closeDay") }, L("Günü kapat, geceye geç", "Close the day, bring the night")))),
  };
}

function viewTrial() {
  const t = s.day.trial;
  const w = s.day.weights || {};
  const voters = alive().filter((p) => s.rules.accusedVotes || p.id !== t.accused);
  const total = voters.reduce((n, p) => n + (w[p.id] || 1), 0);
  let g = 0, ng = 0;
  for (const [id, v] of Object.entries(t.verdicts)) (v ? (g += w[id] || 1) : (ng += w[id] || 1));
  const need = Math.floor(total / 2) + 1;
  const mine = t.verdicts[m.pid];
  const isAccused = m.pid === t.accused;
  const supporters = (t.backers || [t.seconder]).filter((b) => b !== t.accuser).map(nameOf).join(", ");
  // Muhtar suçlayınca desteği iki sayılır; başka destekçi olmayabilir.
  const header = h("span", { class: "muted" }, supporters
    ? L(`${nameOf(t.accuser)} suçladı · destek: ${supporters}`, `${nameOf(t.accuser)} accused · backed by ${supporters}`)
    : L(`${nameOf(t.accuser)} suçladı`, `${nameOf(t.accuser)} accused`));
  let main;
  if (s.day.stage === "trial") {
    main = h("div", { class: "dawn-hero" },
      header,
      h("h1", {}, isAccused ? L("Savunma sırası sende.", "Your turn to defend.") : L(`${nameOf(t.accused)} savunuyor.`, `${nameOf(t.accused)} is defending.`)),
      h("p", {}, isAccused
        ? L("Masaya anlat. Bitince düğmeye bas, oylama açılsın.", "Tell the table. Press the button when you are done, and the vote opens.")
        : L("Dinle. Sanık bitirince ya da Muhtar derse oylama açılır.", "Listen. The vote opens when the accused is done or the Muhtar says so.")),
      m.can.includes("done") && h("button", { class: "btn", onclick: () => act("done") }, L("Savunmam bitti", "My defence is over")),
      m.can.includes("toVerdict") && !isAccused && h("button", { class: "ghost", onclick: () => cmd("toVerdict") }, L("Oylamaya geç", "Open the vote")));
  } else {
    main = h("div", { class: "stack", style: "flex-grow:1" },
      header,
      h("h1", { style: "font-size:clamp(48px,15vw,64px)" }, L(`${nameOf(t.accused)} asılsın mı?`, `Hang ${nameOf(t.accused)}?`)),
      h("div", { class: "stack", style: "gap:8px" },
        h("div", { class: "tally" },
          h("span", { style: "color:var(--wax)" }, L(`assın ${g}`, `hang ${g}`)),
          h("span", { class: "muted" }, L(`${need} olursa asılır · toplam ${total}`, `${need} hangs · total ${total}`)),
          h("span", {}, L(`asmasın ${ng}`, `spare ${ng}`))),
        h("div", { class: "bar-v" }, h("span", { class: "g", style: `width:${(g / total) * 100}%` }), h("span", { class: "n", style: `width:${(ng / total) * 100}%` }), h("span", { class: "mid" }))),
      m.can.includes("verdict")
        ? h("div", { class: "stack", style: "flex-grow:1;justify-content:center;gap:12px" },
          h("button", { class: `verdict yes${mine === true ? " on" : ""}`, onclick: () => act("verdict", { y: true }) }, L("ASSIN", "HANG")),
          h("button", { class: `verdict no${mine === false ? " on" : ""}`, onclick: () => act("verdict", { y: false }) }, L("ASMASIN", "SPARE")))
        : h("p", { style: "flex-grow:1" }, isAccused
          ? L("Kendi davanda oy kullanmazsın. Köy karar veriyor.", "You do not vote in your own trial. The village decides.")
          : L("Oy hakkın yok; izliyorsun.", "You have no vote; you are watching.")),
      h("div", { class: "chips" }, voters.map((p) => {
        const v = t.verdicts[p.id];
        const mark = v === undefined ? " …" : v ? (w[p.id] > 1 ? " ✓✓" : " ✓") : " ✗";
        return h("span", { class: `chip${v === true ? " y" : v === false ? " n" : ""}` }, p.name + mark);
      })),
      // Biri oy vermeden masadan kalktıysa oyun burada kalmasın (bir dakika sonra açılır).
      m.can.includes("closeVerdict") && h("div", { class: "stack", style: "gap:6px" },
        h("button", { class: "ghost", onclick: () => cmd("closeVerdict") }, L("Oylamayı kapat", "Close the vote")),
        h("span", { class: "muted", style: "font-size:13px" }, L(
          `Oy vermeyen: ${voters.filter((p) => t.verdicts[p.id] === undefined).map((p) => p.name).join(", ")}. Verilmeyen oy “asmasın” sayılır.`,
          `Not voted: ${voters.filter((p) => t.verdicts[p.id] === undefined).map((p) => p.name).join(", ")}. A missing vote counts as “spare”.`))));
  }
  return {
    theme: "day",
    el: h("section", { class: "screen" }, h("div", { class: "bar" }, h("span", { class: "eyebrow" }, `${dayN(s.round)} · ${L("dava", "trial")}`), bar("").lastChild), main),
  };
}

function viewExecution() {
  const v = s.lastVerdict;
  const dead = v && s.players.find((p) => p.id === v.lynched);
  const ann = [...s.announcements].reverse().find((a) => a.kind === "verdict");
  return {
    theme: "day",
    el: h("section", { class: "screen" },
      bar(`${dayN(s.round)} · ${L("infaz", "execution")}`),
      h("div", { class: "dawn-hero" },
        h("span", { class: "mono muted", style: "letter-spacing:0.1em" }, `${L("KARAR", "VERDICT")} ${v ? `${v.guilty}–${v.notGuilty}` : ""}`),
        h("h1", {}, dead ? L(`${dead.name} asıldı.`, `${dead.name} was hanged.`) : L("Köy karar verdi.", "The village has decided.")),
        dead && wasLine(dead.role),
        ann && ann.will && h("div", { class: "will" }, h("span", { class: "eyebrow", style: "font-size:12px" }, L("Vasiyeti", "Last words")), h("q", {}, ann.will)),
        m.heirRight && heirPicker()),
      h("div", { class: "stack" },
        m.can.includes("nextRound")
          ? h("button", { class: "btn", onclick: () => cmd("nextRound") }, L("Geceye geç", "Bring the night"))
          : h("p", { class: "muted" }, L("Muhtar hazır olunca gece çöker.", "Night falls when the Muhtar is ready.")))),
  };
}

function viewEnd() {
  const won = s.winner === "koy" ? L("Köy kazandı.", "The village wins.") : L("Vampirler kazandı.", "The vampires win.");
  const BADGE = EN
    ? { kazanan: "winner", muhtar: "Muhtar", deli: "Fool's win", kahin: "Prophet" }
    : { kazanan: "kazanan", muhtar: "Muhtar", deli: "Deli zaferi", kahin: "Kâhin" };
  const badgeOf = (id) => (s.badges || []).filter((b) => b.playerId === id).map((b) => b.kind);
  return {
    theme: "night end",
    el: h("section", { class: "screen" },
      bar(L(`Oyun bitti · ${s.round}. gün`, `Game over · day ${s.round}`)),
      h("h1", { class: "hero", style: "font-size:clamp(56px,19vw,76px)" }, won),
      s.deliWon && h("p", {}, L("Deli de asılarak kendi zaferini aldı.", "The fool was hanged and wins too.")),
      h("div", { class: "rows" }, s.players.map((p) =>
        h("div", { class: "row" },
          h("span", { class: "who", style: "flex-grow:1" }, p.name + (p.id === m.pid ? YOU() : "")),
          badgeOf(p.id).filter((b) => b !== "kazanan").map((b) => h("span", { class: "note", style: "color:var(--gold)" }, BADGE[b])),
          h("span", { style: p.role === "vampir" ? "color:#E8A39C;font-weight:600" : "color:var(--soft)" }, ((ROLE[p.role] || {}).name || "").toLocaleLowerCase(LOC)),
          s.points && h("span", { class: "mono", style: "min-width:34px;text-align:right;color:var(--gold)" }, `+${s.points[p.id] || 0}`)))),
      m.standing && h("a", { class: "ledger", href: `/e/${s.tournament.code}`, style: "text-decoration:none;color:inherit" },
        h("span", { class: "t" }, L(`● ${tourTitle(s.tournament).toLocaleUpperCase(LOC)}`, `● ${tourTitle(s.tournament).toLocaleUpperCase(LOC)}`)),
        h("span", {}, L(
          `Bu oyun +${m.standing.points} puan. Toplamın ${m.standing.total}, sıran ${m.standing.rank} / ${m.standing.of}.`,
          `This game +${m.standing.points} points. Your total is ${m.standing.total}, you are ${m.standing.rank} of ${m.standing.of}.`)),
        h("span", { class: "muted" }, L("Puan tablosu →", "Leaderboard →"))),
      // İfşa kartı: önizleme + açıkça düğme olan alt satır (telefon testi: kartın
      // dokunulabilir olduğu anlaşılmıyordu).
      h("button", { class: "reveal-cta", onclick: () => { showIfsa = true; showSeal = false; render(); } },
        h("span", { class: "t" }, L("● İFŞA PARTİSİ", "● REVEAL PARTY")),
        h("span", { class: "reveal-title" }, L("Kim, ne zaman, ne yaptı?", "Who did what, and when?")),
        h("span", { class: "preview" }, previewLines().map((t) => h("span", {}, t))),
        h("span", { class: "open-row" }, h("span", {}, L("Hikâyenin tamamı", "The whole story")), h("span", { "aria-hidden": "true" }, "→"))),
      h("button", { class: "btn push", onclick: newRoom }, L("Yeni oda", "New room"))),
  };
}

function newRoom() {
  store.del("zkoy.session");
  session = null;
  s = m = null;
  showIfsa = showSeal = false;
  draft.code = "";
  history.replaceState(null, "", "/");
  render();
}

/* ── ifşa partisi + mühür ayrıntısı (tasarım 21-22) ── */

/** Sunucu hikâyeyi iki dilde yazar. */
const storyOf = () => (EN && s.storyEn ? s.storyEn : s.story) || [];

/** İfşa kartındaki önizleme: gecelerin ilk iki satırı. */
function previewLines() {
  const lines = storyOf().filter((c) => c.kind === "night").flatMap((c) => c.lines.map((l) => l.text));
  return lines.slice(0, 2);
}

const sealDot = (sealed) => h("span", { class: `sdot${sealed ? "" : " open"}`, title: sealed ? L("mühürlendi", "sealed") : L("zincire gidiyor", "on its way to chain") });

/** Gece gece, gün gün hikâye; oyun sonu ekranında ve ifşa görünümünde ortak. */
function storyBlock() {
  const story = storyOf();
  if (story.length === 0) return h("p", { class: "muted" }, L("Hikâye hazırlanıyor…", "Preparing the story…"));
  return h("div", { class: "stack", style: "gap:12px" },
    h("div", { class: "story" }, story.map((c) => h("div", { class: "chapter" },
      h("span", { class: "mono muted ch" }, c.title.toLocaleUpperCase(LOC)),
      c.lines.map((l) => h("div", { class: "sline" }, sealDot(l.sealed), h("span", {}, l.text)))))),
    h("p", { class: "muted", style: "font-size:13px" }, s.seals.pending
      ? L(`Kırmızı nokta = mühürlendi. Boş nokta = zincire gidiyor (${s.seals.pending} hamle yolda).`, `Red dot = sealed. Empty dot = on its way to chain (${s.seals.pending} moves on the way).`)
      : L("Kırmızı nokta = o hamle oyun sırasında mühürlendi. Sonradan kimse değiştiremez.", "Red dot = that move was sealed during the game. Nobody can change it afterwards.")));
}

function viewIfsa() {
  const pending = s.seals.pending;
  // Sunucunun "uydu" demesi yetmez: açılan kilit, bu telefonun lobide gördüğü kilit olmalı.
  const seen = store.get(commitKey(s.code));
  const lockOk = !!(s.reveal && s.reveal.seedOk) && (!seen || seen === s.reveal.commit);
  const KV = EN ? ["draw", "secret", "lock", "viewing key"] : ["kura", "sır", "kilit", "görüntüleme anahtarı"];
  const sealBox = h("div", { class: "stack", style: "gap:12px" },
    h("div", { class: `okbox${lockOk ? "" : " warn"}` },
      h("b", {}, lockOk ? L("✓ Kura dürüst çekildi", "✓ The draw was fair") : L("Kura doğrulanamadı", "The draw could not be verified")),
      h("span", {}, lockOk
        ? L("Kuranın kilidi oda kurulurken belirlendi ve lobide bu telefona geldi. Roller, o kilitli sır ile her telefonun kendi kattığı sayıdan çekildi: dağıtımı kimse tek başına seçemezdi. Oyun bitince sır açıldı ve kilide uydu.",
          "The lock on the draw was set when the room was created and reached this phone in the lobby. The roles were drawn from that locked secret and a number each phone added, so nobody could choose the deal alone. When the game ended the secret was revealed, and it matches the lock.")
        : L("Oyun sonunda açılan sır, lobide gösterilen kilide uymuyor. Bu oyunun kurası doğrulanamadı.",
          "The secret revealed at the end does not match the lock shown in the lobby. This game's draw could not be verified."))),
    h("div", { class: "will" },
      h("b", {}, L(`${s.seals.memoCount} hamle · ${s.seals.txCount} mühür paketi`, `${s.seals.memoCount} moves · ${s.seals.txCount} seal transactions`)),
      h("span", { class: "muted", style: "font-size:15px" }, pending
        ? L(`${pending} hamle daha zincire gidiyor; birkaç dakika içinde oturur.`, `${pending} more moves are on their way to chain; they settle within a few minutes.`)
        : L("Her gece hamlesi, her oy ve vasiyet Zcash ağına gizli notlar olarak yazıldı. Oyunun özet mührü hepsini tek parmak iziyle bağlar.",
          "Every night move, every vote and all last words were written to the Zcash network as shielded memos. The game's root seal ties them all to one fingerprint."))),
    h("details", { class: "tech" },
      h("summary", {}, L("Teknik ayrıntı", "Technical details")),
      h("div", { class: "mono" },
        h("p", { class: "muted", style: "font-family:var(--b-font)" }, L(
          "Kendin doğrula: sha256(sır) kilide eşit olmalı; kura, sır ile oyuncuların kattığı sayılardan türer. Görüntüleme anahtarıyla odanın bütün hamleleri herhangi bir Zcash cüzdanında okunur. Oyunun tamamını kurallarla yeniden oynatıp sınayan komut ve bu oyunun kaydı:",
          "Check it yourself: sha256(secret) must equal the lock, and the draw follows from the secret and the numbers the players added. With the viewing key, any Zcash wallet can read every move of the room. The command that replays the whole game by the rules, and this game's record:")),
        h("p", {}, `bun tools/verify.ts ${location.origin}/g/${s.code}.json`),
        s.reveal && [
          [KV[0], String(s.reveal.seed)],
          [KV[1], String(s.reveal.salt)],
          [KV[2], String(s.reveal.commit)],
          [KV[3], String(s.reveal.ufvk)],
        ].map(([k, v]) => h("div", { class: "kvcopy" },
          h("span", {}, k),
          h("code", {}, v),
          h("button", { class: "link", onclick: () => copyText(v, L(`${k} kopyalandı.`, `${k} copied.`)) }, L("kopyala", "copy")))),
        s.seals.recent.map((t) => h("div", {}, `${L("paket", "tx")}  ${t}`)),
        h("div", {}, `${L("ağ", "network")}  ${s.seals.chain === "zingo" ? "Zcash testnet" : L("deneme (zincirsiz)", "demo (no chain)")}`))));
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" },
        h("button", { class: "ghost small", onclick: () => { showIfsa = false; showSeal = false; render(); } }, L("← Sonuç", "← Result")),
        h("span", { class: "seal" }, pending ? L(`● ${pending} yolda`, `● ${pending} on the way`) : L("● hepsi mühürlü", "● all sealed"))),
      h("h1", {}, showSeal ? L("Bu oyun zincirde.", "This game is on chain.") : L("Kim, ne zaman, ne yaptı?", "Who did what, and when?")),
      showSeal ? sealBox : storyBlock(),
      h("button", { class: "ghost push", onclick: () => { showSeal = !showSeal; render(); } }, showSeal ? L("← Hikâyeye dön", "← Back to the story") : L("Mühür ayrıntısı ▸", "Seal details ▸"))),
  };
}

/* ── perde: ?perde=KOD ── */

function viewScreen() {
  if (!s) return { theme: "night screen-mode", el: h("section", { class: "screen" }, h("h1", {}, L("Perde bağlanıyor…", "Connecting the screen…"))) };
  const day = ["DAWN", "DAY", "EXECUTION"].includes(s.phase);
  return {
    theme: `${day ? "day" : "night"} screen-mode`,
    el: h("section", { class: "screen" },
      bar(`${PHASE[s.phase]} · ${s.round || ""} · ${L("oda", "room")} ${s.code}`),
      h("div", { class: "stage" },
        h("div", { class: "stack" },
          h("h1", {}, s.phase === "LOBBY" ? `zkoy.fun/j/${s.code}` : PHASE[s.phase]),
          s.phase === "LOBBY" && h("div", { class: "qr", html: qrSvg(`${location.origin}/j/${s.code}`) }),
          h("div", { class: "rows" }, s.players.map((p) => h("div", { class: `row${p.alive ? "" : " dead"}` },
            h("span", { class: `av${p.isMuhtar ? " gold" : ""}` }, initial(p.name)), h("span", { class: "who" }, p.name),
            p.isMuhtar && h("span", { class: "badge" }, "Muhtar"), !p.alive && p.role && h("span", { class: "note" }, (ROLE[p.role] || {}).name))))),
        h("div", { class: "feed" }, [...s.announcements].reverse().slice(0, 8).map((a) => h("div", {}, annText(a)))))),
  };
}

/* ── puan tablosu: /e/KOD ── */

/** Son okunan tablo (`/e/KOD.json`), okunamadıysa nedeni, bu telefonun tablodaki kimliği. */
let tb = null;
let tbErr = null;
let meTag = null;

/** Sunucunun tabloda kullandığı kısa kimlik: sha256("zkoy-device:" + cihaz) ilk 10 hane. */
async function deviceTagOf(d) {
  if (!crypto.subtle) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`zkoy-device:${d}`));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 10);
}

async function pollBoard() {
  if (document.visibilityState === "visible" || !tb) {
    try {
      const res = await fetch(`/e/${boardCode}.json`, { cache: "no-store" });
      if (res.status === 404) tbErr = "yok";
      else if (!res.ok) throw new Error(String(res.status));
      else { tb = await res.json(); tbErr = null; }
    } catch { tbErr = tb ? null : "ag"; online = false; }
    if (!tbErr) online = true;
    render();
  }
  if (tbErr !== "yok") setTimeout(pollBoard, 5000);
}

function startBoard() {
  deviceTagOf(device).then((t) => { meTag = t; render(); }).catch(() => {});
  render();
  pollBoard();
}

const prizeText = (usd) => L(`${usd} $ ZEC`, `$${usd} in ZEC`);
const sameScore = (a, b) => a.points === b.points && a.wins === b.wins && a.games === b.games;

function viewBoard() {
  const wrap = (...kids) => ({ theme: "night board", el: h("section", { class: "screen bd" }, ...kids) });
  const plain = () => h("div", { class: "bar" }, h("span", { class: "eyebrow" }, L("ZKöy · puan tablosu", "ZKöy · leaderboard")), langButton());
  if (tbErr === "yok") return wrap(plain(), h("h1", {}, L("Böyle bir turnuva yok.", "There is no such tournament.")),
    h("a", { class: "link", href: "/" }, L("Oyuna dön", "Back to the game")));
  if (!tb) return wrap(plain(), h("h1", {}, tbErr ? NO_LINK() : L("Tablo yükleniyor…", "Loading the board…")));

  const title = EN ? tb.titleEn : tb.title;
  const now = Date.now();
  const before = now < tb.from;
  const over = now > tb.to;
  const day = new Date(tb.from).toLocaleDateString(LOC, { day: "numeric", month: "long" });
  const rows = tb.board;
  const prizes = tb.prizesUsd || [];
  const top = Math.min(Math.max(prizes.length, 3), rows.length);
  const me = meTag && rows.find((r) => r.id === meTag);
  const sealedGames = tb.games.filter((g) => g.gameroot).length;
  const pendingGames = tb.games.length - sealedGames;
  document.title = `${title} · ZKöy`;

  // Kura yalnız ödülü belirleyen sırada söylenir: ilk üçteki biri, birebir eşit biriyle kurayla ayrıldıysa.
  const tiedWith = (r) => rows.filter((x) => sameScore(x, r)).length;
  const podium = rows.slice(0, top).map((r, i) => h("div", { class: `bd-p${i === 0 ? " first" : ""}${r.id === meTag ? " me" : ""}` },
    h("span", { class: "r" }, r.rank),
    h("span", { class: "mid" },
      h("span", { class: "who" }, r.name + (r.id === meTag ? YOU() : "")),
      h("span", { class: "pz" }, [
        prizes[i] != null ? prizeText(prizes[i]) : null,
        many(r.games, "oyun", "game"),
        many(r.wins, "galibiyet", "win"),
        tiedWith(r) > 1 ? L(`kurayla · ${tiedWith(r)} kişi eşitti`, `by draw · ${tiedWith(r)} tied`) : null,
      ].filter(Boolean).map((t) => t.replace(/ /g, " ")).join(" · "))),
    h("span", { class: "pt" }, r.points)));

  const rest = rows.slice(top);
  const cols = rest.length > 30 ? 3 : 2;
  const list = h("section", { class: "bd-list", style: `--rows:${Math.ceil(rest.length / cols)};--cols:${cols}` },
    rest.map((r) => h("div", { class: `bd-li${r.id === meTag ? " me" : ""}` },
      h("span", { class: "r" }, r.rank),
      h("span", { class: "who" }, r.name + (r.id === meTag ? YOU() : "")),
      h("span", { class: "pt" }, r.points))));

  // Telefondan bakan oyuncuya kendi yeri, ödül sırasına uzaklığıyla.
  let mine = null;
  if (me) {
    const last = rows[Math.min(prizes.length || 3, rows.length) - 1];
    mine = h("p", { class: "bd-me" }, me.rank <= (prizes.length || 3)
      ? L(`Sen ${me.rank}. sıradasın, ${me.points} puan. Şu an ödül sırasındasın.`, `You are ${me.rank}${ord(me.rank)} with ${many(me.points, "puan", "point")}. You are in the prizes right now.`)
      : last.points > me.points
        ? L(`Sen ${me.rank}. sıradasın, ${me.points} puan. Ödül sırasına ${last.points - me.points} puan uzaktasın.`, `You are ${me.rank}${ord(me.rank)} with ${many(me.points, "puan", "point")}, ${last.points - me.points} behind the prizes.`)
        : L(`Sen ${me.rank}. sıradasın, ${me.points} puan. Ödül sırasındakiyle puanın eşit; eşitlik kuralı ayırdı.`, `You are ${me.rank}${ord(me.rank)} with ${many(me.points, "puan", "point")}, level with the last prize; the tie rule split you.`));
  }

  const P = tb.points;
  const status = before
    ? L(`${day} açılır`, `opens ${day}`)
    : over
      ? L(`son tablo · ${many(tb.games.length, "oyun", "game")}`, `final · ${many(tb.games.length, "game", "game")}`)
      : [L(`● ${tb.liveTables} masa açık`, `● ${tb.liveTables} ${tb.liveTables === 1 ? "table" : "tables"} open`),
        many(tb.games.length, "oyun bitti", "game") + (EN ? " done" : ""),
        pendingGames ? L(`${pendingGames} mühür yolda`, `${pendingGames} on the way to chain`) : null].filter(Boolean).join(" · ");

  return wrap(
    h("header", { class: "bd-head" },
      h("div", {},
        h("span", { class: "eyebrow" }, L("ZKöy · puan tablosu", "ZKöy · leaderboard"), tb.test ? L(" · prova, sayılmaz", " · rehearsal, does not count") : ""),
        h("h1", {}, title)),
      h("div", { class: "bd-tools" }, h("span", { class: `seal${online ? "" : " off"}` }, online ? status : NO_LINK()), langButton())),
    mine,
    rows.length === 0
      ? h("div", { class: "bd-empty" },
        h("p", {}, before
          ? L(`Turnuva ${day} günü açılır. İlk oyun bitince puanlar burada.`, `The tournament opens on ${day}. Points appear here when the first game ends.`)
          : L("Henüz biten oyun yok. İlk masa bitince puanlar burada.", "No game has ended yet. Points appear here when the first table ends.")))
      : [h("section", { class: "bd-podium" }, podium), list],
    h("footer", { class: "bd-foot" },
      h("span", {}, h("b", {}, P.win), L(" kazanan takım", " winning side")),
      h("span", {}, h("b", {}, P.alive), L(" sona kadar hayatta", " alive at the end")),
      h("span", {}, h("b", {}, P.fool), L(" Deli asılırsa", " the Fool hanged")),
      h("span", {}, h("b", {}, P.prophecy), L(" hayaletin doğru tahmini", " each right ghost prophecy")),
      h("span", { class: "tie" }, L("Eşitlikte galibiyet, sonra az oyun, sonra zincirdeki mühürlerden kura.", "Ties: more wins, then fewer games, then a draw from the seals on chain."))),
    tb.games.length > 0 && h("details", { class: "tech bd-games" },
      h("summary", {}, L("Tabloyu kendin topla", "Add the board up yourself")),
      h("div", { class: "mono" },
        h("p", { class: "muted", style: "font-family:var(--b-font)" }, L(
          "Her oyunun bütün hamleleri Zcash ağında mühürlü. Aşağıdaki komut bir oyunu kurallarla baştan oynatır ve her oyuncunun puanını yazar; hepsini toplayınca bu tablo çıkar.",
          "Every move of every game is sealed on the Zcash network. The command below replays one game by the rules and prints each player's points; adding them all up gives this board.")),
        h("p", {}, `bun tools/verify.ts ${location.origin}/g/${tb.games[0].code}.json`),
        tb.games.map((g) => h("div", {},
          h("a", { class: "link", href: `/g/${g.code}.json`, style: "min-height:32px;font-size:12px" }, g.code), "  ",
          `${many(g.players, "oyuncu", "player")} · ${g.winner === "koy" ? L("köy", "village") : g.winner === "vampir" ? L("vampirler", "vampires") : "?"}`,
          g.gameroot ? "" : L(" · mühür yolda", " · seal on the way"))))));
}

const ord = (n) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

if (boardCode) startBoard();
else connect();
render();
