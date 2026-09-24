import { expect, test } from "bun:test";
import { Db } from "../src/server/db";
import { Room } from "../src/server/room";
import { SealQueue } from "../src/server/seal-queue";
import { MockZcashService } from "../src/zcash/mock";

test("seçimde eşitlik masaya duyurulur: kim berabere, kura kimi seçti", async () => {
  const db = new Db(":memory:");
  const zcash = new MockZcashService();
  const room = new Room("ABCDEF", { db, zcash, seals: new SealQueue(db, zcash) });
  await room.init();
  const p = Array.from({ length: 7 }, (_, i) => room.join(`d${i}`, `o${i}`).pid);
  room.cmd(p[0]!, { t: "cmd", c: "start" });
  room.act(p[1]!, { t: "act", a: "nominate" });
  room.act(p[2]!, { t: "act", a: "nominate" });
  // 3-3 berabere, bir oy üçüncü adaya
  room.act(p[3]!, { t: "act", a: "nominate" });
  for (const v of [p[0], p[1], p[4]]) room.act(v!, { t: "act", a: "mvote", x: p[1]! });
  for (const v of [p[2], p[5], p[6]]) room.act(v!, { t: "act", a: "mvote", x: p[2]! });
  room.act(p[3]!, { t: "act", a: "mvote", x: p[3]! });
  expect(room.state.phase).toBe("NIGHT");
  expect([p[1], p[2]]).toContain(room.state.muhtar!);
  const last = room.announcements[room.announcements.length - 1]!.text;
  expect(last).toContain("o1 ile o2 3-3 berabere kaldı");
  expect(last).toContain("Ebe kura çekti");
});
