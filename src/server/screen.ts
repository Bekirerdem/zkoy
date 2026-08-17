// Perde sayfası — projeksiyonda tam ekran sahne.
// Tasarım yönü: karanlık sahne-editoryal, "gece köy meydanı" (Warm Editorial
// dark × tiyatro). Tek accent = lamba altını; ölüm = balmumu mühür; anonslar
// tellal temposunda belirir. Dashboard değil sahne: panel/kart ızgarası yok.

export function screenHtml(code: string): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZKöy — ${code}</title>
<style>
  :root {
    --night: #14100e;      /* sıcak gece — saf siyah değil */
    --parchment: #ece4d4;  /* mürekkep */
    --ash: #96897a;        /* soluk yazı */
    --lamp: #d9a441;       /* tek accent: lamba altını */
    --wax: #8c2f2a;        /* balmumu mühür kırmızısı */
    --ember: #b8563a;      /* son saniye koru */
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background:
      radial-gradient(120vw 80vh at 50% -10%, rgba(217,164,65,0.07), transparent 60%),
      var(--night);
    color: var(--parchment);
    font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
    display: flex; flex-direction: column;
    padding: 3.5vh 4vw; overflow: hidden;
  }

  /* ── üst şerit: kimlik + saat kulesi ─────────────────────────── */
  header {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 1px solid rgba(236,228,212,0.10); padding-bottom: 1.6vh;
  }
  .wordmark { font-size: 1.5rem; letter-spacing: 0.42em; color: var(--lamp); }
  .wordmark span { color: var(--ash); font-size: 0.85rem; letter-spacing: 0.3em; margin-left: 1.2vw; }
  .tower { text-align: right; color: var(--ash); font-size: 0.95rem; letter-spacing: 0.14em; }
  .tower b {
    font-family: 'Consolas', monospace; font-variant-numeric: tabular-nums;
    color: var(--parchment); font-weight: 400; font-size: 1.05rem;
  }
  .tower .lamp { color: var(--lamp); }

  /* ── sahne merkezi: faz + sayaç + anons ──────────────────────── */
  main { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  #phase {
    font-size: clamp(3.4rem, 9vw, 7.2rem); letter-spacing: 0.3em;
    text-indent: 0.3em; /* letter-spacing sağ boşluğunu dengele */
    line-height: 1.1; color: var(--parchment);
    opacity: 1; transition: opacity 500ms ease;
  }
  #phase.swap { opacity: 0; transition: opacity 180ms ease; }
  #timer {
    margin-top: 1vh; font-family: 'Consolas', monospace;
    font-variant-numeric: tabular-nums; font-size: 2.1rem; color: var(--lamp);
    min-height: 2.6rem;
  }
  #timer.ember { color: var(--ember); }
  #ann { min-height: 17vh; margin-top: 3.5vh; padding: 0 8vw; }
  .crier {
    font-size: clamp(1.3rem, 2.6vw, 2rem); line-height: 1.5;
    opacity: 0; transform: translateY(14px);
    transition: opacity 500ms ease, transform 500ms cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  .crier.in { opacity: 1; transform: none; }
  .will {
    margin-top: 1.8vh; font-style: italic; color: var(--lamp);
    font-size: clamp(1.05rem, 1.9vw, 1.45rem);
  }
  .will::before { content: "vasiyet — “"; color: var(--ash); font-style: normal; }
  .will::after { content: "”"; color: var(--ash); }
  #votebar { margin-top: 2.5vh; color: var(--ash); font-size: 1.15rem; letter-spacing: 0.1em; }
  #votebar b {
    display: inline-block; min-width: 2ch; color: var(--lamp);
    font-family: 'Consolas', monospace; font-size: 1.9rem; font-weight: 400;
    transition: transform 150ms ease;
  }
  #votebar b.tick { transform: scale(1.18); }

  /* ── köylüler ────────────────────────────────────────────────── */
  #players {
    display: flex; flex-wrap: wrap; gap: 1.4vh 1.6vw; justify-content: center;
    padding: 2.4vh 0 1vh;
  }
  .p {
    position: relative; font-size: clamp(1.1rem, 2vw, 1.55rem);
    padding: 0.9vh 1.6vw; letter-spacing: 0.06em;
    border-bottom: 2px solid rgba(236,228,212,0.22);
  }
  .p.dead { color: var(--ash); border-bottom-color: transparent; opacity: 0.75; }
  .p.dead::after {
    content: "MÜHÜRLÜ"; position: absolute; left: 50%; top: -1.15em;
    transform: translateX(-50%) rotate(-6deg); white-space: nowrap;
    font-size: 0.5em; letter-spacing: 0.26em; color: var(--wax);
    border: 1.5px solid var(--wax); border-radius: 3px; padding: 0.08em 0.5em;
  }

  /* ── ifşa partisi ────────────────────────────────────────────── */
  #end { display: none; margin-top: 1vh; }
  #end.show { display: block; }
  #end h2 {
    text-align: center; color: var(--lamp); letter-spacing: 0.4em; text-indent: 0.4em;
    font-size: 2rem; font-weight: 400; margin-bottom: 2vh;
  }
  .ledger { display: flex; justify-content: center; gap: 6vw; flex-wrap: wrap; }
  .ledger table { border-collapse: collapse; font-size: 1.05rem; }
  .ledger caption {
    color: var(--ash); letter-spacing: 0.2em; font-size: 0.8rem;
    text-align: left; padding-bottom: 0.8vh;
  }
  .ledger td, .ledger th {
    padding: 0.5vh 1.4vw; border-bottom: 1px solid rgba(236,228,212,0.08);
    text-align: left; font-weight: 400;
  }
  .ledger th { color: var(--ash); font-size: 0.85rem; letter-spacing: 0.12em; }
  .ledger .num { font-family: 'Consolas', monospace; font-variant-numeric: tabular-nums; text-align: right; }
  .ledger .seal-ok { color: var(--lamp); font-family: 'Consolas', monospace; font-size: 0.8rem; }
  #ufvk {
    margin: 2.2vh auto 0; max-width: 78vw; word-break: break-all; text-align: center;
    font-family: 'Consolas', monospace; font-size: 0.72rem; color: var(--ash); line-height: 1.6;
  }
  #ufvk em { display: block; font-family: Georgia, serif; font-style: normal; color: var(--lamp); letter-spacing: 0.2em; font-size: 0.8rem; margin-bottom: 0.6vh; }

  footer {
    border-top: 1px solid rgba(236,228,212,0.10); padding-top: 1.4vh;
    display: flex; justify-content: space-between;
    color: var(--ash); font-size: 0.85rem; letter-spacing: 0.08em;
  }
