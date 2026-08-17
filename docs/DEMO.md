# ZKöy Demo Runbook — sahne günü kılavuzu

## Kurulum (5 dk, sunum öncesi)

```powershell
# 1. Sunucu (GERÇEK zincir):
cd C:\Users\l3eki\Desktop\Web3-projeleri\zkoy
$env:ZKOY_CHAIN = "zingo"; bun run src/server/index.ts

# 2. Tünel (ayrı terminal) — çıkan https linki oyuncu linkidir:
cloudflared tunnel --url http://localhost:3131

# 3. Kontrol: <link>/app/ telefonda açılıyor mu, <link> kök sayfası geliyor mu.
```

- Salon internetsiz kalırsa YEDEK: telefonlar laptop Wi-Fi'ına, link `http://<laptop-IP>:3131/app/`
  (QR kamera http'de çalışmaz → kod elle girilir; oyun aynen akar).
- Faz süreleri sahne için kısaltılabilir: `ZKOY_T_DAY=60 ZKOY_T_VOTE=45 ...` (saniye).
- Ops cüzdan bakiyesi ≥ 0.05 TAZ olmalı (`zingo-cli --offline balance`); azsa faucet.

## Oyun akışı

1. Ev sahibi (Bekir) `/app/` → isim → **Oda Kur** → kademe seç → kod + QR çıkar.
2. Perde: projeksiyonda `<link>/screen/<KOD>` tam ekran (F11).
3. Oyuncular QR'ı **telefon kamerasıyla** okutur (link `?join=KOD` ile açılır) ya da kodu elle girer.
4. 7+ kişi olunca **Oyunu Başlat**. Gerisi otomatik: gece → şafak → tartışma → oylama → infaz.
5. Eksik oyuncu varsa figüran: `bun <scratchpad>/driver.ts` benzeri curl'ler ya da Claude'a "figüran ekle".

## İki vurucu an (sunumun kalbi)

**An 1 — "Zincir kör":** Oyun ortasında perdedeki mühür sayısını göster; bir txid seç,
`https://testnet.cipherscan.app/tx/<txid>` aç → salon HİÇBİR ŞEY göremez
(adres yok, miktar yok, memo yok). "Gizlilik ürünün kendisi."

**An 2 — "Anahtar her şeyi açar":** Oyun bitince perdede İFŞA PARTİSİ + UFVK.
Jüri komutu (README'de de var) canlı çalıştırılır:

```powershell
zingo-cli.exe --chain testnet --server https://testnet.zec.rocks:443 `
  --data-dir <BOŞ-KLASÖR> --viewkey "<perdedeki-UFVK>" --birthday 4276100 `
  --waitsync messages
```

→ tüm oylar/hamleler JSON olarak dökülür. "Ebe merkeziydi ama CAM'dı — sözünü zincir tuttu."

**An 2.5 (opsiyonel, güçlü):** Jüriden birinin telefonunda Ywallet varsa perdeki UFVK'yı
izleme cüzdanı olarak import ettir (Ywallet → hesap ekle → view key, testnet) —
oyunun tüm defteri ADAMIN KENDİ CÜZDANINDA açılır. "Cüzdan entegrasyonu" sorusunun
Zcash'teki gerçek cevabı bu: bağlantı protokolü yok, GÖRÜŞ ANAHTARI var.
Not: cüzdan bağlama/self-custody sorusu gelirse → kontratsız zincirde dApp-cüzdan
köprüsü diye bir katman yok; ZIP-321 ile kendi cüzdanından katılım yol haritasının
1. basamağı (SPEC §6).

## Mühür kuyruğu disiplini (17 Ağu saha dersi)

- Kuyruk BELLEKTE: oyun bitti diye sunucuyu HEMEN kapatma — ödül+ifşa mühürleri
  akana kadar bekle (perdede "mühür N tx" artışı durunca güvenli).
- 5 turluk gerçek oyunda kuyruk birikti (sweep nazlanması + para üstü konfirmasyonu):
  oyun sırasında 2-3 tx normal, kalanı oyun sonrası 5-10 dk'da oturur. Panik yok.
- Demo sabahı ops cüzdanını taze böl (6×0.02 TAZ) + min_confirmations=1 doğrula —
  burst kapasitesi bu ikisinden geliyor.

## Bilinen huylar / hızlı çözümler

| Belirti | Sebep | Çözüm |
|---|---|---|
| Mühürler gecikiyor | testnet sweep nazlanması | Normal — kuyruk retry'lı, oyun beklemez; perdedeki sayaç sonradan artar |
| `have 0` / insufficient log'da | not parçaları konfirmasyon bekliyor | Kendini düzeltir (min_conf=1 + 7 not); panik yok |
| Jüri komutu boş döndü | sweep 0/2 | Aynı komutu tekrar çalıştır |
| Tünel linki öldü | laptop uyudu | `cloudflared tunnel --url http://localhost:3131` → yeni link, QR'lar yeni linke göre yeniden |
| Uygulama beyaz sayfa | build base href | Build `--base-href=/app/` ile alınmalı; sunucuda fallback da var |

## Sunum iskeleti (SPEC §8)

1. 60 sn tez + mimari (memo protokolü vurgusu: "kontrat yok, devre yok — protokolün kendisi")
2. Salonla Ağalık eli (hızlandırılmış: 1-2 gece)
3. An 1 (explorer köralığı) oyun sırasında
4. An 2 (ifşa partisi + canlı UFVK doğrulaması)
5. Kapanış: NU7 bağı (25 Ağu gizli oylama) + yol haritası (self-custody ZIP-321 → commit-reveal → FROST ebe) + "Sinancan, sıradaki etkinlikte bununla oynatın"
