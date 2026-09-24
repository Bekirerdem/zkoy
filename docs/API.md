# ZKöy API v3 — WebSocket sözleşmesi

> Web istemcisi ve Flutter uygulaması bu sözleşmeyi konuşur. Sunucu: `src/server/index.ts`.
> Kapsam: salon modu (SPEC v3 §3), misafir giriş. (v1'in HTTP API'si kaldırıldı.)

## Bağlantı

- `wss://zkoy.fun/ws` (yerelde `ws://localhost:3131/ws`). Tek soket; bütün mesajlar JSON, tek satır.
- İlk mesaj **her zaman** `hello`. `device` = cihazda kalıcı rastgele kimlik (localStorage / secure storage), ≤ 64 karakter.
- Token yalnız WS mesajında taşınır, URL'de asla. Cihazda sakla: `{code, token}` → sayfa yenilenince `hello` ile aynı koltuğa dönülür.
- Mesaj üst sınırı 4 KB. Hatalar `{"t":"error","e":"türkçe mesaj"}` — doğrudan ekrana basılabilir.
- Katılım linki / QR: `https://zkoy.fun/j/<KOD>` (web istemcisini açar, kod ön-dolu).

## İstemci → sunucu

| Mesaj | Ne zaman | Alanlar |
|---|---|---|
| `{"t":"hello","device":"…"}` | açılışta | isteğe bağlı `code` + `token` = yeniden bağlanma |
| `{"t":"create","name":"Ali","rules":{"gozcu":null,"accusedVotes":false}}` | oda kur | ad 1-16; `rules` isteğe bağlı (`gozcu`: `null` otomatik 13+, `true`, `false`) |
| `{"t":"join","code":"ACDE23","name":"Ayşe"}` | kodla gir | aynı cihaz aynı odaya yeniden girerse aynı koltuk |
| `{"t":"watch","code":"ACDE23"}` | perde / seyirci | yalnız `state` alır |
| `{"t":"act","a":…}` | oyuncu hamlesi | aşağıda |
| `{"t":"cmd","c":…}` | kurucu / Muhtar komutu | aşağıda |

### Hamleler (`act`)

| `a` | Faz | Alanlar | Kim |
|---|---|---|---|
| `nominate` | ELECTION | — | yaşayan, kendini aday gösterir |
| `mvote` | ELECTION | `x` aday id | yaşayan; herkes oy verince seçim kendiliğinden biter |
| `night` | NIGHT | `x` hedef | vampir (kurban), doktor (koruma, kendisi olabilir), gözcü (sorgu); hepsi seçince gece kendiliğinden biter |
| `accuse` | DAY (free) | `x` | yaşayan; suçlayan da destekçi sayılır |
| `second` | DAY (free) | `x` suçlanan | başka bir yaşayan destekler; destek ağırlığı `day.need`'e ulaşınca dava açılır (trial) |

