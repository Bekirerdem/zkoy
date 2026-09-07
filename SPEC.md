# ZKöy v3 — Ürün Spec'i

> **ZKöy** = ZK + köy. Vampir Köylü on Zcash. Protokol katmanının adı **Mühür**.
> Repo `Bekirerdem/zkoy` (tek geliştirme dalı `main`; v1 hackathon sürümü `v1` dalı ve `v1-hackathon` etiketi). Takım: Bekir (sunucu + Zcash) · Selinay (Flutter).
> Bu dosya tek doğruluk kaynağı. Burada olmayan şey yapılmaz; kapsam tartışması çıkarsa buraya bakılır.
> v1 (17 Ağu 2026) `docs/SPEC-v1.md`, v2 (2 Eyl 2026, yeniden tasarım) `docs/SPEC-v2.md` altında arşivdir. v3 bu ikisinin üstüne **ürünleştirme** katmanıdır; oyun kuralları v2'den gelir, yalnız §2'de işaretli değişiklikler yapılır.

## 0. Neden v3

v2 oyunu masada oynanır hâle getirdi: sayaç yerine ebe, gizli oy yerine açık dava, pot yerine sponsorlu ödül. v3'ün sorusu farklı: **bu oyun bir ürün olarak nasıl yaşar?** 5-7 Eylül 2026 konuşmalarından (Bekir, Selinay, prova elleri, Zcash güncellemeleri) çıkan kararlar:

- Müşteri **grup**: 7-15 kişilik, birlikte vakit geçirmek isteyen arkadaş masası. Gerçek dünyada yıllardır oynanan oyunun uygulaması.
- Kanıt **"oynanıyor"**: dağıtım kendi çevremiz artı pazarlama; tur (ZcashTR, Ekim) güçlendirici koz, tek kanal değil. Grant şansı gerçek oyuncu sayısıyla büyür.
- **Mobil önce**, web sonra; uygulama mağazada ücretsiz.
- **Hesap ve profil** var: okey odası modeli, oda kur / kodla gir / rastgele gir.
- **Para ilk sürümde yok.** Oyuncudan para alınmaz, oyuncu para koymaz. Puan, rozet ve sezon tablosu oyunlaştırmanın omurgası. Sponsorlu ödül yalnız etkinlik odalarında. VIP (oyuncu potu) ertelendi, §13.
- **Mühür değişmez.** Rol, gece, oy, kura zincirde. "Mühür giderse grant gider." Zincir noterdir, perde değil.
- **Zakura Common** entegre edildi (7 Eyl): gönderim 3,5 s → 1,0 s. Detay `docs/zingo-patch.md`.
- **Ölçek** baştan: aynı anda yüzlerce oda, herkes kendi odasını kurar.

---

## 1. Ürün çerçevesi

| Soru | Karar |
|---|---|
| Kim oynar | 7-15 kişilik gruplar; yaş 12+ |
| Nerede | Salon (aynı mekân) ve uzaktan (herkes evinde); iki ayrı mod, karışık masa yok |
| Ne kadar | Ücretsiz; hesap isteğe bağlı (misafir girer), rozet ve puan taşımak için hesap |
| Platform | Flutter: iOS ve Android mağazada; aynı kod web'de (PWA) etkinlik girişi için |
| Gelir | İlk sürümde yok; sonra etkinlik organizatörü ücreti, grant, kozmetik |
| Kanıt | oyun · gerçek oyuncu · hesap · şehir · zincir kaydı |

---

## 2. Oyun kuralları v3

v2 §1 aynen geçerlidir (kompozisyon tablosu, roller, seçim, faz döngüsü, dava akışı, kazanma). Değişen ve netleşen maddeler:

### 2.1 Oda kuralları (kurucu oda kurarken seçer)

