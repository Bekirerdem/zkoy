import { expect, test } from "bun:test";
import { powOk, solvePow } from "../src/zcash/faucet";
import { parseShieldedBalance } from "../src/zcash/zingo";

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