**Dava eşiği:** destek ağırlığı (Muhtar'ınki oyu kadar: 2, 13+ oyuncuda 3) `need = max(3, ⌈yaşayan/3⌉)`, sanık dışındaki kişi sayısını geçemez (4-9 → 3, 10-12 → 4, 13-15 → 5). Oyuncu aynı anda tek kişiyi destekler; başkasını suçlar ya da desteklerse desteği oraya geçer. Dava açılınca `trial` memo'su (`x`, `by` destekçiler, `n` ağırlık) mühürlenir.
| `done` | DAY (trial) | — | sanık "savunmam bitti" → karar oyu |
| `verdict` | DAY (verdict) | `y` true=assın / false=asmasın | yaşayan; varsayılan kuralda sanık oy kullanmaz; sonuç kesinleşince kendiliğinden kapanır |
| `gvote` | DAY | `x` | hayalet (ölü) kehanet: bugün kim asılacak |
| `will` | her faz | `txt` ≤ 200 | yaşayan vasiyet |
| `heir` | DAWN / EXECUTION | `x` | ölen Muhtar halef gösterir (`me.heirRight`) |

### Komutlar (`cmd`)

| `c` | Faz | Kim |
|---|---|---|
| `start` | LOBBY | kurucu; en az 7 oyuncu |
| `kick` + `x` | LOBBY | kurucu |
| `closeElection` | ELECTION | kurucu (oy vermeyen varsa) |
| `closeNight` | NIGHT | kurucu, gece ≥ 90 sn sürdüyse (salon sigortası) |
| `startDay` | DAWN | Muhtar ya da kurucu |
| `toVerdict` | DAY (trial) | Muhtar ya da kurucu ("oylamaya geç") |
| `closeDay` | DAY (free) | Muhtar ya da kurucu → gece |
| `nextRound` | EXECUTION | Muhtar ya da kurucu → gece |

Düğmeleri `me.can` listesine göre göster; yetki yine sunucuda denetlenir.

## Sunucu → istemci

| Mesaj | İçerik |
|---|---|
| `{"t":"joined","code","pid","token"}` | create/join cevabı; `{code, token}` sakla |
| `{"t":"state","s":{…}}` | meydan (herkese açık), her değişimde |
| `{"t":"me","m":{…}}` | yalnız sana; her değişimde |
| `{"t":"error","e":"…"}` | reddedilen istek |

### `state.s`

```jsonc
{
  "code": "ACDE23", "phase": "LOBBY|ELECTION|NIGHT|DAWN|DAY|EXECUTION|END", "round": 1,
  "rules": { "gozcu": null, "accusedVotes": false },
  "hostPid": "p0", "muhtar": "p2", "muhtarWeight": 2, "heirPending": null,
  "players": [{ "id": "p0", "name": "Ali", "alive": true, "isHost": true, "isMuhtar": false, "role": null }],
  // role: yalnız ölüler ve END'de dolu
  "election": { "candidates": ["p2"], "votes": { "p0": "p2" }, "tally": { "p2": 1 } },
  "day": {
    "stage": "free|trial|verdict",
    "accusations": { "p3": "p4" },            // suçlayan → suçlanan (destek bekleyen)
    "backers": { "p4": ["p3", "p6"] },        // suçlanan → destekçiler (ilki suçlayan)
    "support": { "p4": 2 }, "need": 3,        // destek ağırlığı ve dava eşiği
    "trial": { "accused": "p4", "accuser": "p3", "seconder": "p5", "backers": ["p3", "p5", "p6"], "verdicts": { "p0": true } },
    "triedToday": [], "weights": { "p2": 2, "p0": 1 }  // dava varken oy ağırlıkları
  },
  "lastNight": { "round": 1, "died": "p6", "saved": false },
  "lastVerdict": { "round": 1, "accused": "p4", "lynched": "p4", "role": "vampir", "guilty": 5, "notGuilty": 2 },
  "winner": null, "deliWon": false,
  "badges": null, "kahinScore": null,           // END'de dolu
  "reveal": null,                                // END: { seed, salt, commit, ufvk, roomAddress }
  "nightStartedAt": 1790000000000,
  "announcements": [{ "at": 0, "kind": "info|dawn|verdict|end", "text": "…", "will": "…" }],
  "seals": { "chain": "zingo|mock", "txCount": 4, "memoCount": 31, "pending": 2, "recent": ["txid…"] }
}
```

### `me.m`

```jsonc
{
  "pid": "p3", "name": "Ayşe", "role": "vampir", "alive": true,
  "isHost": false, "isMuhtar": false, "will": null,
  "team": ["p7"],                                  // vampirse diğer vampirler
  "night": { "targets": { "p3": "p1" } },          // gece: vampir takım hedefleri | {save} doktor | {query} gözcü
  "gozcuLog": [{ "round": 1, "target": "p4", "vamp": true }],
  "roles": null,                                   // ölüysen herkesin rolü (hayalet)
  "myProphecy": null, "heirRight": false,
  "can": ["accuse", "second", "will"]
}
```

## Akış özeti

1. `hello` → `create` (kurucu) → `joined` → QR/`/j/KOD` paylaş → diğerleri `hello` → `join`.
2. Kurucu `cmd start` → ELECTION: `nominate` / `mvote` → Muhtar ilan edilir → NIGHT.
3. NIGHT: rol sahipleri `night` → otomatik DAWN (duyuru: ölen + rolü, vasiyet).
4. DAWN: Muhtar `startDay` → DAY: `accuse` → `second` → sanık `done` (ya da Muhtar `toVerdict`) → herkes `verdict` → asılırsa EXECUTION (Muhtar `nextRound`), beraatse DAY devam; gün sonu Muhtar `closeDay`.
5. END: `state.reveal` (kura tohumu+tuz, oda görüntüleme anahtarı) + rozetler; sunucu `gameroot` mührünü gönderir.

## HTTP

- `GET /stats` → `{games, finishedGames, uniqueDevices, playerSeats, sealedTx, sealedMemos, since, liveRooms, chain, opsBalanceZat, height}`
- `GET /health` → `{ok, chain}`