| Kural | Seçenekler | Varsayılan | Kaynak |
|---|---|---|---|
| Perde | var / yok | yok (salonda perde varsa açılır) | Selinay: "topluluklarda perdesiz de oynanabilmeli" |
| Gözcü | var / yok | 13+ oyuncuda var, 12 ve altında yok; kurucu değiştirebilir | Bekir 7 Eyl: "12 altında çok güçlü"; Selinay: "oda kurulurken sorulsun" |
| Sanık kendi davasında oy kullanır | evet / hayır | **hayır** | Bekir 7 Eyl; prova: Muhtar sanıkken çift oyla kendini kurtarıyordu |

Sanık oy kullanmayınca "Muhtar ağırlığı kendi davasında sayılır mı" sorusu düşer: sayılmaz, çünkü oy yok. Karar oyu yarı hesabı yaşayan **oy kullanabilenlerin** toplam ağırlığı üzerinden yapılır (sanık hariç).

### 2.2 Muhtar

- **Her oyunda vardır.** Seçim isteğe bağlı değil; aday yoksa kura, eşitlikte tohumlu kura. Soru "seçelim mi" değil "kim olsun".
- Makamdır, rol değildir; vampir de seçilebilir. Ekranda rozetle görünür; roller görünmez.
- Yetkileri: oyu 2 (13+ oyuncuda 3), "oylamaya geç", "günü kapat", ölürken halef. Moderasyon yetkisi yok, o kurucuda (§6).

### 2.3 Puan, rozet, sezon (Selinay: "para olmazsa puan mantığı")

- **Rozet** zincirde (v2 §5): kazanan, Deli, Kâhin, Muhtar, şehir. Kalıcı, silinmez.
- **Puan** sunucuda, temsili, oyda ağırlığı yok: kazanan taraf +3, Muhtar seçilmek +1, Deli olarak asılmak +3, doğru kehanet +1, oyunu bitirmek (ayrılmamak) +1.
- **Sezon tablosu:** sezon = takvim ayı; tablo sıfırlanır, rozetler kalır. Genel tablo ayrıca.
- **Unvan** rozet sayısından türer; isimler Bekir'in sesinden (§15).
- Galibiyet tablosu ve profil kartı (oyun sayısı, kazanma oranı, rozetler) hesabı olanlara.

### 2.4 Değişmeyenler

Açık oy (ekranda açık, zincirde mühürlü), sayaçsız salon, uzaktan modda üst sınırlar, hayalet ve kehanet, kanıtlı kura, ifşa partisi. Gizli oyun geri dönüşü yalnız test masaları "keyif vermedi" derse gündeme gelir (Selinay), spec'te yok.

---

## 3. Modlar

| | Salon | Uzaktan |
|---|---|---|
| Ses | Kapalı, masa konuşur | **İlk sürümde yazılı chat**; ses (LiveKit) sonraki sürüm |
| Chat | Yok | Kanal etiketli: köy / vampir / hayalet |
| Perde | İsteğe bağlı; yoksa meydan telefonda, kumanda altında | Meydan herkesin ekranında |
| Üst sınırlar | Yok | Var: gece 2 dk, savunma 2 dk, karar 1 dk, gün 10 dk |
| Giriş | QR ya da kod; oyuncu indirmeden web'den girebilir | Hesapla; oda kodu, davet linki ya da açık oda listesi |

Perde varsa telefon kumanda sekmesinde açılır, kaydırmayla meydana geçilir; perde yoksa telefon doğrudan meydanda açılır (17 Ağustos dersi: kafalar masada olsun, perde varken varsayılan kumanda).

Ses ertelemesinin sebebi maliyet: yüzlerce eşzamanlı ses odası kendi sunucumuzda çalışmaz, LiveKit Cloud gerekir. Online kurt adam oyunlarının çoğu yazılı chat ile oynanıyor; rastgele oda modeli yazılı chat ile başlar.

---

## 4. Hesap ve profil

