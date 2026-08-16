// Perde sayfası — projeksiyona tam ekran açılır, durumu poll'lar.
// v1 işlevsel sürüm; Faz 3'te tasarım pası yapılacak.

export function screenHtml(code: string): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZKöy — ${code}</title>
<style>
  :root {
    --bg: #0d0b14; --panel: #171325; --ink: #e8e2d8; --dim: #8f87a8;
    --accent: #c9a227; --blood: #a03030; --alive: #4a7c59;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--ink); min-height: 100vh;
    font-family: Georgia, 'Times New Roman', serif; padding: 2.5vh 3vw;
    display: flex; flex-direction: column; gap: 2vh;
  }
  header { display: flex; justify-content: space-between; align-items: baseline; }
  h1 { font-size: 2.2rem; letter-spacing: 0.12em; color: var(--accent); }
  h1 small { color: var(--dim); font-size: 1rem; letter-spacing: 0.3em; }
  #meta { color: var(--dim); font-size: 1rem; text-align: right; }
  #phasebox { text-align: center; padding: 3vh 0 1vh; }
  #phase { font-size: 4rem; letter-spacing: 0.25em; text-transform: uppercase; }
  #timer { font-size: 2rem; color: var(--accent); font-variant-numeric: tabular-nums; }
  #ann { min-height: 12vh; text-align: center; padding: 1vh 8vw; }
  #ann .main { font-size: 1.8rem; line-height: 1.4; }
  #ann .will {
    margin-top: 1vh; font-style: italic; color: var(--accent); font-size: 1.3rem;
  }
  #ann .will::before { content: "Vasiyet: “"; color: var(--dim); }
  #ann .will::after { content: "”"; color: var(--dim); }
  #players {
    display: flex; flex-wrap: wrap; gap: 1.2vh; justify-content: center;
    padding: 1vh 0;
  }
  .p {
    padding: 1.4vh 1.8vw; border-radius: 8px; background: var(--panel);
    font-size: 1.4rem; border-bottom: 3px solid var(--alive);
  }
  .p.dead { opacity: 0.45; border-bottom-color: var(--blood); text-decoration: line-through; }
  #votebar { text-align: center; font-size: 1.4rem; color: var(--dim); }
  #votebar b { color: var(--accent); font-size: 1.8rem; }
  #end { display: none; }
  #end.show { display: block; }
  #end h2 { text-align: center; color: var(--accent); font-size: 2.4rem; margin: 2vh 0; letter-spacing: 0.15em; }
  #end table { margin: 0 auto; border-collapse: collapse; font-size: 1.3rem; }
  #end td, #end th { padding: 0.6vh 2vw; border-bottom: 1px solid #2a2440; text-align: left; }
  #end .ufvk {
    margin: 2vh auto 0; max-width: 80vw; word-break: break-all;
    color: var(--dim); font-family: monospace; font-size: 0.8rem; text-align: center;
  }
  footer { margin-top: auto; text-align: center; color: var(--dim); font-size: 0.95rem; }
</style>
</head>
<body>
  <header>
    <h1>ZKÖY <small>ŞİRİNCE</small></h1>
    <div id="meta"></div>
  </header>
  <div id="phasebox"><div id="phase">—</div><div id="timer"></div></div>
  <div id="ann"></div>
  <div id="players"></div>
  <div id="votebar"></div>
  <div id="end">
    <h2>İFŞA PARTİSİ</h2>
    <table id="payouts"></table>
    <table id="reveals" style="margin-top:2vh"></table>
    <div class="ufvk" id="ufvk"></div>
  </div>
  <footer>her sır Zcash memo'sunda mühürlü · oda anahtarı oyun sonunda perdeye düşer</footer>
<script>
const CODE = ${JSON.stringify(code)};
const PHASE_TR = {
  LOBBY: "KÖY MEYDANI", NIGHT: "GECE", DAWN: "ŞAFAK", DAY: "GÜNDÜZ",
  VOTE: "OYLAMA", EXECUTION: "İNFAZ", END: "OYUN BİTTİ"
};
let endsAt = null;
async function poll() {
  try {
    const r = await fetch("/room/" + CODE + "/state");
    if (!r.ok) return;
    const s = await r.json();
    document.getElementById("phase").textContent = PHASE_TR[s.phase] ?? s.phase;
    endsAt = s.endsAt;
    document.getElementById("meta").innerHTML =
      "oda <b>" + s.code + "</b> · tur " + s.round +
      " · pot " + (s.potZats / 1e8).toFixed(4) + " TAZ" +
      " · mühür " + s.sealedCount + " tx";
    document.getElementById("players").innerHTML = s.players.map(p =>
      '<div class="p' + (p.alive ? "" : " dead") + '">' + esc(p.name) + "</div>"
    ).join("");
    const ann = s.announcements[s.announcements.length - 1];
    document.getElementById("ann").innerHTML = ann
      ? '<div class="main">' + esc(ann.text) + "</div>" +
        (ann.will ? '<div class="will">' + esc(ann.will) + "</div>" : "")
      : "";
    document.getElementById("votebar").innerHTML =
      s.phase === "VOTE" && s.voteWeightCast != null
        ? "sandıktaki mühürlü ağırlık: <b>" + s.voteWeightCast + "</b>"
        : "";
    const end = document.getElementById("end");
    if (s.phase === "END" && s.end) {
      end.classList.add("show");
      document.getElementById("payouts").innerHTML =
        "<tr><th>ödül</th><th>zat</th><th>sebep</th></tr>" +
        s.end.payouts.map(p =>
          "<tr><td>" + esc(p.name) + "</td><td>" + p.zats + "</td><td>" + esc(p.reason) + "</td></tr>"
        ).join("");
      document.getElementById("reveals").innerHTML =
        "<tr><th>köylü</th><th>rol</th><th>kademe</th><th>taahhüt</th></tr>" +
        s.end.reveals.map(p =>
          "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.role) + "</td><td>" +
          ["", "Rençber", "Muhtar", "Ağa"][p.tier] + "</td><td style='font-family:monospace;font-size:0.75rem'>" +
          p.commit.slice(0, 16) + "… ✓</td></tr>"
        ).join("");
      document.getElementById("ufvk").textContent =
        "ODA GÖRÜŞ ANAHTARI (bağımsız doğrulama için): " + s.end.ufvk;
    }
  } catch (e) { /* sunucu geçici düşerse sessiz geç */ }
}
function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
setInterval(() => {
  const el = document.getElementById("timer");
  if (!endsAt) { el.textContent = ""; return; }
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  el.textContent = left + " sn";
}, 250);
setInterval(poll, 1500);
poll();
</script>
</body>
</html>`;
}
