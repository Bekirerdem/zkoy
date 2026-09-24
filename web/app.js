// ZKöy web istemcisi (A · Fener). Tek WebSocket, sunucu sözleşmesi docs/API.md.
// Derleme adımı yok; her değişimde ekran baştan çizilir, açık olan alan korunur.
"use strict";

/* ── küçük yardımcılar ── */

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

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

const ROLE = {
  vampir: {
    name: "Vampir", tag: "GECE · AV",
    text: "Köyü içeriden avlarsın. Sayınız köyün geri kalanına eşitlenince kazanırsınız.",
    steps: ["Ebe “gece çöküyor” deyince telefonuna bak.", "Takımınla aynı kurbanı seç; takımının seçimini ekranda görürsün.", "Sabah sakin ol. Gündüz köylü gibi konuş, suçu başkasına at."],
  },
  doktor: {
    name: "Doktor", tag: "GECE · KORUMA",
    text: "Köyün hayat sigortasısın. Koruduğun kişi o gece ölmez.",
    steps: ["Ebe “gece çöküyor” deyince telefonuna bak.", "Birini koru; kendini de koruyabilirsin.", "Doktor olduğunu belli etme, vampirlerin ilk hedefi olursun."],
  },
  gozcu: {
    name: "Gözcü", tag: "GECE · SORGU",
    text: "Gece birine bakarsın: vampir mi, değil mi. Yalnız sen öğrenirsin.",
    steps: ["Ebe “gece çöküyor” deyince telefonuna bak.", "Birini sorgula; cevap sabah ekranında.", "Bildiğini gündüz akıllıca kullan; açık edersen avlanırsın."],
  },
  deli: {
    name: "Deli", tag: "GÜNDÜZ · OYUN",
    text: "Köy seni asarsa sen de kazanırsın, kim kazanırsa kazansın.",
    steps: ["Gece uyursun, telefonun “köy uyuyor” der.", "Gündüz şüpheli görün ama belli etme.", "Asılırsan zafer senin."],
  },
  koylu: {
    name: "Köylü", tag: "GÜNDÜZ · AKIL",
    text: "Gece uyursun. Gündüz konuşur, dinler, doğru kişiyi asarsın.",
    steps: ["Gece gözlerini kapat, telefonun “köy uyuyor” der.", "Gündüz konuş, dinle, çelişkileri yakala.", "Doğru kişiyi suçla; bütün vampirler asılınca köy kazanır."],
  },
};

/** İlk açılış: köyün 5 kuralı (tasarım 13-17). */
const RULES = [
  { theme: "night", title: "Kim kimdir?", lead: "Rolünü yalnız sen bilirsin. Masadakiler tahmin eder.", roles: true },
  { theme: "night rule-night", big: "gece", title: "Herkes gözünü kapatır.", lines: [["Vampirler", "bir kurban seçer.", "#F2D9D5"], ["Doktor", "birini korur.", "#D7F0E6"], ["Gözcü", "birine bakar.", "#E1DBFA"]], foot: "Hepsi telefondan, sessizce. Rolü olmayanın ekranında yalnız “Köy uyuyor” yazar; kimin hamle yaptığını ekrandan kimse anlayamaz." },
  { theme: "day", title: "Gündüz dava kurulur.", steps: [["Suçla.", "Şüphelendiğin kişiye dokun."], ["Destek gelsin.", "Biri daha desteklerse dava açılır."], ["Savunma.", "Sanık konuşur, kimse sözünü kesmez."], ["Açık oy.", "Assın ya da asmasın. Oylar herkesin ekranında."], ["Yarıyı geçerse asılır", "ve rolü açıklanır. Geçmezse beraat eder, o gün bir daha yargılanmaz."]], foot: "Sanık kendi davasında oy kullanmaz. Gün bitince Muhtar geceye geçirir." },
  { theme: "day dawn", badge: "Muhtar ×2", title: "Köyün bir Muhtarı var.", lines: [["", "Oyunun başında seçilir. Aday çıkmazsa kura çekilir."], ["", "Davada oyu iki sayılır (13 ve üstü oyuncuda üç)."], ["", "Günü yönetir: güne geçer, oylamayı açar, günü kapatır."], ["", "Ölürse makamı birine bırakır."]], foot: "Muhtar bir makam, rol değil. Vampir de Muhtar olabilir." },
  { theme: "night end", title: "Kim kazanır?", win: true },
];
/** "O bir ___." — ünlü uyumu elle. */
const WAS = { vampir: "vampirdi", doktor: "doktordu", gozcu: "gözcüydü", deli: "deliydi", koylu: "köylüydü" };
const PHASE = { LOBBY: "Oda", ELECTION: "Seçim", NIGHT: "Gece", DAWN: "Şafak", DAY: "Meydan", EXECUTION: "İnfaz", END: "Son" };

/* ── durum ── */