- **Misafir:** cihaz anahtarı, ad, avatar. Normal odaya girer, oynar. Puan ve rozet cihazda birikir, hesap açınca taşınır.
- **Hesap:** Apple ve Google girişi (Apple kuralı gereği ikisi birlikte). E-posta istenmez, telefon istenmez.
- **Profil:** ad, avatar, rozetler, puan, sezon sırası, oyun sayısı, kazanma oranı, unvan.
- **Oyuncu kripto kelimesi görmez.** Cüzdan, ZEC, memo hiçbir formda yok. Zcash perdede ("mühür sayacı") ve ifşa partisinde hissedilir.
- **Bildirim:** mağaza sürümünde push ("gece bitti", "dava açıldı: sen", "oylama başladı"); web'de ses ve titreşim.
- **Dil:** Türkçe önce; İngilizce çeviri dosyası baştan yapıda.

---

## 5. Odalar

### 5.1 Üç giriş yolu (okey odası modeli, Selinay + Bekir 5 Eyl)

1. **Oda kur:** mod, kurallar (§2.1), görünürlük (özel / herkese açık), en fazla oyuncu. Kurucu = ev sahibi.
2. **Kodla gir:** 6 karakterlik kod ya da davet linki (`zkoy.fun/j/KOD`). Salon QR'ı aynı linki taşır.
3. **Rastgele gir:** açık oda listesinden boş koltuğu olan bir odaya. Liste zaten var; rastgele = listeden seçen tek düğme, ek maliyet yok.

Açık oda listesi: mod, kural özeti, kaç kişi / kaç koltuk, bekleme süresi. Eşleştirme algoritması yok.

### 5.2 Oda türleri

| Tür | Kim kurar | Para | Zincir |
|---|---|---|---|
| **Normal** | Herkes | Yok | Kademeli noter (§9.2): oyun sonu özet mühür |
| **Etkinlik** | Etkinlik koduna sahip organizatör (tur, kurumsal gece) | Sponsorlu ödül havuzu, oyuncudan sıfır | Tam mühür, mainnet |

Etkinlik odası: etkinlik kodu, şehir, ev sahibi; rozetler şehir adıyla basılır; şehirler arası tablo bundan türer. Ödül dağıtımı §9.4.

VIP oda (oyuncu potu) bu sürümde yok; §13.

---

## 6. Moderasyon (Selinay: "kuranda olsun")

- **Kurucu:** sustur, oyundan at, odayı kapat. Atılan aynı odaya dönemez.
- **Herkes:** şikayet et (mesaj ya da oyuncu), engelle (engellediğin kişiyle aynı rastgele odaya düşmezsin).
- **Sunucu:** şikayet edilen mesaj `reports` tablosuna dondurulur, geri kalan chat oyun bitince silinir. Tekrarlayan şikayet hesabı işaretler; mağaza UGC kuralı gereği inceleme kuyruğu ve 24 saat içinde aksiyon.
- Yabancılarla dolu açık odada kurucunun kötüye kullanımı bilinen risktir; ilk sürümde kabul, şikayet verisiyle izlenir.

---

## 7. Mimari

İlke: **tempo sunucudan, kanıt zincirden, para bizim elimizden geçmez.**

```
[Flutter: iOS / Android / Web]  ──WebSocket──▶  [Bun sunucu, tek süreç]
                                                 ├─ Motor (saf durum makinesi, src/engine, v2 API)
                                                 ├─ Oda katmanı (tetikler, kurallar, yetki, yayın)
                                                 ├─ Hesap ve profil (Apple/Google/misafir, puan, sezon)
                                                 ├─ Oda listesi ve moderasyon
                                                 ├─ SQLite (kalıcılık)
                                                 └─ Zincir servisi ──▶ zingo-cli (Zakura Common) ──▶ lightwalletd
                                                       ├─ mock / testnet / mainnet bayrağı
                                                       ├─ ops cüzdanı: faucet otomasyonu, toz süpürme, eşik alarmı
                                                       └─ paket link cüzdanları (ödül)
```