</style>
</head>
<body>
  <header>
    <div class="wordmark">ZKÖY<span>ŞİRİNCE MEYDANI</span></div>
    <div class="tower">SAAT KULESİ · BLOK <b id="height">—</b> · TUR <b id="round">—</b> · POT <b id="pot" class="lamp">—</b></div>
  </header>
  <main>
    <div id="phase">—</div>
    <div id="timer"></div>
    <div id="ann"></div>
    <div id="votebar"></div>
    <div id="players"></div>
    <div id="end">
      <h2>İFŞA PARTİSİ</h2>
      <div class="ledger">
        <table id="payouts"><caption>KAZANANLAR DEFTERİ</caption></table>
        <table id="reveals"><caption>KADEME TAAHHÜTLERİ</caption></table>
      </div>
      <div class="ledger" style="margin-top:2vh"><table id="seals"><caption>MÜHÜR DEFTERİ — ZİNCİR KANITLARI</caption></table></div>
      <div id="ufvk"></div>
    </div>
  </main>
  <footer>
    <div>her sır bir Zcash memo'sunda mühürlü</div>
    <div>oda <b style="color:var(--parchment)">${code}</b> · anahtar oyun sonunda perdeye düşer</div>
  </footer>
<script>
const CODE = ${JSON.stringify(code)};
const PHASE_TR = {
  LOBBY: "KÖY MEYDANI", NIGHT: "GECE", DAWN: "ŞAFAK", DAY: "GÜNDÜZ",
  VOTE: "OYLAMA", EXECUTION: "İNFAZ", END: "OYUN BİTTİ"
};
const TIERS = ["", "Rençber", "Muhtar", "Ağa"];
let endsAt = null, lastPhase = null, lastAnnAt = 0, lastWeight = null;

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setPhase(phase) {
  const el = document.getElementById("phase");
  if (lastPhase === phase) return;
  lastPhase = phase;
  el.classList.add("swap");
  setTimeout(() => {
    el.textContent = PHASE_TR[phase] ?? phase;
    el.classList.remove("swap");
  }, 190);
}