const params = new URLSearchParams(location.search);
const pathCode = (location.pathname.match(/^\/j\/([A-Za-z0-9]{4,8})/) || [])[1];
const watchCode = params.get("perde");
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

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  else toast("Bağlantı yok, yeniden bağlanıyor…");
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
      send({ t: "hello", device });
      send({ t: "watch", code: watchCode.toUpperCase() });
    } else if (session) send({ t: "hello", device, code: session.code, token: session.token });
    else send({ t: "hello", device });
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
    } else if (f.t === "me") {
      m = f.m;
    } else if (f.t === "error") {
      if (/oturum geçersiz|böyle bir oda yok/.test(f.e) && session) {
        store.del("zkoy.session");
        session = null;
        s = m = null;
      }
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
  if (watchCode) [view, key] = [viewScreen(), "perde"];
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
  document.body.className = view.theme;
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
  const head = (dark) => h("div", { class: "bar" }, h("span", { class: "mono", style: `font-size:12px;letter-spacing:0.1em;color:${dark ? "var(--gold)" : "#8A5F00"}` }, "EBE ANLATIYOR"), bar("").lastChild);
  if (e.kind === "sec") {
    const facts = [
      ["01", h("span", {}, "Muhtar'ın oyu davada ", h("b", {}, s.muhtarWeight === 3 ? "üç" : "iki"), " sayılır.")],
      ["02", "Günü o yönetir: güne geçer, oylamayı açar, günü kapatır."],
      ["03", "Ölürse makamı birine bırakır. Vampir de Muhtar olabilir."],
    ];
    return {
      theme: "night ebe-sec",
      el: h("section", { class: "screen" }, head(true),
        h("div", { class: "dawn-hero" },
          h("span", { class: "mono muted", style: "letter-spacing:0.1em" }, "ROLLER DAĞITILDI"),
          h("h1", { class: "ebe-title" }, "Önce bir Muhtar seçin."),
          h("div", { class: "facts" }, facts.map(([n, t]) => h("div", {}, h("span", { class: "mono", style: "color:var(--gold)" }, n), h("span", {}, t)))),
          h("p", { class: "muted" }, "Aday olmak isteyen elini kaldırsın. Aday çıkmazsa kura çekilir.")),
        h("button", { class: "btn", onclick: done }, "Seçime geç")),
    };
  }
  if (e.kind === "gece") {
    const actor = ["vampir", "doktor", "gozcu"].includes(m.role);
    return {
      theme: "night ebe-gece",
      el: h("section", { class: "screen" }, head(true),
        h("div", { class: "dawn-hero", style: "align-items:center;text-align:center" },
          h("div", { class: "lantern dim", "aria-hidden": "true" }),
          h("span", { class: "mono muted", style: "letter-spacing:0.1em" }, `${s.muhtar ? `MUHTAR: ${nameOf(s.muhtar).toLocaleUpperCase("tr")} · ` : ""}${s.round}. GECE`),
          h("h1", { class: "ebe-title big" }, "Gece çöküyor."),
          h("p", { style: "max-width:300px;font-size:18px" }, "Herkes gözlerini kapatsın. Rolü olan telefonuna baksın, kimse konuşmasın."),
          h("p", { class: "muted", style: "max-width:290px" }, actor ? "Senin bu gece bir hamlen var. Sessizce yap, sonra telefonu masaya bırak." : "Sabah olunca telefonun titrer. O zamana kadar masaya bırak.")),
        h("button", { class: actor ? "btn" : "ghost", onclick: done }, actor ? "Hamleme geç" : "Gözlerim kapalı")),
    };
  }
  const t = s.day.trial;
  const mine = t.accused === m.pid;
  return {
    theme: "day",
    el: h("section", { class: "screen" }, head(false),
      h("div", { class: "dawn-hero" },
        h("span", { class: "mono", style: "letter-spacing:0.1em;color:var(--wax)" }, `${s.round}. GÜN · DAVA AÇILDI`),
        h("h1", { class: "ebe-title" }, mine ? "Dava sana açıldı." : `${nameOf(t.accused)} yargılanıyor.`),
        h("div", { class: "will" },
          h("div", { class: "kv" }, h("span", { class: "muted" }, "Suçlayan"), h("b", {}, nameOf(t.accuser))),
          h("div", { class: "kv" }, h("span", { class: "muted" }, "Destekleyen"), h("b", {}, nameOf(t.seconder)))),
        h("p", { style: "font-size:18px" }, mine
          ? "Şimdi sen konuşuyorsun. Masaya kendini savun; bitince “Savunmam bitti”ye bas, oylama açılsın."
          : `Şimdi ${nameOf(t.accused)} konuşuyor. Sözünü kesmeyin. Savunması bitince ya da Muhtar derse oylama açılır.`)),
      h("button", { class: "btn", onclick: done }, mine ? "Savunmaya geç" : "Dinliyorum")),
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
    body = h("div", { class: "stack" }, ["vampir", "koylu", "doktor", "gozcu", "deli"].map((k) =>
      h("div", { class: `rolebox ${k}` },
        h("span", { class: "rn" }, ROLE[k].name, k === "gozcu" ? h("small", {}, " 13+ oyuncuda") : k === "deli" ? h("small", {}, " 8+ oyuncuda") : null),
        h("span", {}, { vampir: "Gece takımıyla birini avlar. Gündüz köylü gibi davranır.", koylu: "Gece uyur. Gündüz konuşur, dinler, doğru kişiyi asar.", doktor: "Her gece birini korur, kendini de. Koruduğu ölmez.", gozcu: "Her gece birine bakar: vampir mi, değil mi.", deli: "Köy onu asarsa o da kazanır." }[k]))));
  } else if (r.steps) {
    body = h("div", { class: "rows" }, r.steps.map(([b, t], j) =>
      h("div", { class: "row step" }, h("span", { class: "mono", style: "color:var(--wax)" }, `0${j + 1}`), h("span", {}, h("b", {}, b), " ", t))));
  } else if (r.win) {
    body = h("div", { class: "stack" },
      h("div", { class: "rows" }, [["Köy", "Bütün vampirler asılınca.", ""], ["Vampirler", "Sayıları köyün geri kalanına eşitlenince.", "#F2D9D5"], ["Deli", "Köy onu asarsa, kim kazanırsa kazansın.", "#F6E7C0"]].map(([n, t, c]) =>
        h("div", { class: "row", style: "flex-direction:column;align-items:flex-start;gap:4px;padding:14px 0" }, h("span", { style: `font-family:var(--d-font);font-weight:800;font-size:22px;${c ? `color:${c}` : ""}` }, n), h("span", { class: "muted", style: "font-size:16px" }, t)))),
      h("div", { class: "ledger" }, h("span", { class: "t" }, "● MÜHÜR"), h("span", {}, "Her gece hamlesi ve her oy mühürlenir. Oyun bitince kim ne yaptı herkes görür; kimse “ben o gece onu seçmedim” diyemez.")));
  } else {
    body = h("div", { class: "stack", style: "gap:14px" },
      r.big && h("span", { class: "rule-big", "aria-hidden": "true" }, r.big),
      r.badge && h("span", { class: "badge", style: "align-self:flex-start;font-size:14px;padding:6px 12px" }, r.badge),
      h("div", { class: "stack", style: "gap:12px;font-size:17px" }, r.lines.map(([b, t, c]) => h("span", {}, b ? h("b", { style: c ? `color:${c}` : "" }, b + " ") : null, t))));
  }
  return {
    theme: r.theme,
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, `Köyün kuralları · ${i + 1} / ${RULES.length}`), !last && h("button", { class: "ghost small", onclick: closeRules }, "Atla")),
      h("h1", { class: "rule-title", style: r.win ? "color:var(--gold)" : "" }, r.title),
      r.lead && h("p", {}, r.lead),
      body,
      r.foot && h("p", { class: "muted" }, r.foot),
      h("div", { class: "rule-nav push" }, dots,
        i > 0 && h("button", { class: "ghost", onclick: back }, "Geri"),
        h("button", { class: "btn", onclick: next }, last ? "Hazırım" : "İleri"))),
  };
}

