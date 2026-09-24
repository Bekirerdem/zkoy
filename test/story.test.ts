import { describe, expect, test } from "bun:test";
import { Db } from "../src/server/db";
import { Room } from "../src/server/room";
import { SealQueue } from "../src/server/seal-queue";
import { accusative } from "../src/server/story";
import { publicView } from "../src/server/views";
import { MockZcashService } from "../src/zcash/mock";

describe("ifşa partisi", () => {
  test("belirtme hâli ünlü uyumuna uyar", () => {
    expect(accusative("Hasan")).toBe("Hasan'ı");
    expect(accusative("Ali")).toBe("Ali'yi");
    expect(accusative("Rıza")).toBe("Rıza'yı");
    expect(accusative("Kâzım")).toBe("Kâzım'ı");
    expect(accusative("Nuriye")).toBe("Nuriye'yi");
    expect(accusative("Gül")).toBe("Gül'ü");
    expect(accusative("Onur")).toBe("Onur'u");
    expect(accusative("Şükran")).toBe("Şükran'ı");
    expect(accusative("Bekir")).toBe("Bekir'i");
    expect(accusative("Cemal")).toBe("Cemal'i");
    expect(accusative("Kemal")).toBe("Kemal'i");
  });

  test("oyun sonunda hikâye: gece, dava ve mühür durumu", async () => {
    const db = new Db(":memory:");
    const zcash = new MockZcashService();
    const seals = new SealQueue(db, zcash);
    const room = new Room("ABCDEF", { db, zcash, seals });
    await room.init();
    const pids = Array.from({ length: 7 }, (_, i) => room.join(`d${i}`, `o${i}`).pid);
    room.cmd(pids[0]!, { t: "cmd", c: "start" });
    const s = room.state;
    room.act(pids[0]!, { t: "act", a: "nominate" });
    for (const id of pids) room.act(id, { t: "act", a: "mvote", x: pids[0]! });
    const vamp = s.players.find((p) => p.role === "vampir")!.id;
    const doc = s.players.find((p) => p.role === "doktor")!.id;
    const prey = s.players.find((p) => p.role === "koylu" && p.id !== pids[0])!.id;
    // doktor fikir değiştirir: hikâyede yalnız son seçimi görünmeli
    room.act(doc, { t: "act", a: "night", x: prey });
    room.act(doc, { t: "act", a: "night", x: doc });
    room.act(vamp, { t: "act", a: "night", x: prey });
    room.cmd(pids[0]!, { t: "cmd", c: "startDay" });
    const others = s.players.filter((p) => p.alive && p.id !== vamp).map((p) => p.id);
    room.act(others[0]!, { t: "act", a: "accuse", x: vamp });
    room.act(others[1]!, { t: "act", a: "second", x: vamp });
    room.act(vamp, { t: "act", a: "done" });
    for (const id of others) if (s.day.stage === "verdict") room.act(id, { t: "act", a: "verdict", y: true });
    expect(s.phase).toBe("END");
    await seals.flush();
    const pub = publicView(room, seals, "mock");
    expect(pub.reveal?.seedOk).toBe(true);
    const text = pub.story!.flatMap((c) => c.lines.map((l) => l.text)).join("\n");
    expect(text).toContain("(vampir)");
    expect(text).toContain("ölü bulundu");
    expect(text).toContain("asıldı: vampirdi");
    expect(text).toContain("(doktor) kendini korudu.");
    expect(text.match(/\(doktor\)/g)?.length).toBe(1);
    expect(pub.story!.map((c) => c.title)).toEqual(["Seçim", "1. gece", "1. gün"]);
    expect(pub.story!.every((c) => c.lines.every((l) => l.sealed))).toBe(true);
  });
});
