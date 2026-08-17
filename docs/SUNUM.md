# ZKöy Sunum Kartı — çapalar (ezber metin değil, iskelet)

> Süre ~10 dk: 1 dk tez → 5-6 dk canlı el → 2 dk ifşa → 1 dk kapanış.
> Teknik kurulum: DEMO.md. Bu kart sahnede elinde duracak tek kağıt.

## Açılış (60 sn) — tek nefes

"Zcash'te her gizli ödemenin içinde şifreli bir mektup alanı var. Biz Vampir
Köylü'nün bütün sırlarını o mektuplarla taşıyoruz: rolün mektupla gelir, oyunu
mektupla atarsın. Mektuplar köyün kilitli sandığında birikir; ölürsen sandığı
okuyabilen bir hayalet olursun. Oyun bitince sandığın okuma anahtarını perdeye
basarız — herkes kendi gözüyle doğrular. Para da gerçek: pot ve ödüller gizli
Zcash ödemesiyle gider."

Beş eşleme (parmakla say): **rol=şifreli mektup · oy=mühürlü zarf ·
hayalet=görüş anahtarı · pot=gizli ödeme · ifşa=anahtar teslimi**

## Canlı el (5-6 dk)

- Perde projeksiyonda, QR perdede — salon katılır (kod elle de girilebilir).
- Sen ebe-kurucu: tempoyu "Oylamaya Geç" ile sen tutarsın.
- Oyun akarken TEK cümle at: "Şu an attığınız her oy gerçek Zcash testnet'ine
  mühürleniyor — sağ üstteki sayaç zincirdeki işlem sayısı."

## An 1 — "Zincir kör" (oyun ortasında, 30 sn)

Perdedeki mühür sayacını göster → bir txid'yi explorer'da aç
(testnet.cipherscan.app) → "Bakın: işlem var, blok belli — ama kim, kime, ne,
kaç para... HİÇBİR ŞEY görünmüyor. Gizlilik bu ürünün süsü değil, kendisi."

## An 2 — İfşa partisi (2 dk)

- Perdede: kazananlar defteri + kademe taahhütleri + MÜHÜR DEFTERİ + UFVK.
- "Ebe bendim, merkeziydim — ama CAM'dım. İşte sandığın anahtarı." →
  jüri komutu canlı (DEMO.md) ya da Ywallet'ı olan varsa UFVK import.
- Taahhüt vurgusu: "Kim Ağa'ydı şimdi öğrendiniz — ama zincire OYUNDAN ÖNCE
  mühürlenmişti; ben bile sonradan değiştiremezdim."

## Kapanış (60 sn)

- NU7 bağı: "Zcash 25 Ağustos'ta gizli oylamayla yönetilecek (NU7). Biz aynı
  fikri bir salonda oynattık — Ağalık modu, coinholder yönetişiminin minyatürü."
- Yol haritası merdiveni: ZIP-321 ile kendi cüzdanından katılım → commit-reveal
  oy → FROST eşik-ebe.
- "Sinancan — sıradaki etkinlikte bununla oynatın."

## Jüri soruları — cevap çapaları

**"Cüzdan bağlantısı nerede?"** → Zcash'te dApp-cüzdan köprüsü diye bir katman
yok (kontrat yok ki dApp olsun). Zcash'in entegrasyon primitifi GÖRÜŞ ANAHTARI —
onu ürünün kalbine koyduk; herkes UFVK'yı kendi cüzdanına import edip okuyabilir.
ZIP-321 ile kendi cüzdanından ödeme, yol haritasının 1. basamağı.

**"Sunucu hile yapsa?"** → Gerçek zamanda güven custodial — ama her hamle ANINDA
zincire mühürleniyor. Oyun sonu anahtar ifşasında hile matematiksel olarak
yakalanır (taahhüt eşleşmez, oy sayımı tutmaz). "Güvenme, doğrula"nın oyun hali.

**"Bunu Ethereum'da yapsan?"** → Yapılmış — 2018'den beri on-chain Mafia var,
hepsi kontratlı ve HERKESE AÇIK state'le (gizlilik yok ya da devre yazarsın).
Bizim fark: kontratsız, memo-tabanlı, gizlilik protokolden bedava. Zcash'te ilk,
kontratsız her yerde ilk.

**"Neden blockchain gerekiyor?"** → Üç garanti sunucu veremez: (1) sonradan
değiştirilemez zaman damgası (vasiyet infazdan önce yazıldı mı?), (2) bozulamaz
taahhüt (kademe), (3) sansürsüz denetim (anahtar bende olsa da kanıt zincirde).

**"Testnet'te mixnet/Nym var mı?"** → Dürüst cevap: mainnet'te gönderimler Nym
mixnet'ten gider (IP gizliliği); testnet'te transmit rehberi mainnet-only olduğu
için clearnet yaması yazdık (repo'da belgeli). İki katmanlı gizlilik anlatısı
mainnet için doğru.

**"Deli ne işe yarıyor?"** → Sosyal sigorta + ekonomik tuzak: yanlış linç etmenin
bedeli var (potun %10'u gider). 8+ oyuncuda giriyor.

## Sahne disiplini

- Build'e ve sunucuya sunumdan sonra DOKUNMA (SW cache + kuyruk kuralı).
- Oyun bitince mühürler akana kadar sunucu açık kalsın.
- İnternet ölürse: LAN moduna geç (DEMO.md) — oyun aynı, sadece link değişir.