/* ── oda kurma (tasarım 18) ── */

function viewSetup() {
  const seg = (field, options) => h("div", { class: "seg", role: "radiogroup" }, options.map(([v, label]) =>
    h("button", { role: "radio", "aria-checked": String(setupRules[field] === v), class: setupRules[field] === v ? "on" : "", onclick: () => { setupRules[field] = v; render(); } }, label)));
  const create = () => {
    const name = (draft.name || "").trim();
    if (!name) { setup = false; render(); return toast("Önce adını yaz."); }
    send({ t: "create", name, rules: setupRules });
  };
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("button", { class: "ghost small", onclick: () => { setup = false; render(); } }, "← Geri"), h("span", { class: "eyebrow" }, "Oda kur")),
      h("h1", {}, "Masanın kuralları"),
      h("div", { class: "stack" },
        h("span", { class: "q" }, "Gözcü olsun mu?"),
        h("span", { class: "muted" }, "Küçük masada gözcü vampiri çabuk bulur."),
        seg("gozcu", [[null, "Otomatik"], [true, "Var"], [false, "Yok"]]),
        h("span", { class: "mono muted", style: "font-size:12px" }, "otomatik = 13 ve üstü oyuncuda var")),
      h("div", { class: "stack" },
        h("span", { class: "q" }, "Sanık kendi davasında oy kullansın mı?"),
        h("span", { class: "muted" }, "Kullanırsa sanık Muhtar kendini kurtarabilir."),
        seg("accusedVotes", [[false, "Hayır"], [true, "Evet"]])),
      h("div", { class: "stack push" },
        h("span", { class: "muted" }, "İlk oyunsa varsayılanlar iyi. Sonra değiştirirsiniz."),
        h("button", { class: "btn", onclick: create }, "Odayı kur"))),
  };
}

function bar(label) {
  const seals = s ? s.seals : null;
  return h("div", { class: "bar" },
    h("span", { class: "eyebrow" }, label),
    online
      ? seals && h("span", { class: "seal", title: "Zincire yazılan kayıtlar" }, `● ${seals.memoCount} mühür${seals.pending ? ` · ${seals.pending} yolda` : ""}`)
      : h("span", { class: "offline" }, "bağlantı koptu…"));
}

const nameOf = (id) => (s.players.find((p) => p.id === id) || {}).name || "?";
const alive = () => s.players.filter((p) => p.alive);
const initial = (n) => n.slice(0, 1).toLocaleUpperCase("tr");

