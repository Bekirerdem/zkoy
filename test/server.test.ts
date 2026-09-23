import { afterAll, describe, expect, test } from "bun:test";
import { Db } from "../src/server/db";
import { startServer } from "../src/server/index";
import { MockZcashService } from "../src/zcash/mock";

const app = startServer({ port: 0, db: new Db(":memory:"), zcash: new MockZcashService(), webDir: "web" });
const base = `127.0.0.1:${app.server.port}`;
afterAll(() => app.server.stop(true));

/** Tiny client: collects frames, lets a test wait for the next one matching a predicate. */
async function client(device: string) {
  const ws = new WebSocket(`ws://${base}/ws`);
  const frames: any[] = [];
  const waiters: Array<{ pred: (f: any) => boolean; res: (f: any) => void }> = [];
  ws.onmessage = (ev) => {
    const f = JSON.parse(String(ev.data));
    frames.push(f);
    for (const w of [...waiters])
      if (w.pred(f)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.res(f);
      }
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  const next = (pred: (f: any) => boolean) =>
    new Promise<any>((res, rej) => {
      waiters.push({ pred, res });
      setTimeout(() => rej(new Error("zaman aşımı")), 2000);
    });
  send({ t: "hello", device });
  return { ws, send, next, frames };
}

describe("WebSocket sunucusu", () => {
  test("kur → katıl → yayın; yanlış token reddedilir; /stats", async () => {
    const a = await client("devA");
    a.send({ t: "create", name: "ali" });
    const joined = await a.next((f) => f.t === "joined");
    expect(joined.code).toHaveLength(6);
    expect(joined.pid).toBe("p0");

    const b = await client("devB");
    const seen = a.next((f) => f.t === "state" && f.s.players.length === 2);
    b.send({ t: "join", code: joined.code, name: "ayşe" });
    const bj = await b.next((f) => f.t === "joined");
    expect(bj.pid).toBe("p1");
    const st = await seen;
    expect(st.s.hostPid).toBe("p0");
    const me = await b.next((f) => f.t === "me");
    expect(me.m.isHost).toBe(false);

    const c = await client("devC");
    c.send({ t: "hello", device: "devC", code: joined.code, token: "yanlis" });
    const err = await c.next((f) => f.t === "error");
    expect(err.e).toContain("oturum");

    b.send({ t: "cmd", c: "start" });
    const e2 = await b.next((f) => f.t === "error");
    expect(e2.e).toContain("kurucu");

    const res = await fetch(`http://${base}/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.liveRooms).toBe(1);
    for (const x of [a, b, c]) x.ws.close();
  });

  test("yeniden bağlanma: token ile hello aynı oyuncuyu verir", async () => {
    const a = await client("devR");
    a.send({ t: "create", name: "rıza" });
    const j = await a.next((f) => f.t === "joined");
    a.ws.close();
    const again = await client("devR");
    again.send({ t: "hello", device: "devR", code: j.code, token: j.token });
    const me = await again.next((f) => f.t === "me");
    expect(me.m.pid).toBe(j.pid);
    again.ws.close();
  });
});
