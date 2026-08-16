# ZKöy API — kesin sözleşme (Flutter hizalama dosyası)

> Bu dosya sunucunun **gerçek** istek/cevap şekilleridir (SPEC §3'ün somut hali).
> Model sınıflarını buradaki alan adlarına birebir hizala. Taban URL:
> `http://<laptop-IP>:3131` (telefon aynı Wi-Fi'da; CORS açık).

## İlk spec'ten farklar (ÖNEMLİ)

- **TEK MOD: Ağalık.** `mode` alanı HİÇBİR yerde yok. Oda kurarken gövde gönderilmez.
- Herkes katılırken kademe seçer: `tier` 1=Rençber, 2=Muhtar, 3=Ağa (oy ağırlığı = tier).
- Kademe taahhüdü (commit) tamamen sunucuda — istemci hash'le uğraşmaz.

## Genel

- Tüm cevaplar JSON. Hata: HTTP 400/404/500 + `{"error":"türkçe mesaj"}` — direkt ekrana basılabilir.
- Durum yenileme: `GET state`'i **1-2 sn'de bir** poll'la. Sayaçlar `endsAt`'ten (epoch ms, `null` olabilir) istemcide hesaplanır.
- Fazlar: `LOBBY → NIGHT → DAWN → DAY → VOTE → EXECUTION → (NIGHT... | END)`
- Roller: `vampir | koylu | doktor | gozcu | deli`

## 1. Oda kur

`POST /room` (gövdesiz)

```json
{ "code": "UJ4Z", "roomAddress": "utest1..." }
```

## 2. Katıl

`POST /room/UJ4Z/join`

```json
{ "name": "Asiye", "tier": 3 }
```

→

```json
{ "playerId": "p0-f390f802", "token": "b1946ac9-...", "playerAddress": "utest1..." }
```

`token`'ı sakla — tüm aksiyonlar ve kişisel state bununla. İsim odada benzersiz olmalı
(tek tırnak `'` isimden silinir, 24 karakter üstü kırpılır).

## 3. Başlat (ebe/kurucu butonu)

`POST /room/UJ4Z/start` → `{ "ok": true }` (7'den az oyuncuda 400 döner)

## 4. Durum

`GET /room/UJ4Z/state?token=<token>` — token'sız da çalışır (perde verisi), `me`/`ghost` gelmez.

```json
{
  "code": "UJ4Z",
  "phase": "NIGHT",
  "round": 1,
  "endsAt": 1786920000000,
  "potZats": 2900000,
  "height": 4276002,
  "players": [ { "id": "p0-f390f802", "name": "Asiye", "alive": true } ],
  "voteWeightCast": null,
  "announcements": [
    { "at": 1786919000000, "kind": "dawn", "text": "Şafak söktü. ...", "will": "vasiyet metni | null" }
  ],
  "winner": null,
  "roomAddress": "utest1...",
  "chain": "mock",
  "sealedCount": 4,
  "me": {
    "id": "p0-f390f802",
    "name": "Asiye",
    "role": "gozcu",
    "alive": true,
    "tier": 3,
    "will": null,
    "acted": false,
    "targets": [ { "id": "p1-...", "name": "Cemal" } ],
    "gozcuResult": { "name": "Rıza", "vamp": true }
  }
}
```

Alan notları:

- `voteWeightCast`: yalnız `VOTE` fazında sayı (sandıktaki toplam ağırlık), diğer fazlarda `null`.
- `me.acted`: bu fazda hamlem alındı mı (gece hamlesi / oy). Buton kilitlemek için.
- `me.targets`: bu fazda seçilebilir hedefler. Gece köylüye boş `[]` gelir ("köy uyuyor" ekranı).
  Doktor listesinde **kendisi de vardır** (kendini koruyabilir).
- `me.gozcuResult`: yalnız gözcüde; son gecenin sorgu cevabı, yoksa `null`.
- `winner`: `"koy" | "vampir" | null`.
- Ölünce ekstra `ghost` alanı gelir (hayalet ekranı — mühürlü oda memo akışı):

```json
"ghost": { "memos": [ { "txid": "mock:3", "memo": { "v": 1, "t": "night", "r": 1, "p": "p2-...", "x": "p0-..." } } ] }
```

- `phase === "END"` iken ekstra `end` alanı:

```json
"end": {
  "payouts": [ { "name": "Cemal", "zats": 2372727, "reason": "köy kazandı" } ],
  "ufvk": "uviewtest1...",
  "reveals": [ { "name": "Asiye", "tier": 3, "salt": "…", "commit": "6f6d…", "role": "koylu" } ]
}
```

## 5. Aksiyon

`POST /room/UJ4Z/action`

```json
{ "token": "…", "type": "night", "target": "p1-…" }
{ "token": "…", "type": "vote",  "target": "p1-…" }
{ "token": "…", "type": "gvote", "target": "p1-…" }
{ "token": "…", "type": "will",  "txt": "en fazla 200 karakter" }
```

→ `{ "ok": true }` | 400 `{ "error": "…" }`

- `night`: vampir/doktor/gözcü, NIGHT fazında. Aynı fazda tekrar gönderim hamleyi günceller.
- `vote`: yaşayanlar, VOTE fazında. `gvote`: yalnız ölüler (kehanet), VOTE fazında.
- `will`: yaşayan herkes, her fazda.
- Tüm gece aktörleri + tüm yaşayan oyuncular oy verince faz **erken çözülür** — sayaç beklenmez.

## 6. Perde ve ifşa

- Perde sayfası (projeksiyon, tarayıcı): `GET /screen/UJ4Z` — Flutter'ın işi değil, hazır.
- `POST /room/UJ4Z/reveal` → `{ ufvk, roomAddress, reveals, timeline }` (denetim; normalde perde kullanır).