function viewEntry() {
  const create = () => {
    const name = document.getElementById("ad").value.trim();
    if (!name) {
      document.getElementById("ad").focus();
      return toast("Önce adını yaz.");
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
      return toast("Önce adını yaz.");
    }
    if (code.length < 4) {
      document.getElementById("kod").focus();
      return toast("Oda kodunu yaz.");
    }
    store.set("zkoy.name", name);
    send({ t: "join", code, name });
  };
  const joining = !!draft.code;
  return {
    theme: "night entry",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow mono" }, "Vampir Köylü"), h("span", { class: "muted mono" }, "zkoy.fun")),
      h("div", { class: "entry-hero" },
        h("div", { class: "lantern", "aria-hidden": "true" }),
        h("h1", { class: "hero" }, "ZKöy"),
        h("p", {}, "Köy uyuyor. Aranızda vampir var. Her gece, her oy mühürleniyor.")),
      h("div", { class: "stack" },
        h("label", { class: "lbl", for: "ad" }, "ADIN"),
        h("input", { id: "ad", maxlength: "16", autocomplete: "nickname", placeholder: "Masada seni ne diye çağırıyorlar?", value: draft.name, oninput: (e) => (draft.name = e.target.value) }),
        joining
          ? h("button", { class: "btn", onclick: join }, `${draft.code} odasına otur`)
          : h("button", { class: "btn", onclick: create }, "Oda kur"),
        h("div", { class: "duo" },
          h("label", { class: "sr", for: "kod" }, "Oda kodu"),
          h("input", { id: "kod", class: "code", maxlength: "8", placeholder: "ODA KODU", value: draft.code, oninput: (e) => (draft.code = e.target.value.toUpperCase()) }),
          joining ? h("button", { class: "ghost gold", onclick: () => { draft.code = ""; history.replaceState(null, "", "/"); render(); } }, "Oda kur") : h("button", { class: "ghost gold", onclick: join }, "Gir")),
        h("div", { class: "bar", style: "justify-content:center;gap:16px" },
          h("span", { class: "muted" }, "QR'ı okuttuysan kod hazır gelir."),
          h("button", { class: "link", onclick: () => { rulesStep = 0; render(); } }, "Nasıl oynanır?")))),
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

function viewLobby() {
  const link = `${location.origin}/j/${s.code}`;
  const n = s.players.length;
  const c = composition(Math.max(n, 7), s.rules);
  const chip = (cls, text) => h("span", { class: `chip-role ${cls}` }, text);
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, "Oda"), h("button", { class: "ghost small", onclick: () => { rulesStep = 0; render(); } }, "Nasıl oynanır?")),
      h("div", { class: "lobby-head" },
        h("div", { class: "qr sm", html: qrSvg(link), role: "img", "aria-label": `Katılım QR kodu: ${link}` }),
        h("div", { class: "stack", style: "gap:6px" },
          h("div", { class: "room-code" }, s.code),
          h("span", { class: "muted" }, "Okut ya da kodu yaz, masaya otur."),
          h("button", { class: "link", style: "align-self:flex-start", onclick: () => copyLink(link) }, "Linki kopyala"))),
      h("div", { class: "stack", style: "gap:8px" },
        h("span", { class: "eyebrow" }, n < 7 ? "7 kişi olunca masada" : "Bu masada"),
        h("div", { class: "chips" },
          chip("vampir", `${c.vampir} vampir`), chip("doktor", "1 doktor"),
          c.gozcu ? chip("gozcu", "1 gözcü") : chip("off", "gözcü yok"),
          c.deli ? chip("deli", "1 deli") : null,
          chip("koylu", `${c.koylu} köylü`)),
        h("span", { class: "muted", style: "font-size:13px" }, `Masa büyüdükçe dağılım kendiliğinden değişir. Sanık kendi davasında ${s.rules.accusedVotes ? "oy kullanır" : "oy kullanmaz"}.`)),
      h("div", { class: "bar" }, h("span", { style: "font-family:var(--d-font);font-weight:800;font-size:26px" }, "Masa"), h("span", { class: "mono muted" }, `${n} / 15 · en az 7`)),
      h("div", { class: "seats" }, s.players.map((p) =>
        h("div", { class: `seat${p.isHost ? " host" : ""}` },
          h("span", { class: `av${p.isHost ? " gold" : ""}` }, initial(p.name)),
          h("span", { style: p.id === m.pid ? "font-weight:600" : "" }, p.name + (p.id === m.pid ? " (sen)" : "")),
          p.isHost ? h("span", { class: "tag" }, "kurucu")
            : m.can.includes("kick") && h("button", { class: "x", "aria-label": `${p.name} masadan çıkar`, onclick: () => cmd("kick", { x: p.id }) }, "✕")))),
      h("div", { class: "stack push" },
        m.can.includes("start")
          ? h("button", { class: "btn", disabled: n < 7, onclick: () => cmd("start") }, n < 7 ? `${7 - n} kişi daha lazım` : "Köyü uyut, başlat")
          : h("p", { class: "muted" }, `${nameOf(s.hostPid)} başlatınca rol kartın gelecek. Telefonunu kimseye gösterme.`))),
  };
}

function copyLink(link) {
  const ok = () => toast("Link kopyalandı.");
  if (navigator.share) navigator.share({ title: "ZKöy", text: "Masaya otur:", url: link }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(link).then(ok, () => toast(link));
  else toast(link);
}

function viewCard() {
  const r = ROLE[m.role];
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, "Rolün · yalnız sen görüyorsun"), h("span", { class: "seal" }, "● mühürlendi")),
      h("div", { class: `card ${m.role}` },
        h("span", { class: "mono", style: "font-size:12px;letter-spacing:0.1em;opacity:0.8" }, r.tag),
        h("div", { class: "stack" }, h("h2", {}, r.name), h("p", {}, r.text)),
        m.team.length
          ? h("div", { class: "foot" }, h("span", { style: "font-size:13px;opacity:0.8" }, "Takımın"), h("span", { style: "font-family:var(--d-font);font-weight:600;font-size:24px" }, m.team.map(nameOf).join(", ")))
          : h("div", { class: "foot" }, h("span", { style: "font-size:13px;opacity:0.8" }, "Kimseye gösterme."))),
      h("div", { class: "stack", style: "gap:10px" },
        h("span", { class: "eyebrow" }, "Senin gecen böyle geçer"),
        r.steps.map((t, i) => h("div", { class: "facts one" }, h("div", {}, h("span", { class: "mono", style: "color:var(--wax-soft)" }, String(i + 1)), h("span", {}, t))))),
      h("button", { class: "ghost", onclick: () => { cardOpen = false; render(); } }, s.phase === "ELECTION" && !ebeSeen.has(`${s.code}:sec`) ? "Anladım, devam" : "Kartı kapat")),
  };
}

