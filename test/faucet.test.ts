import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faucetTick, powOk, solvePow } from "../src/zcash/faucet";
import { MockZcashService } from "../src/zcash/mock";
import { parseShieldedBalance } from "../src/zcash/zingo";

test("faucetTick: donmuş bakiyeyle yeniden istemez, bakiye tazelenince ister", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zkoy-faucet-"));
  try {
    let bal = 229_010_000; // VPS'teki 5 TAZ eşiğinin altında
    const zcash = new MockZcashService();
    zcash.balance = async () => bal;
    let claims = 0;
    let now = 0;
    const opts = {
      reserveZat: 500_000_000,
      sources: [{ name: "musluk", claim: async () => ++claims }],
      stateFile: join(dir, "faucet.json"),
      now: () => now,
    };
    await faucetTick(zcash, "utest1ops", opts);
    expect(claims).toBe(1);
    // Günler geçer, cüzdan hiç senkronlanmaz: bakiye aynı → talep yok.
    for (let day = 1; day <= 30; day++) {
      now = day * 86_400_000;
      await faucetTick(zcash, "utest1ops", opts);
    }
    expect(claims).toBe(1);
    // Bir mühür gönderimi bakiyeyi tazeler; talep gelmemiş, hâlâ eşiğin altında.
    bal = 228_960_000;
    await faucetTick(zcash, "utest1ops", opts);
    expect(claims).toBe(2);
    // Talep geldi: eşiğin üstünde, durur.
    bal = 528_960_000;
    now += 2 * 86_400_000;
    await faucetTick(zcash, "utest1ops", opts);
    expect(claims).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("solvePow: bulunan nonce zorluğu sağlar, bir öncekiler sağlamaz", () => {
  const n = solvePow("tohum", 10);
  expect(powOk("tohum", n, 10)).toBe(true);
  for (let i = 0; i < n; i++) expect(powOk("tohum", i, 10)).toBe(false);
});

test("parseShieldedBalance: zingo metin çıktısından onaylı shielded toplam", () => {
  const text = `[
    confirmed_ironwood_balance: 215_000
    unconfirmed_ironwood_balance: 0
    confirmed_orchard_balance: 10_000
    confirmed_sapling_balance: 0
    confirmed_transparent_balance: 99_999
]`;
  expect(parseShieldedBalance(text)).toBe(225_000);
  expect(parseShieldedBalance("boş")).toBeNull();
});