- **Motor** (`src/engine`, v2'de bitti, 30 test): süre bilmez, "hamle geldi / komut geldi" bilir. Oda kuralları (§2.1) motor bayrakları: `gozcu`, `accusedVotes`; perde bayrağı istemci işi.
- **Oda katmanı** (`src/server`, yeniden yazılacak): üç tetik (aktörler tamamlandı, Muhtar/kurucu komutu, uzaktan mod üst sınırı); her olayda tam state yayını; kanal etiketli chat; yetki denetimi sunucuda (kurucu, Muhtar, sanık).
- **WebSocket:** oda başına kanal; token el sıkışmada; yeniden bağlanan son state'i alır; mesaj boyutu sınırlı.
- **Ölçek:** oda durumu bellekte, her olayda SQLite anlık görüntü; tek süreç birkaç bin bağlantı taşır. Ses olmadığı için ilk sürümde ek altyapı yok.
- **Perde:** Flutter web'in seyirci görünümü, aynı meydan bileşeni; sunucu HTML üretmez.
- **Dağıtım:** Hetzner CX32 (4 vCPU / 8 GB), Docker (bun + zingo-cli), zkoy.fun doğrudan VPS'e, tünel emekli. Topluluk lightwalletd (`testnet.zec.rocks`, mainnet `zec.rocks`); kendi Zakura düğümü (arşiv 252 GB) grant sonrası.
- **Prova sunucusu** (`tools/prova`, 5 Eyl) silindi; tetik mantığı ve bot davranışı bu belgeye ve omurga planına taşındı.

---

## 8. Veri şeması (SQLite)

- **users**: id, görünen ad, avatar, giriş türü (misafir / Apple / Google), sağlayıcı kimliği, cihaz anahtarı, oluşturma, işaret (moderasyon).
- **profiles**: kullanıcı, toplam puan, oyun sayısı, kazanma sayısı, unvan, son görülme.
- **season_scores**: sezon (YYYY-MM), kullanıcı, puan, oyun sayısı.
- **rooms**: kod (6), mod, görünürlük, kurucu, kurallar JSON (`gozcu`, `accusedVotes`, `perde`), en fazla oyuncu, etkinlik kodu (null olabilir), durum, oda cüzdan adresi + görüntüleme anahtarı (etkinlik odasında), state snapshot JSON, son güncelleme.
- **room_players**: oda, kullanıcı, oyuncu kimliği, koltuk, avatar, token hash, cüzdan adresi (etkinlik odasında), katılma, ayrılma.
- **games**: id, oda, başlangıç, bitiş, kazanan, oyuncu sayısı, kompozisyon JSON, kura taahhüdü, kura açılımı, özet hash (`gameroot`), özet txid.
- **events**: id, oyun, tur, faz, tür, yapan, hedef, payload JSON, zaman, mühür txid, mühür durumu. Her memo'nun ikizi; ifşa partisi ve özet hash buradan.
- **seal_queue**: id, olay(lar), gönderen cüzdan, alıcı adres, memo JSON, deneme, durum, txid. Kalıcı kuyruk.
- **chat_messages**: oda, kanal, oyuncu, metin, tur, faz, zaman. Oyun bitince silinir.
- **reports**: oda, şikayet eden, şikayet edilen, mesaj kopyası, sebep, durum, aksiyon.
- **blocks**: engelleyen, engellenen.
- **badges**: kullanıcı, oyun, tür, etiket, etkinlik kodu, memo txid, zaman.
- **tour_events**: kod, şehir, tarih, ev sahibi, sponsor havuzu (zat), dağıtım kuralı.
- **ops**: bakiye günlüğü, faucet talepleri, süpürme işlemleri.

**WebSocket mesajları.** Sunucudan: `state`, `me`, `chat`, `announce`, `rooms` (liste), `error`. İstemciden: `join`, `action` (motor hamlesi), `command` (kurucu/Muhtar), `chat`, `report`, `block`, `rooms` (listele).

**Gizlilik:** kişisel veri ad, avatar, sağlayıcı kimliği. Cüzdan anahtarları VPS diskinde, veritabanında değil, repo dışında.

---

## 9. Zcash katmanı

### 9.1 Zincir yolu

zingo-cli, fork `Bekirerdem/zingolib` dal `zakura-common`: upstream dev HEAD (Ironwood) + `network clearnet` yaması + Zakura Common crate'leri. Gönderim 1,0 s (dev HEAD 3,5 s). Reçete `docs/zingo-patch.md`. Sunucu binary'yi `ZINGO_BIN` ile alır, senkron işaretini `RUST_LOG=info` ile okur.

### 9.2 Kademeli noter

| Oda | Ne mühürlenir | Ne zaman | Ağ | Oyun başına |
|---|---|---|---|---|
| Normal | Oyun sonunda tek memo: `gameroot` (olay günlüğünün özet hash'i) + kura açılımı; rol kartı ve rozet yine oyuncuya memo | Oyun sonu | Testnet (ilk sürüm); mainnet grant sonrası | ≈ 0 |
| Etkinlik | Tam mühür, ekonomik mod: ops gönderir, faz başına toplu çok-memo tx | Faz başına | Mainnet | ≈ 0,5-1 $ (ZEC ≈ 800-1000 $) |
| Kanıt modu | Oyuncu cüzdanından hamle başına | Hamle başına | Mainnet | ≈ 12-18 $; yalnız fonlanan turnuva |

Normal odada olay günlüğü sunucuda durur; ifşa partisi günlüğü zincirdeki `gameroot` ile doğrular. Etkinlik odasında her satırın explorer linki vardır.

### 9.3 Memo protokolü v3

v2 tablosu (§5 v2) aynen; ekler:

```
ops→oda      gameroot {h, n, w}    normal oda oyun sonu özeti: olay hash'i, olay sayısı, kazanan
ops→oyuncu   prize    {zat, reason, event, pkt}   ödül; pkt = paket link cüzdanı kimliği (9.4)
```

Tüm memo'larda `v:3`, `g` (oda kodu). JSON ≤ 512 B. Motor bugün `v:2` üretiyor; `v:3` ve `gameroot` omurga adımında (§14-3) motora girer. `verdict` memo'ları sanık hariç oy kullananlardan gelir (§2.1).

### 9.4 Ödül ve cüzdan bağlama (Zpacket modeli)

- Oyuncu cüzdan kurmak zorunda değil. Ödül **paket link** olarak gider: her ödül için tek kullanımlık cüzdan, ZEC oraya, link oyuncuya; linki tutan alır (Zapp'ın Zpackets deseni, 3 Eyl 2026). Bizim v1 "oyuncu cüzdanı" modeli zaten buydu; artık ürün yüzü.
- İsteyen Zashi adresini QR / ZIP-321 ile bağlar: rol kartı, rozet ve ödül doğrudan oraya.
- Biz para tutmuyoruz: sponsor havuzu etkinlik cüzdanında, dağıtım oyun sonunda `prize` memo'lu gerçek ödeme, ödemeyen yok.
- Sponsor nasıl isterse öyle öder (TRY/USDT/ZEC), biz ZEC'e çeviririz; kazanan borsa linkiyle nakde çevirir. Havuz ve dağıtım tablosu etkinlik kaydında yazılıdır (mağaza yarışma kuralı, Apple 5.3.1).

### 9.5 Ops cüzdanı, sessiz depo (Bekir: "TAZ ile sürekli uğraşmayalım")

- **Faucet otomasyonu:** bakiye eşiğin altına inince sunucu `zcash-camp/tools/faucet.ts` mantığıyla (jinolabs, PoW, adres başı 0,1 TAZ / 24 s) kendisi talep eder; birden fazla ops adresi dönüşümlü.
- **Toz süpürme:** oyun bitince oda ve oyuncu cüzdanlarındaki toz ops'a geri; net maliyet yalnız işlem ücreti. Reçete: notlar `spend_status=unspent`, ücret 5000 × max(2, not sayısı).
- **Not bölme:** ops fonu 6+ nota bölünür (tek not ardışık gönderimi öldürür).
- **Eşik alarmı:** bakiye < 0,05 TAZ → log + Telegram bildirimi.
- Testler ve prova mock zincirde döner, TAZ harcamaz.

### 9.6 NU7 notu

25 saniyelik blok gelirse `DEFAULT_TX_EXPIRY_DELTA` (40 blok) 120'ye çekilir; aksi hâlde expired-tx rehin vakası üç kat sıklaşır. NU7 tx formatını değiştirmiyor, memo protokolü etkilenmez.

---

## 10. Güvenlik (7 Eyl repo denetimi)

- **Yetki sunucuda:** `start` yalnız kurucu, `openVerdict` yalnız sanık/Muhtar, `closeDay`/`nextRound` yalnız Muhtar/kurucu, `nameHeir` yalnız ölen Muhtar, `reveal` yalnız END. (v1'de reveal faz kontrolsüzdü; kapatıldı.)
- **Kimlik:** token WebSocket el sıkışmasında, sorgu parametresinde değil; token hash'i veritabanında; misafir cihaz anahtarı.
- **Oda kodu** 6 karakter (25 harfli alfabe ≈ 244 milyon); bilinmeyen koda deneme hız sınırı.
- **Hız sınırı:** oda kurma (gerçek cüzdan yaratır) IP ve hesap başına; katılma; chat; şikayet.
- **CORS:** same-origin; web sürümü aynı origin'den servis edilir.
- **Kura tohumu** CSPRNG; taahhüt `sha256(seed|salt)`, tuz sunucuda, açılım END'de.
- **Anahtarlar:** cüzdan dizinleri repo dışı, VPS'te yalnız servis kullanıcısı okur; loglarda memo içeriği ve anahtar yok.
- **Girdi:** ad ≤ 16, chat ≤ 280, vasiyet ≤ 200, memo ≤ 512 B; WS mesaj boyutu sınırı; HTML kaçışı perdede.
- **Bağımlılık:** `bun-types` ile `tsc` her push öncesi; `bun test`.
- **Mağaza:** UGC kuralı (şikayet/engelle/sustur/at), gizlilik metni, kamera ve internet izinleri (7 Eyl eklendi).

---

## 11. Mağaza ve web

- **Sıra:** Flutter uygulaması iOS (Selinay'ın Apple Developer hesabı, Mac'te yerel Xcode → TestFlight) ve Android (Windows'tan; Play hesabı sonra, kapalı test şartı 12 kullanıcı = tur oyuncuları). Web/PWA aynı build, etkinlik girişi ve masa için canlı kalır.
- **Liste:** ZKöy · Vampir Köylü · Oyun/Strateji · 12+ · gerçek ekran görüntüleri · TR + EN. "NFT" kelimesi geçmez; Zcash listede tek cümle.
- **Kurallar:** Apple 5.3.1 sponsorlu yarışma (etkinlik odası resmi kural metni), Apple 3.1.5 kripto (oyuncuya görev karşılığı kripto yok), Apple 1.2 / Google UGC (moderasyon §6), Apple 4.2 (Flutter native), Apple 4.8 (Google varsa Apple girişi).
- **Para:** mağaza sürümünde para yok; oyuncu potu hiçbir sürümde mağazaya girmez (lisans şartı, §13).

---

## 12. Tasarım dili ve ekranlar

- **Dil:** köy, gece, fener, mühür. Sıcak koyu zemin, tek accent fener altını, balmumu mühür kırmızısı. Karikatür köy ama çocuk oyunu değil; yapay görünüm yasak (Bekir: "çok yapay, güzel değil").
- **Yöntem:** önce tasarım sistemi (renk, tipografi, bileşenler), sonra Claude Design'da ekran ekran mobil akış, Selinay Flutter'ı ekranlardan yazar. Tasarım kararları Bekir + Selinay birlikte; solo UI kararı yok.
- **Ekran envanteri:** giriş (misafir / Apple / Google) · lobi (oda kur, kodla gir, rastgele gir, açık oda listesi) · oda kurma (mod, kurallar, görünürlük) · oda bekleme (koltuklar, QR, kural kartları) · rol kartı · seçim · gece hamlesi · şafak · meydan/gündüz · dava ve savunma · karar oyu · infaz · hayalet defteri ve kehanet · son ve ifşa partisi · profil ve rozetler · sezon tablosu · ayarlar ve moderasyon · perde (web seyirci görünümü).
- **Meydan** tek bileşen: perdede büyük, telefonda sekme; avatar çemberi, dava sanığı ortada, karar oyunda avatarlar iki tarafa döner, sayım ortada.

---

## 13. Kapsam dışı (bilinçli)

- **Oyuncu potu / VIP oda.** Ertelendi. Gelirse yalnız web'de ve para bizim üzerimizden geçmeden: defter modeli (taahhüt memo + doğrudan ödeme + itibar) ilk aday, eşik cüzdan (FROST 2-of-3, ZecMarket deseni) ikinci. Türkiye'de hukuki görüş şart. Mağaza sürümüne hiçbir zaman girmez.
- **Ses** (LiveKit): uzaktan mod ikinci sürümü.
- Karışık masa (salon + uzaktan) · eşleştirme algoritması · kendi Zakura düğümü (grant sonrası) · memo tabanlı chat · zincir üstü stablecoin · zorunlu self-custody · hayalet kehanetine para ödülü.

---

## 14. İnşa sırası ve kapı kuralları (süre yok; risk seviyesi var)

1. **Spec v3** — bu belge. *Bitti.*
2. **Tasarım sistemi ve ekranlar** (Bekir + Selinay) — §12 envanteri, Claude Design; kapı: envanterdeki ekranların hepsi onaylı. *Orta.*
3. **Sunucu omurgası** (Bekir) — WebSocket, SQLite (§8), oda katmanı ve yetki (§7, §10), hesap ve profil (§4), oda listesi (§5), moderasyon (§6), zincir servisi (§9: mock/testnet bayrağı, kademeli noter, ops otomasyonu), `docs/API.md` v3. Kapı: botsuz, gerçek sunucuda, testnet'te bir el. *Orta-yüksek.*
4. **Flutter v3** (Selinay) — ekranlar §12, WS istemcisi, misafir + hesap, salon ve uzaktan (yazılı chat). Kapı: iki cihaz + perde ile tam el. *Orta.*
5. **Çevrede ilk eller** — 7+ kişi, testnet, rozet ve puan canlı. Kapı: 10 gerçek el. *Düşük.*
6. **Etkinlik katmanı ve mainnet** — etkinlik odası, sponsor havuzu, paket link ödül, tam mühür mainnet; Bursa pilotu (Ekim). Kapı: mainnet'te bir prova eli. *Yüksek.*
7. **Mağaza** — iOS TestFlight → App Store; Android kapalı test → Play. *Orta.*
8. **Uzaktan mod v2** — ses (LiveKit), açık oda büyümesi. *Orta.*
9. **VPS** — Hetzner CX32, Docker, zkoy.fun; 3. adımla birlikte. *Düşük.*

---

## 15. Açık kararlar

| Karar | Kimde |
|---|---|
| Unvan isimleri ve marka metinleri (Bekir'in sesinden) | Bekir |
| Sezon süresi (ay varsayıldı) | Bekir + Selinay |
| Puan değerleri (§2.3 sayıları ilk eller sonrası ayarlanır) | Bekir + Selinay |
| Ses için zamanlama (uzaktan mod ikinci sürüm) | Bekir |
| VIP mekanizması ve hukuk (§13) | Bekir; şimdilik kapalı |
| Grant başvurusu bütçesi (Q4 retro 30 Eki–13 Kas; emsal 15-25 bin $) | Bekir |