const cardButton = () => h("button", { class: "ghost", style: "min-height:40px;font-size:14px", onclick: () => { cardOpen = true; render(); } }, "Kartım");

function viewElection() {
  const total = alive().length;
  const mine = s.election.votes[m.pid];
  const missing = alive().filter((p) => !s.election.votes[p.id]).map((p) => p.name);
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, "Seçim · oyun başlamadan"), cardButton()),
      h("div", { class: "stack" }, h("h1", {}, "Köyün Muhtarı kim olsun?"), h("p", {}, `Muhtar'ın oyu ${s.muhtarWeight} sayılır, günü o yönetir. Vampir de seçilebilir.`)),
      s.election.candidates.length === 0 && h("p", { class: "muted" }, "Henüz aday yok. Aday olan olmazsa kura çekilir."),
      h("div", { class: "stack" }, s.election.candidates.map((c) => {
        const count = s.election.tally[c] || 0;
        return h("button", { class: `cand${mine === c ? " on" : ""}`, disabled: !m.can.includes("mvote"), onclick: () => act("mvote", { x: c }) },
          h("span", { class: `av${mine === c ? " gold" : ""}` }, initial(nameOf(c))),
          h("span", { style: "flex-grow:1" }, h("span", { style: "font-weight:600;font-size:18px" }, nameOf(c)), h("span", { class: "meter" }, h("span", { style: `width:${Math.round((count / total) * 100)}%` }))),
          h("span", { class: "n" }, count));
      })),
      mine && h("p", { class: "muted" }, `Senin oyun: ${nameOf(mine)}${missing.length ? ` · oy vermeyen: ${missing.join(", ")}` : ""}`),
      h("div", { class: "stack push" },
        m.can.includes("nominate") && h("button", { class: "ghost gold", onclick: () => act("nominate") }, "Ben de adayım"),
        m.can.includes("closeElection") && missing.length > 0 && h("button", { class: "ghost", onclick: () => cmd("closeElection") }, "Seçimi bitir (kurucu)"))),
  };
}

function viewNight() {
  const role = m.alive ? m.role : null;
  const acting = m.can.includes("night");
  let body;
  if (!acting) {
    body = h("div", { class: "entry-hero" },
      h("div", { class: "lantern", "aria-hidden": "true" }),
      h("h1", {}, m.alive ? "Köy uyuyor." : "Hayaletler izliyor."),
      h("p", {}, m.alive ? "Gözlerini kapat. Telefonunu masaya bırak; sabah seni uyandırırız." : "Gecenin hamlelerini göremezsin; sabahı bekle."));
  } else {
    const current = role === "vampir" ? m.night.targets[m.pid] : role === "doktor" ? m.night.save : m.night.query;
    const title = { vampir: "Kimi alıyoruz?", doktor: "Bu gece kimi koruyorsun?", gozcu: "Kime bakıyorsun?" }[role];
    const pool = alive().filter((p) => (role === "doktor" ? true : p.id !== m.pid) && !(role === "vampir" && m.team.includes(p.id)));
    const teamPicks = role === "vampir" ? m.team.filter((id) => m.night.targets[id]).map((id) => `${nameOf(id)}'nın seçimi: ${nameOf(m.night.targets[id])}`) : [];
    const last = role === "gozcu" && m.gozcuLog.length ? m.gozcuLog[m.gozcuLog.length - 1] : null;
    body = h("div", { class: "stack" },
      h("h1", { style: role === "vampir" ? "color:#F2D9D5" : "" }, title),
      teamPicks.length ? h("p", {}, teamPicks.join(" · ") + ". Aynı kişiyi seçin.") : null,
      last && h("p", {}, `Dünkü sorgun: ${nameOf(last.target)} ${last.vamp ? "VAMPİR" : "vampir değil"}.`),
      h("div", { class: "picks night-pick" }, pool.map((p) =>
        h("button", { class: `pick${current === p.id ? " on" : ""}`, onclick: () => act("night", { x: p.id }) }, p.name + (p.id === m.pid ? " (sen)" : "") + (current === p.id ? " ✓" : ""))),
        role === "vampir" && m.team.map((id) => h("div", { class: "pick note", style: "display:flex;align-items:center;justify-content:center" }, `${nameOf(id)} · takım`))));
  }
  return {
    theme: "night",
    el: h("section", { class: "screen", style: acting && role === "vampir" ? "background:radial-gradient(80% 40% at 50% 100%, #3B1412 0%, transparent 70%)" : "" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, `${s.round}. gece`), h("span", { style: "display:flex;gap:10px;align-items:center" }, bar("").lastChild, cardButton())),
      body,
      h("div", { class: "stack push" },
        m.can.includes("closeNight") && h("button", { class: "ghost", onclick: () => cmd("closeNight") }, "Geceyi bitir (kurucu)"),
        m.can.includes("will") && willBox())),
  };
}

