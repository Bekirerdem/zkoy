// Kök sayfa — perdeyle aynı dil: sıcak gece, lamba altını.

export function landingHtml(chain: string, hasApp: boolean): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZKöy</title>
<style>
  :root { --night:#14100e; --parchment:#ece4d4; --ash:#96897a; --lamp:#d9a441; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    min-height:100vh; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:4vh; padding:6vw; text-align:center;
    background: radial-gradient(120vw 80vh at 50% -10%, rgba(217,164,65,0.07), transparent 60%), var(--night);
    color:var(--parchment); font-family: Georgia, serif;
  }
  h1 { font-size:2.6rem; letter-spacing:0.4em; text-indent:0.4em; color:var(--lamp); }
  p { color:var(--ash); line-height:1.6; max-width:34rem; }
  .doors { display:flex; flex-direction:column; gap:2vh; width:min(22rem, 90vw); }
  a.door, button.door {
    display:block; width:100%; padding:1.1rem; font-family:inherit; font-size:1.15rem;
    color:var(--parchment); background:transparent; border:1px solid rgba(236,228,212,0.25);
    border-radius:6px; text-decoration:none; letter-spacing:0.08em; cursor:pointer;
  }
  a.door.primary { border-color:var(--lamp); color:var(--lamp); }
  a.door.disabled { opacity:0.4; pointer-events:none; }
  form { display:flex; gap:0.6rem; }
  input {
    flex:1; padding:1.1rem; font-family:'Consolas',monospace; font-size:1.15rem;
    text-transform:uppercase; letter-spacing:0.3em; text-align:center;
    background:transparent; border:1px solid rgba(236,228,212,0.25); border-radius:6px;
    color:var(--parchment); outline:none;
  }
  input:focus { border-color:var(--lamp); }
  footer { color:var(--ash); font-size:0.85rem; }
</style>
</head>
<body>
  <h1>ZKÖY</h1>
  <p>Vampir Köylü on Zcash — her sır bir memo'da mühürlü.<br>
     Sunucu ayakta · zincir: <b style="color:var(--lamp)">${chain}</b></p>
  <div class="doors">
    <a class="door primary${hasApp ? "" : " disabled"}" href="/app">🎭 Oyuna gir${hasApp ? "" : " (uygulama henüz yüklenmedi)"}</a>
    <form onsubmit="location.href='/screen/'+document.getElementById('c').value.toUpperCase(); return false">
      <input id="c" maxlength="4" placeholder="KOD" autocomplete="off">
      <button class="door" style="width:auto" type="submit">Perdeyi aç</button>
    </form>
  </div>
  <footer>oda anahtarı oyun sonunda perdeye düşer</footer>
</body>
</html>`;
}
