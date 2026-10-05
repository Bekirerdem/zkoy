# Mobil uygulama devri (Selinay) — 5 Ekim 2026

Hedef: ZKöy'ün Flutter uygulaması, **iOS App Store** (önce) ve Google Play. Uygulama, web istemcisinin yaptığı her şeyi aynı sunucuya bağlanarak yapar. Sunucu ve kurallar hazır; uygulama yalnızca istemci.

## Envanter: neyin nerede olduğu

| Ne | Nerede |
|---|---|
| Sunucu (canlı) | `wss://zkoy.fun/ws` · sağlık `https://zkoy.fun/health` · sayaç `https://zkoy.fun/stats` |
| Sözleşme (tek kaynak) | [`docs/API.md`](API.md): WebSocket mesajları, `state` / `me` alanları, hamle ve komut tabloları, dava eşiği |
| Çalışan referans istemci | [`web/app.js`](../web/app.js): her ekranın mantığı burada; uygulama aynı mesajları gönderip aynı alanları okur |
| Ekran tasarımları | Claude tasarım tuvali "ZKöy Web Ekranları" (32 ekran: A · Fener yönü, ebe anlatımları, 5 kural kartı, oda kurma, ifşa partisi, perde, kumanda). Bekir tuvali Share menüsünden paylaşmalı; paylaşılmadan açılmaz |
| Kurallar ve ürün kararları | [`SPEC.md`](../SPEC.md) (özellikle §2 kurallar, 25 Eyl güncellemesi: dava eşiği, sanık oyu sabit) |
| Mevcut Flutter kodu | `mobile/` (v1 ekranları + senin eklediğin v2 veri modelleri ve i18n iskeleti) |
| Prova botları | `bun tools/bots.ts <ODA> 6 wss://zkoy.fun/ws` (insan temposu; `--hizli` hızlı) |
| Yerel sunucu | `bun install && bun run dev` (mock zincir, `ws://localhost:3131/ws`) |

## Uygulamanın yapacağı akış (web ile birebir)

1. İlk açılış: 5 kural kartı (atlanabilir, lobide "Nasıl oynanır?").
2. Giriş: ad + oda kur / kodla gir / QR (`https://zkoy.fun/j/<KOD>` linki uygulamayı açmalı: universal link / app link).
3. Oda kurma: gözcü otomatik/var/yok (`create.rules.gozcu`).
4. Bekleme: QR + kod + paylaş, masa, rol dağılımı (`composition` mantığı `web/app.js` içinde), kurucuya "başlat".
5. Rol kartı + "senin gecen böyle geçer".
6. Ebe anlatımları: seçim, her gece, her dava (`pendingEbe` mantığı).
7. Seçim · gece · şafak · meydan (suçla/destekle, `day.backers`, `day.need`) · dava/savunma · karar oyu · infaz.
8. Son: kazanan, roller, ifşa partisi (`state.story`), mühür ayrıntısı (`state.reveal`: kura/tuz/kilit/görüntüleme anahtarı, kopyala).
9. Yeniden bağlanma: `{code, token}` cihazda sakla, açılışta `hello` ile aynı koltuğa dön.

## Mağaza için zorunlular (SPEC §11)

- **iOS:** `NSCameraUsageDescription` (QR), gizlilik metni, App Store 1.2 / Google UGC: oyuncu şikayet / engelle, kurucu at (sunucuda `kick` LOBBY'de var; şikayet / engelle henüz sunucuda YOK, eklenmesi gerekirse Bekir'e).
- Uygulama kripto kelimesi göstermez (cüzdan / ZEC / memo yok); mühür sayacı ve ifşa partisi yeter. Liste metninde Zcash tek cümle; "NFT" geçmez.
- 3.1.5 (kripto): oyuncuya görev karşılığı kripto yok; para hiçbir sürümde yok.
- Android release manifestinde `INTERNET` izni (7 Eylül'de eklendi).

## Bilinen açıklar ve bağımlılıklar

- ✅ **NU7 (5 Ekim):** sunucu NU7'ye yükseltildi (Zakura 2.2.0); mühürler testnet'e gidiyor. Uygulama tarafını etkilemez.
- Perde (büyük ekran) modu tasarlandı, kodlanmadı. Uygulama için gerekmiyor; telefon "kumanda" görünümü perde kodlanınca eklenir.
- Sözleşmede değişiklik gerekirse önce `docs/API.md` güncellenir, web ve uygulama aynı sözleşmeyi konuşur.