function willBox() {
  const save = () => {
    const txt = document.getElementById("will").value.trim();
    if (txt) act("will", { txt });
    toast("Vasiyetin mühürlendi.");
  };
  if (draft.will === null) draft.will = m.will || "";
  return h("details", {},
    h("summary", { class: "muted", style: "cursor:pointer;min-height:44px;display:flex;align-items:center" }, m.will ? "Vasiyetin yazılı · düzenle" : "Vasiyet bırak (ölünce okunur)"),
    h("div", { class: "stack", style: "margin-top:8px" },
      h("label", { class: "sr", for: "will" }, "Vasiyet"),
      h("textarea", { id: "will", maxlength: "200", placeholder: "Ölürsem köy şunu bilsin…", oninput: (e) => (draft.will = e.target.value) }, draft.will),
      h("button", { class: "ghost", onclick: save }, "Kaydet")));
}

function viewDawn() {
  const ann = [...s.announcements].reverse().find((a) => a.kind === "dawn");
  const died = s.lastNight && s.lastNight.died;
  const dead = died && s.players.find((p) => p.id === died);
  return {
    theme: "day dawn",
    el: h("section", { class: "screen" },
      bar(`Şafak · ${s.round}. gün`),
      h("div", { class: "dawn-hero" },
        h("span", { class: "mono muted", style: "letter-spacing:0.1em" }, "SABAH OLDU"),
        dead ? h("h1", {}, `${dead.name} ölü bulundu.`) : h("h1", {}, s.lastNight && s.lastNight.saved ? "Doktor yetişti." : "Sessiz bir gece."),
        dead ? h("p", { style: "font-size:20px" }, "O bir ", h("b", {}, WAS[dead.role] || "?"), ".") : h("p", {}, ann ? ann.text : "Kimse ölmedi."),
        ann && ann.will && h("div", { class: "will" }, h("span", { class: "eyebrow", style: "font-size:12px" }, "Vasiyeti"), h("q", {}, ann.will)),
        m.heirRight && heirPicker()),
      h("div", { class: "stack" },
        m.can.includes("startDay")
          ? h("button", { class: "btn", onclick: () => cmd("startDay") }, "Güne geç")
          : h("p", { class: "muted" }, s.muhtar ? `Muhtar ${nameOf(s.muhtar)} hazır olunca güne geçer.` : "Kurucu hazır olunca güne geçer."))),
  };
}

function heirPicker() {
  return h("div", { class: "stack" },
    h("p", { style: "font-weight:600" }, "Muhtar sendin. Makamı kime bırakıyorsun?"),
    h("div", { class: "picks" }, alive().map((p) => h("button", { class: "pick", onclick: () => act("heir", { x: p.id }) }, p.name))));
}

