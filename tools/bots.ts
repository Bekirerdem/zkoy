// Prova botları: bir odaya N bot sokar, `me.can` ve meydana bakarak oynarlar.
// Kullanım: bun tools/bots.ts <KOD> [adet=6] [ws://localhost:3131/ws]
// Tek telefonla tam el provası için: odayı telefondan kur, botları sok, başlat.

const [code, countArg, urlArg] = process.argv.slice(2);
if (!code) {
  console.error("kullanım: bun tools/bots.ts <KOD> [adet=6] [ws-url]");
  process.exit(1);
}
const COUNT = Number(countArg ?? 6);
const URL = urlArg ?? "ws://localhost:3131/ws";
const NAMES = ["Hasan", "Fadime", "Rıza", "Nuriye", "Cemal", "Şükran", "Kâzım", "Hatice", "Veli", "Zehra", "Osman", "Emine", "Temel"];

const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];
const later = (fn: () => void) => setTimeout(fn, 800 + Math.random() * 2200);

function bot(i: number) {
  const ws = new WebSocket(URL);
  let s: any = null;
  let me: any = null;
  let busy = false;
  const send = (m: unknown) => ws.send(JSON.stringify(m));

  function think() {
    if (!s || !me || busy) return;
    const can: string[] = me.can;
    const alive = s.players.filter((p: any) => p.alive && p.id !== me.pid).map((p: any) => p.id);
    const act = (m: any) => {
      busy = true;
      later(() => {
        busy = false;
        send(m);
      });
    };
    if (s.phase === "ELECTION") {
      if (can.includes("nominate") && Math.random() < 0.2) return act({ t: "act", a: "nominate" });
      if (can.includes("mvote") && !s.election.votes[me.pid])
        return act({ t: "act", a: "mvote", x: pick(s.election.candidates) });
    }
    if (s.phase === "NIGHT" && can.includes("night") && me.night) {
      const done =
        (me.role === "vampir" && me.night.targets?.[me.pid]) ||
        (me.role === "doktor" && me.night.save) ||
        (me.role === "gozcu" && me.night.query);
      if (!done) {
        const pool = me.role === "vampir" ? alive.filter((id: string) => !me.team.includes(id)) : me.role === "doktor" ? [...alive, me.pid] : alive;
        return act({ t: "act", a: "night", x: pick(pool) });
      }
    }
    if (s.phase === "DAY") {
      const d = s.day;
      if (d.stage === "verdict" && can.includes("verdict") && d.trial && d.trial.verdicts[me.pid] === undefined)
        return act({ t: "act", a: "verdict", y: Math.random() < 0.6 });
      if (d.stage === "trial" && can.includes("done")) return act({ t: "act", a: "done" });
      if (d.stage === "free" && can.includes("second")) {
        const open = Object.entries(d.accusations).find(([who, x]) => who !== me.pid && x !== me.pid);
        if (open && Math.random() < 0.5) return act({ t: "act", a: "second", x: open[1] });
      }
      if (d.stage === "free" && can.includes("accuse") && !d.accusations[me.pid] && Math.random() < 0.15) {
        const target = pick(alive.filter((id: string) => !d.triedToday.includes(id)));
        if (target) return act({ t: "act", a: "accuse", x: target });
      }
    }
    if (can.includes("heir")) return act({ t: "act", a: "heir", x: pick(alive) });
    // Bot Muhtar ise masayı ilerletir (insan Muhtar'ı beklemek provayı kilitler).
    if (me.isMuhtar) {
      if (can.includes("startDay")) return act({ t: "cmd", c: "startDay" });
      if (can.includes("nextRound")) return act({ t: "cmd", c: "nextRound" });
      if (can.includes("toVerdict")) return act({ t: "cmd", c: "toVerdict" });
    }
  }

  ws.onopen = () => {
    send({ t: "hello", device: `bot-${code}-${i}` });
    send({ t: "join", code, name: NAMES[i % NAMES.length]! });
  };
  ws.onmessage = (ev) => {
    const f = JSON.parse(String(ev.data));
    if (f.t === "state") s = f.s;
    else if (f.t === "me") me = f.m;
    else if (f.t === "error") console.error(`[${NAMES[i]}] ${f.e}`);
    think();
  };
  // Durgun anlarda da düşün (ör. herkes bekliyorken suçlama).
  setInterval(think, 4000);
}

for (let i = 0; i < COUNT; i++) setTimeout(() => bot(i), i * 150);
console.log(`${COUNT} bot ${code} odasına giriyor (${URL})`);