function setAnnouncement(ann) {
  const box = document.getElementById("ann");
  if (!ann || ann.at === lastAnnAt) return;
  lastAnnAt = ann.at;
  box.innerHTML =
    '<div class="crier">' + esc(ann.text) +
    (ann.will ? '<div class="will">' + esc(ann.will) + "</div>" : "") +
    "</div>";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => box.firstChild.classList.add("in")));
}

async function poll() {
  let s;
  try {
    const r = await fetch("/room/" + CODE + "/state");
    if (!r.ok) return;
    s = await r.json();
  } catch { return; }

  setPhase(s.phase);
  endsAt = s.endsAt;
  document.getElementById("height").textContent = s.height || "—";
  document.getElementById("round").textContent = s.round;
  document.getElementById("pot").textContent = (s.potZats / 1e8).toFixed(4) + " TAZ";
  document.getElementById("players").innerHTML = s.players.map(p =>
    '<div class="p' + (p.alive ? "" : " dead") + '">' + esc(p.name) + "</div>"
  ).join("");
  setAnnouncement(s.announcements[s.announcements.length - 1]);

  const vb = document.getElementById("votebar");
  if (s.phase === "VOTE" && s.voteWeightCast != null) {
    vb.innerHTML = "sandıktaki mühürlü ağırlık &nbsp;<b>" + s.voteWeightCast + "</b>";
    if (lastWeight !== null && s.voteWeightCast !== lastWeight) {
      const b = vb.querySelector("b");
      b.classList.add("tick");
      setTimeout(() => b.classList.remove("tick"), 160);
    }
    lastWeight = s.voteWeightCast;
  } else { vb.innerHTML = ""; lastWeight = null; }

  const end = document.getElementById("end");
  if (s.phase === "END" && s.end) {
    end.classList.add("show");
    document.getElementById("players").style.display = "none";
    document.getElementById("payouts").innerHTML =
      "<caption>KAZANANLAR DEFTERİ</caption><tr><th>köylü</th><th>zat</th><th>sebep</th></tr>" +
      s.end.payouts.map(p =>
        "<tr><td>" + esc(p.name) + '</td><td class="num">' + p.zats.toLocaleString("tr-TR") +
        "</td><td>" + esc(p.reason) + "</td></tr>").join("");
    document.getElementById("reveals").innerHTML =
      "<caption>KADEME TAAHHÜTLERİ</caption><tr><th>köylü</th><th>rol</th><th>kademe</th><th>mühür</th></tr>" +
      s.end.reveals.map(p =>
        "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.role) + "</td><td>" + TIERS[p.tier] +
        '</td><td class="seal-ok">' + p.commit.slice(0, 12) + "… ✓</td></tr>").join("");
    document.getElementById("ufvk").innerHTML =
      "<em>ODA GÖRÜŞ ANAHTARI — BAĞIMSIZ DOĞRULAYIN</em>" + esc(s.end.ufvk);
    loadSeals();
  }
}

let sealsLoaded = false;
async function loadSeals() {
  if (sealsLoaded) return;
  sealsLoaded = true;
  try {
    const r = await fetch("/room/" + CODE + "/reveal", { method: "POST" });
    const rev = await r.json();
    document.getElementById("seals").innerHTML =
      "<caption>MÜHÜR DEFTERİ — ZİNCİR KANITLARI</caption>" +
      "<tr><th>tx</th><th>memo</th><th>içerik</th></tr>" +
      rev.timeline.map(b => {
        const types = b.memos.map(m => m.t).join(", ");
        const link = b.txid.startsWith("mock:")
          ? esc(b.txid)
          : '<a href="https://testnet.cipherscan.app/tx/' + esc(b.txid) +
            '" target="_blank" style="color:var(--lamp)">' + esc(b.txid.slice(0, 14)) + "…</a>";
        return "<tr><td style='font-family:monospace;font-size:0.8rem'>" + link +
          "</td><td class='num'>" + b.memos.length + "</td><td style='color:var(--ash);font-size:0.85rem'>" +
          esc(types) + "</td></tr>";
      }).join("");
  } catch { sealsLoaded = false; }
}

setInterval(() => {
  const el = document.getElementById("timer");
  if (!endsAt) { el.textContent = ""; el.classList.remove("ember"); return; }
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  el.textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
  el.classList.toggle("ember", left <= 10);
}, 250);
setInterval(poll, 1500);
poll();
</script>
</body>
</html>`;
}