function viewDay() {
  const d = s.day;
  if (d.stage === "trial" || d.stage === "verdict") return viewTrial();
  const pending = Object.entries(d.accusations);
  const open = pending.find(([who, x]) => who !== m.pid && x !== m.pid);
  return {
    theme: "day",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" }, h("span", { class: "eyebrow" }, `${s.round}. gün · meydan`), h("span", { style: "display:flex;gap:10px;align-items:center" }, bar("").lastChild, cardButton())),
      h("h1", {}, m.alive ? "Kimden şüpheleniyorsun?" : "Hayaletsin. Kim asılacak?"),
      pending.length > 0 && h("div", { class: "stack" }, pending.map(([who, x]) =>
        h("div", { class: "callout" },
          h("span", { style: "flex-grow:1" }, h("small", {}, "SUÇLAMA · DESTEK BEKLİYOR"), h("span", { style: "font-size:17px" }, h("b", {}, nameOf(who)), " → ", h("b", { style: "color:#F4B728" }, nameOf(x)))),
          m.can.includes("second") && who !== m.pid && x !== m.pid && h("button", { onclick: () => act("second", { x }) }, "Destekle")))),
      h("div", { class: "rows" }, s.players.map((p) => {
        const accused = Object.values(d.accusations).includes(p.id);
        const canAccuse = m.can.includes("accuse") && p.alive && p.id !== m.pid && !d.triedToday.includes(p.id);
        const canProphecy = m.can.includes("gvote") && p.alive;
        return h("div", { class: `row${p.alive ? "" : " dead"}` },
          h("span", { class: `av${p.isMuhtar ? " gold" : p.alive ? "" : " dead"}` }, initial(p.name)),
          h("span", { class: "who", style: p.id === m.pid ? "font-weight:600" : "" }, p.name),
          p.isMuhtar && h("span", { class: "badge" }, `Muhtar ×${s.muhtarWeight}`),
          accused && h("span", { class: "note" }, "suçlandı"),
          d.triedToday.includes(p.id) && h("span", { class: "note" }, "beraat"),
          !p.alive && h("span", { class: "note", style: "color:var(--muted)" }, `${(ROLE[p.role] || {}).name || ""} · öldü`),
          canAccuse && h("button", { onclick: () => act("accuse", { x: p.id }) }, "Suçla"),
          canProphecy && h("button", { onclick: () => act("gvote", { x: p.id }) }, m.myProphecy === p.id ? "Kehanetim ✓" : "Kehanet"));
      })),
      !open && pending.length === 0 && h("p", { class: "muted" }, "Birini suçla; biri daha desteklerse dava açılır."),
      h("div", { class: "stack push" },
        m.can.includes("will") && willBox(),
        m.can.includes("closeDay") && h("button", { class: "btn", onclick: () => cmd("closeDay") }, "Günü kapat, geceye geç"))),
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
  const header = h("span", { class: "muted" }, `${nameOf(t.accuser)} suçladı · ${nameOf(t.seconder)} destekledi`);
  let main;
  if (s.day.stage === "trial") {
    main = h("div", { class: "dawn-hero" },
      header,
      h("h1", {}, isAccused ? "Savunma sırası sende." : `${nameOf(t.accused)} savunuyor.`),
      h("p", {}, isAccused ? "Masaya anlat. Bitince düğmeye bas, oylama açılsın." : "Dinle. Sanık bitirince ya da Muhtar derse oylama açılır."),
      m.can.includes("done") && h("button", { class: "btn", onclick: () => act("done") }, "Savunmam bitti"),
      m.can.includes("toVerdict") && !isAccused && h("button", { class: "ghost", onclick: () => cmd("toVerdict") }, "Oylamaya geç"));
  } else {
    main = h("div", { class: "stack", style: "flex-grow:1" },
      header,
      h("h1", { style: "font-size:clamp(48px,15vw,64px)" }, `${nameOf(t.accused)} asılsın mı?`),
      h("div", { class: "stack", style: "gap:8px" },
        h("div", { class: "tally" }, h("span", { style: "color:var(--wax)" }, `assın ${g}`), h("span", { class: "muted" }, `${need} olursa asılır · toplam ${total}`), h("span", {}, `asmasın ${ng}`)),
        h("div", { class: "bar-v" }, h("span", { class: "g", style: `width:${(g / total) * 100}%` }), h("span", { class: "n", style: `width:${(ng / total) * 100}%` }), h("span", { class: "mid" }))),
      m.can.includes("verdict")
        ? h("div", { class: "stack", style: "flex-grow:1;justify-content:center;gap:12px" },
          h("button", { class: `verdict yes${mine === true ? " on" : ""}`, onclick: () => act("verdict", { y: true }) }, "ASSIN"),
          h("button", { class: `verdict no${mine === false ? " on" : ""}`, onclick: () => act("verdict", { y: false }) }, "ASMASIN"))
        : h("p", { style: "flex-grow:1" }, isAccused ? "Kendi davanda oy kullanmazsın. Köy karar veriyor." : "Oy hakkın yok; izliyorsun."),
      h("div", { class: "chips" }, voters.map((p) => {
        const v = t.verdicts[p.id];
        const mark = v === undefined ? " …" : v ? (w[p.id] > 1 ? " ✓✓" : " ✓") : " ✗";
        return h("span", { class: `chip${v === true ? " y" : v === false ? " n" : ""}` }, p.name + mark);
      })));
  }
  return {
    theme: "day",
    el: h("section", { class: "screen" }, h("div", { class: "bar" }, h("span", { class: "eyebrow" }, `${s.round}. gün · dava`), bar("").lastChild), main),
  };
}

function viewExecution() {
  const v = s.lastVerdict;
  const dead = v && s.players.find((p) => p.id === v.lynched);
  const ann = [...s.announcements].reverse().find((a) => a.kind === "verdict");
  return {
    theme: "day",
    el: h("section", { class: "screen" },
      bar(`${s.round}. gün · infaz`),
      h("div", { class: "dawn-hero" },
        h("span", { class: "mono muted", style: "letter-spacing:0.1em" }, `KARAR ${v ? `${v.guilty}–${v.notGuilty}` : ""}`),
        h("h1", {}, dead ? `${dead.name} asıldı.` : "Köy karar verdi."),
        dead && h("p", { style: "font-size:20px" }, "O bir ", h("b", {}, WAS[dead.role] || "?"), "."),
        ann && ann.will && h("div", { class: "will" }, h("span", { class: "eyebrow", style: "font-size:12px" }, "Vasiyeti"), h("q", {}, ann.will)),
        m.heirRight && heirPicker()),
      h("div", { class: "stack" },
        m.can.includes("nextRound")
          ? h("button", { class: "btn", onclick: () => cmd("nextRound") }, "Geceye geç")
          : h("p", { class: "muted" }, "Muhtar hazır olunca gece çöker."))),
  };
}

