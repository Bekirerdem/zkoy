# ZKöy

**Vampir Köylü on Zcash** — mühürlü oylama protokolü (**Mühür**) memo üstünde,
kanıtı salonda oynanan oyun. Rlay Blockchain Week Şirince, ZcashTR 48h Challenge.

Tek doğruluk kaynağı: [SPEC.md](SPEC.md) (kurallar, memo şeması, API).

## Çalıştırma

```bash
bun install          # bağımlılık yok ama lock için
bun run dev          # mock zincir, http://localhost:3131
ZKOY_CHAIN=zingo bun run dev   # gerçek testnet (yamalı zingo-cli gerekir,
                               # bkz. docs/zingo-patch.md)
bun test             # motor testleri
```

Perde: `http://localhost:3131/screen/<ODA>` — projeksiyona tam ekran.

### Ortam değişkenleri

| Değişken | Varsayılan | Ne |
|---|---|---|
| `ZKOY_CHAIN` | `mock` | `zingo` = gerçek testnet |
| `ZKOY_PORT` | `3131` | HTTP port |
| `ZKOY_MIN_PLAYERS` | `7` | Prova için düşürülebilir |
| `ZKOY_T_NIGHT/DAWN/DAY/VOTE/EXECUTION` | 75/12/120/75/12 | Faz süreleri (saniye) |
| `ZINGO_BIN`, `ZKOY_OPS_DIR`, `ZKOY_WALLETS_ROOT`, `ZKOY_LWD` | bkz. `src/zcash/zingo.ts` | zingo yolları |

## Mimari (özet)

```
[Flutter (oyuncu)] --HTTP poll--> [Bun sunucu: oda motoru + API + perde]
                                        └─> Zcash servisi ──> zingo-cli ──> testnet
```

- `src/engine/` — saf durum makinesi; her sır MemoEvent olarak çıkar
- `src/zcash/` — mühürleme seam'i: `mock.ts` (Faz 1) / `zingo.ts` (Faz 2)
- `src/server/` — API + faz sayaçları + perde sayfası

API sözleşmesi SPEC §3'te; Flutter tarafı yalnız oraya bakar.