function viewEnd() {
  const won = s.winner === "koy" ? "Köy kazandı." : "Vampirler kazandı.";
  const badgeOf = (id) => (s.badges || []).filter((b) => b.playerId === id).map((b) => ({ kazanan: "kazanan", muhtar: "Muhtar", deli: "Deli zaferi", kahin: "Kâhin" }[b.kind]));
  return {
    theme: "night end",
    el: h("section", { class: "screen" },
      bar(`Oyun bitti · ${s.round}. gün`),
      h("h1", { class: "hero", style: "font-size:clamp(56px,19vw,76px)" }, won),
      s.deliWon && h("p", {}, "Deli de asılarak kendi zaferini aldı."),
      h("div", { class: "rows" }, s.players.map((p) =>
        h("div", { class: "row" },
          h("span", { class: "who", style: "flex-grow:1" }, p.name + (p.id === m.pid ? " (sen)" : "")),
          badgeOf(p.id).filter((b) => b !== "kazanan").map((b) => h("span", { class: "note", style: "color:var(--gold)" }, b)),
          h("span", { style: p.role === "vampir" ? "color:#E8A39C;font-weight:600" : "color:var(--soft)" }, ((ROLE[p.role] || {}).name || "").toLocaleLowerCase("tr"))))),
      h("button", { class: "reveal-cta", onclick: () => { showIfsa = true; render(); } },
        h("span", { class: "t" }, "● İFŞA PARTİSİ"),
        h("span", { style: "font-family:var(--d-font);font-weight:800;font-size:24px" }, "Kim, ne zaman, ne yaptı?"),
        h("span", { class: "muted" }, "Her gece hamlesi ve her oy, mühürlü haliyle.")),
      h("button", { class: "btn push", onclick: newRoom }, "Yeni oda")),
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

function viewIfsa() {
  const story = s.story || [];
  const pending = s.seals.pending;
  const dot = (sealed) => h("span", { class: `sdot${sealed ? "" : " open"}`, title: sealed ? "mühürlendi" : "zincire gidiyor" });
  const sealBox = h("div", { class: "stack", style: "gap:12px" },
    h("div", { class: `okbox${s.reveal && s.reveal.seedOk ? "" : " warn"}` },
      h("b", {}, s.reveal && s.reveal.seedOk ? "✓ Kura dürüst çekildi" : "Kura doğrulanamadı"),
      h("span", {}, "Roller dağıtılmadan önce kuranın kilidi zincire yazıldı. Oyun bitince açıldı ve kilide uydu: kimse rolleri sonradan değiştirmedi.")),
    h("div", { class: "will" },
      h("b", {}, `${s.seals.memoCount} hamle · ${s.seals.txCount} mühür paketi`),
      h("span", { class: "muted", style: "font-size:15px" }, pending ? `${pending} hamle daha zincire gidiyor; birkaç dakika içinde oturur.` : "Her gece hamlesi, her oy ve vasiyet Zcash ağına gizli notlar olarak yazıldı. Oyunun özet mührü hepsini tek parmak iziyle bağlar.")),
    h("details", { class: "tech" },
      h("summary", {}, "Teknik ayrıntı"),
      h("div", { class: "mono" },
        s.reveal && h("div", {}, `kura       ${s.reveal.seed} · kilit ${String(s.reveal.commit).slice(0, 12)}…`),
        s.seals.recent.map((t) => h("div", {}, `paket      ${t.slice(0, 10)}…${t.slice(-8)}`)),
        h("div", {}, `ağ         ${s.seals.chain === "zingo" ? "Zcash testnet" : "deneme (zincirsiz)"}`),
        s.reveal && h("div", { style: "word-break:break-all" }, `görüntüleme anahtarı  ${String(s.reveal.ufvk).slice(0, 24)}…`))));
  return {
    theme: "night",
    el: h("section", { class: "screen" },
      h("div", { class: "bar" },
        h("button", { class: "ghost small", onclick: () => { showIfsa = false; showSeal = false; render(); } }, "← Sonuç"),
        h("span", { class: "seal" }, pending ? `● ${pending} yolda` : "● hepsi mühürlü")),
      h("h1", {}, showSeal ? "Bu oyun zincirde." : "Kim, ne zaman, ne yaptı?"),
      showSeal
        ? sealBox
        : h("div", { class: "story" }, story.length === 0
          ? h("p", { class: "muted" }, "Hikâye hazırlanıyor…")
          : story.map((c) => h("div", { class: "chapter" },
            h("span", { class: "mono muted ch" }, c.title.toLocaleUpperCase("tr")),
            c.lines.map((l) => h("div", { class: "sline" }, dot(l.sealed), h("span", {}, l.text)))))),
      h("div", { class: "stack push" },
        !showSeal && h("p", { class: "muted" }, "Kırmızı nokta = o hamle oyun sırasında mühürlendi. Sonradan kimse değiştiremez."),
        h("button", { class: "ghost", onclick: () => { showSeal = !showSeal; render(); } }, showSeal ? "← Hikâyeye dön" : "Mühür ayrıntısı ▸"))),
  };
}

/* ── perde: ?perde=KOD ── */

function viewScreen() {
  if (!s) return { theme: "night screen-mode", el: h("section", { class: "screen" }, h("h1", {}, "Perde bağlanıyor…")) };
  const day = ["DAWN", "DAY", "EXECUTION"].includes(s.phase);
  return {
    theme: `${day ? "day" : "night"} screen-mode`,
    el: h("section", { class: "screen" },
      bar(`${PHASE[s.phase]} · ${s.round || ""} · oda ${s.code}`),
      h("div", { class: "stage" },
        h("div", { class: "stack" },
          h("h1", {}, s.phase === "LOBBY" ? `zkoy.fun/j/${s.code}` : PHASE[s.phase]),
          s.phase === "LOBBY" && h("div", { class: "qr", html: qrSvg(`${location.origin}/j/${s.code}`) }),
          h("div", { class: "rows" }, s.players.map((p) => h("div", { class: `row${p.alive ? "" : " dead"}` },
            h("span", { class: `av${p.isMuhtar ? " gold" : ""}` }, initial(p.name)), h("span", { class: "who" }, p.name),
            p.isMuhtar && h("span", { class: "badge" }, "Muhtar"), !p.alive && p.role && h("span", { class: "note" }, (ROLE[p.role] || {}).name))))),
        h("div", { class: "feed" }, [...s.announcements].reverse().slice(0, 8).map((a) => h("div", {}, a.text))))),
  };
}

connect();
render();
