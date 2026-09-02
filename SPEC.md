# ZKöy v2 — Tasarım Spec'i (yeniden tasarım)

> **ZKöy** = ZK + köy. Vampir Köylü on Zcash. Protokol katmanının adı **Mühür**.
> Repo `Bekirerdem/zkoy`. Takım: Bekir (sunucu + Zcash) · Selinay (Flutter).
> Bu dosya tek doğruluk kaynağı. Burada olmayan şey yapılmaz; kapsam tartışması çıkarsa buraya bakılır.
> v1 (17 Ağu 2026 challenge sürümü) `docs/SPEC-v1.md` altında arşivdir.

## 0. Neden v2

İki salon oyunu (17 Ağu jüri, 29 Ağu workshop) aynı şeyi gösterdi: oyun sevildi ama tadı çıkmadı. Kök neden sayaç: 30 sn tartışma + 30 sn oy, masayı okuyamayan bir saat. Gerçek oyundaki tartışma → birine takılma → suçlama → ikna savaşı → mutabakat akışı yoktu; gizli ve ağırlıklı oy masanın tek ipucunu (kim kime oy verdi) ortadan kaldırıyordu; potlu Ağalık modeli potsuz dünyada anlamsızlaştı.

**v2 tezi:** Uygulama saat değil ebe olur. Fazları masa kapatır. Oylar masadaki gibi açık, sırlar gecede. Zcash'in işi gece hamlelerini, kurayı ve kaydı mühürlemek; ölülere anahtar vermek; oyun sonunda herkese doğrulatmak.

**2 Eylül 2026 kararları:** seviye/Ağalık kaldırıldı · pot kaldırıldı, yerine sponsorlu ödül havuzu · tek seçilmiş Muhtar · gündüz sayaçsız dava akışı · iki mod tek uygulama · ekonomik zincir modu varsayılan · Zakura Common şimdi, Zakura düğümü grant sonrası · mağaza hedefi geri açıldı (18 Ağu "PWA yeter" kararı bilinçli tersine çevrildi; salon yine PWA/QR ile gider).

---

## 1. Oyun kuralları v2

### Köy kompozisyonu (oyun başında herkese ilan edilir)

| Oyuncu | Vampir | Muhtar ağırlığı | Deli |
|---|---|---|---|
| 7-9 | 1 | 2 | 8'den itibaren |
| 10-12 | 2 | 2 | var |
| 13-15 | 3 | 3 | var |

Doktor ×1, Gözcü ×1 her zaman; kalan Köylü. Giriş ücreti, seviye, pot yok. Herkesin oyu 1, Muhtar'ınki tabloya göre.

### Roller

| Rol | Gece | Ne görür |
|---|---|---|
| Vampir | Kurban seçer; birden fazlaysa çoğunluk, eşitlikte ilk seçen | Birbirlerini bilir; uzaktan modda özel ses+chat kanalı |
| Doktor | Birini korur, kendini de koruyabilir; her gece serbest, aynı kişiyi üst üste koruyabilir | Sabah kurtardıysa ilanı görür |
| Gözcü | Birini sorgular | Yalnız kendi ekranında "vampir mi" cevabı |
| Deli | Hamlesi yok | Asılırsa tek başına kazanır, Deli rozeti; oyun sürer |
| Köylü | Hamlesi yok; şüphe işaretler (sabah rozet) | — |
| Hayalet (ölü hâli) | Kehanet oyu: "sıradaki asılan kim" | Oda anahtarıyla her şeyi, gece hamleleri dahil; yaşayanlarla konuşamaz; uzaktan modda hayalet kanalı |

### Muhtar (makam, rol değil)

- Roller dağıtıldıktan hemen sonra, ilk geceden önce **SEÇİM** fazı. İsteyen tek tuşla aday olur. Herkes açık oy verir, oylar anında görünür. En çok oy → Muhtar. Eşitlikte ebe kura çeker; aday yoksa ebe kura çeker.
- Rolü gizli kalır. Vampir de seçilebilir.
- Ayrıcalık: oyu tabloya göre 2 veya 3 sayılır; "oylamaya geç" ve "günü kapat" komutları onda.
- Ölürken (gece veya infaz) yaşayanlardan halef gösterir; göstermezse köy Muhtar'sız devam eder, komutlar kurucuya geçer.
- Seçim aynı zamanda ısınma turu: oyunun ilk oyu kimsenin ölmediği bir oydur, açık oy ve sayım burada öğrenilir.

### Faz döngüsü

`LOBBY → SEÇİM → GECE → ŞAFAK → GÜNDÜZ → İNFAZ → GECE … → SON`

- **GECE:** aktörler hamle yapar. Bütün aktörler bitirince gece biter, sayaç yok.
- **ŞAFAK:** ölen ilan edilir, vasiyeti perdeye düşer, hayalet olur; Muhtar öldüyse halef seçimi.
- **GÜNDÜZ (sayaçsız), üç iç durum:** `serbest` → `dava` → `karar`.
  1. **Suçlama.** Yaşayan biri birini suçlar, bir başkası destekler → dava açılır. Aynı anda tek dava; aynı kişiye aynı gün ikinci dava açılmaz. Desteksiz suçlama askıda kalır, başka suçlama açılabilir.
  2. **Savunma.** Suçlanan konuşur. "Savunmam bitti" deyince ya da Muhtar "oylamaya geç" deyince biter.
  3. **Karar oyu.** Herkes "assın" / "asmasın", açık ve anlık. "Assın" ağırlığı yaşayanların toplam ağırlığının **yarısını geçerse** asılır. Sonuç matematiksel olarak kesinleşince oylama kendiliğinden kapanır.
  4. **Sonuç.** Asılırsa → İNFAZ. Asılmazsa gündüz `serbest`e döner, yeni dava açılabilir.
  5. **Gün kapanışı.** Muhtar (yoksa kurucu) "günü kapat" → GECE.
- **İNFAZ:** rol açıklanır, vasiyet perdeye, Deli kontrolü, Muhtar öldüyse halef; sonra GECE.
- **SON:** kazanan ilanı, ifşa partisi, rozetler, ödül havuzu dağıtımı.

### Kazanma

Tüm vampirler ölürse köy; vampir sayısı sağ köylüye eşitlenirse vampirler. Deli asılırsa Deli kazanır (rozet), oyun sürer.

### Süreler

Salon modunda **hiç yok**; tempoyu masa belirler. Uzaktan modda yalnız takılmaya karşı **üst sınırlar** (sigorta, tempo değil): gece 2 dk, savunma 2 dk, karar oyu 1 dk, gün 10 dk. Üst sınır dolunca faz "pas" ile kapanır.

### Kopma

Düşen oyuncu token'la geri döner ve son state'i alır. Salon modunda Muhtar/kurucu düşen oyuncuyu "pas" sayabilir.

---

## 2. Modlar

Tek uygulama (Flutter: iOS, Android, Web). Oda kurulurken kurucu mod seçer. Mod yalnız üç şeyi değiştirir; kurallar, ekranlar ve motor aynıdır.

| | Salon | Uzaktan |
|---|---|---|
| Ses | Kapalı, masa konuşur | Açık, LiveKit odası |
| Chat | Yok | Açık: köy / vampir / hayalet kanalları |
| Üst sınırlar | Yok | Var |
| Meydan nerede | Perdede (büyük ekran) | Herkesin ekranında |
| Telefon | Sessiz kumanda | Oyunun kendisi |

**Meydan (ortak sahne):** yuvarlak köy meydanı, her oyuncunun avatarı. Yaşayanlar çemberde, ölenler kenarda soluk. Muhtar'da rozet. Dava açılınca suçlanan ortaya gelir; suçlayan ve destekçi ona bakar. Karar oyunda avatarlar "assın"/"asmasın" tarafına döner, sayım ortada büyür. Gece meydan kararır; vampirlerin ekranında yalnız vampirler ışıklı. Kenarda mühür sayacı ve blok saati; ilanlar meydanın üstünden geçer.

**Salon:** kurucu odayı kurar, perde QR gösterir, oyuncular okutup tarayıcıdan (PWA) ya da uygulamadan girer. Telefonda yalnız sırlar ve düğmeler: rol kartı, gece hamlesi, suçla/destekle, assın/asmasın, vasiyet, hayalet defteri. Gündüz ekranı tek cümle: "meydanda konuş", altında dava düğmeleri.

**Uzaktan:** meydan herkesin ekranında, yanında chat, ses sürekli açık. Konuşan avatar parlar. Ses izinleri kuralı takip eder: gündüz herkes açık; gece herkes kapalı, vampirler kendi aralarında; hayaletler kendi kanalında; savunmada suçlananın sesi öne çıkar.

**Ortak:** hayalet ekranı, ifşa partisi, seyirci linki (sunucunun süzülmüş görünümü; gece sırlarını göstermez, oy ve ses yok).

**Etkinlik etiketi:** salon odası bir etkinlik koduna bağlanabilir (şehir turu). Rozetler o şehrin adıyla basılır, şehirler arası tablo bundan türer.

**Kapsam dışı:** salon oyununa uzaktan katılım (karışık masa ses düzenini bozar).

---

## 3. Mimari

İlke: **tempo sunucudan, kanıt zincirden** — tempo artık sayaçtan değil olaylardan.

```
[Flutter: iOS / Android / Web]  ──WebSocket──▶  [Bun sunucu]
        │                                          ├─ Motor (saf durum makinesi)
        │ ses (WebRTC)                             ├─ Oda katmanı (tetikler, izinler, yayın)
        ▼                                          ├─ SQLite (kalıcılık)
   [LiveKit]  ◀────── izin komutları ──────────────┤
                                                   └─ Zincir servisi ──▶ zingolib+Common ──▶ lightwalletd
```

- **Motor** (`src/engine`): saf fonksiyonlar, memo olayı döndürür. Fazlar §1. Süre bilmez; yalnız "hamle geldi" ve "komut geldi" bilir. Testler `test/engine.test.ts` genişler.
- **Oda katmanı** (`src/server/rooms.ts`): üç tetik kaynağı — aktörler tamamlandı, Muhtar/kurucu komutu, uzaktan modda üst sınır. Her faz değişiminde WebSocket'e yayınlar ve LiveKit'e izin komutu gönderir.
- **Gerçek zamanlı:** polling kalkar. Bun yerleşik WebSocket, oda başına kanal. Her olayda **tam state** gönderilir; istemci fark hesaplamaz. Chat aynı bağlantıda, kanal etiketiyle. Yeniden bağlanan token'la son state'i alır.
- **Ses:** LiveKit sunucusu Docker'da, TURN gömülü. Bun sunucu kısa ömürlü LiveKit token'ı üretir (kimlik + izinler). Vampir gece kanalı ve hayalet kanalı katılımcı izinleriyle; ayrı oda açılmaz. Salon modunda hiç bağlanılmaz.
- **Kalıcılık:** SQLite, Bun yerleşik sürücü, tek dosya. Oda state'i her olayda snapshot; sunucu açılınca SON olmayan odalar geri yüklenir. Mühür kuyruğu kalıcı.
- **Zincir servisi:** cüzdanlar sunucuda (cam ebe modeli sürüyor). **Ekonomik mod (varsayılan):** ops gönderir, faz başına toplu çok-memo tx. **Kanıt modu (düğme):** oyuncu cüzdanından hamle başına tx. Proving ayrı işçi süreçte, düşük öncelikte. zingolib forku Ironwood'a rebase + Zakura Common crate'lerine bağlanır. Lightwalletd: topluluk sunucusu (zec.rocks / lightwalletd.com); kendi Zakura arşiv düğümü (≈252 GiB) grant sonrası.
- **Perde:** sunucu render HTML kalkar; perde = Flutter web'in seyirci görünümü, aynı meydan bileşeni, URL ile açılır.
- **Dağıtım:** VPS Hetzner CX32 sınıfı (4 vCPU / 8 GB / 80 GB). zkoy.fun doğrudan VPS'e, tünel emekli. HTTP+WS Cloudflare arkasında; LiveKit medya DNS-only alt alan adından doğrudan VPS'e. iOS derlemesi Selinay'ın Mac'inde, onun Apple Developer hesabından; Android Windows'tan.
- **Riskler:** zingolib Ironwood rebase **yüksek** · Common entegrasyonu **orta** · gece ses izinleri **orta** · SQLite'tan geri yükleme **orta** · WS yeniden bağlanma **düşük**.

---

## 4. Veri şeması (SQLite)

İlke: motor state'i JSON snapshot; analiz, rozet ve ifşa için ayrıca olay günlüğü.

- **users**: id, görünen ad, avatar, giriş türü (misafir / Apple / Google), cihaz anahtarı, oluşturma. E-posta istenmez.
- **rooms**: kod, mod, kurucu, etkinlik kodu (null olabilir), durum, oda cüzdan adresi + görüntüleme anahtarı, state snapshot JSON, son güncelleme.
- **room_players**: oda, kullanıcı, oyuncu kimliği, koltuk, avatar, token hash, cüzdan adresi, katılma zamanı.
- **games**: id, oda, başlangıç, bitiş, kazanan, oyuncu sayısı, kompozisyon JSON, kura taahhüdü, kura açılımı.
- **events**: id, oyun, tur, faz, tür (katıldı, rol, muhtar oyu, muhtar, gece hamlesi, suçlama, destek, savunma bitti, karar oyu, infaz, vasiyet, kehanet, halef, faz geçişi, gün kapandı, ödül), yapan, hedef, payload JSON, zaman, mühür txid, mühür durumu. Zincirdeki her memo'nun ikizi; perde ve ifşa partisi buradan okur.
- **seal_queue**: id, olay(lar), gönderen cüzdan, alıcı adres, memo JSON, deneme, durum, txid. Kalıcı kuyruk.
- **chat_messages**: id, oda, kanal, oyuncu, metin, tur, faz, zaman. **Oyun bitince silinir.** Şikayet edilen mesaj şikayet anında `reports` tablosuna dondurulur, yalnız o kalır.
- **reports**: id, oda, şikayet eden, şikayet edilen, mesaj kopyası / ses zaman damgası, sebep, durum.
- **badges**: id, kullanıcı, oyun, tür (kazanan, Deli, Kâhin, Muhtar, şehir), etiket, etkinlik kodu, memo txid, zaman.
- **tour_events**: kod, şehir, tarih, ev sahibi. Şehir tablosu buradan ve badges'tan türer.

**WebSocket mesajları.** Sunucudan: `state`, `chat`, `announce`, `voice_grant`. İstemciden: `action` (motor hamlesi), `chat`, `command` (Muhtar/kurucu tetikleri), `report`. Her `state` tam state taşır.

**Gizlilik:** kişisel veri ad ve avatar. Cüzdan anahtarları VPS diskinde, veritabanında değil.

---

## 5. Zcash katmanı

Primitifler: şifreli memo · mühürlü oy · görüntüleme anahtarı · kura taahhüdü · (kanıt modunda) oyuncunun kendi imzası · kalıcı rozet.

### Cüzdan düzeni
- **Ops**: fonlu; ekonomik modda tüm gönderimler buradan; ödül havuzu buradan dağıtılır.
- **Oda**: alıcı; UFVK = hayalet anahtarı + oyun sonu denetim anahtarı.
- **Oyuncu**: alıcı (rol kartı, spoiler, rozet, ödül). Kanıt modunda ayrıca gönderici: katılımda ops altı notluk toz yollar (tek not ardışık gönderimi öldürür), oyun sonunda kalan toz ops'a süpürülür.

### Zincir modları (aynı kod, kuyrukta düğme)

| Mod | Kim gönderir | Oyun başına tx | Oyun başına ücret (ZEC≈$800) |
|---|---|---|---|
| **Ekonomik (varsayılan)** | Ops, faz başına toplu tx | 5-10 | ≈ $0,5-1 |
| **Kanıt** | Oyuncu cüzdanından, hamle başına | 100-150 | ≈ $12-18 |

Kanıt modu yalnız fonlandığında (sponsor/turnuva) açılır.

### Memo protokolü v2

JSON ≤512B. Ok yönü gönderen cüzdanı gösterir; ekonomik modda tüm "oyuncu→" satırları ops'tan çıkar ve `p` (oyuncu) alanı taşır. Tüm memo'larda `v:2` ve `g` (oda kodu) var; tablo sadeleştirilmiş.

```
ops→oda      seed     {c: sha256(seed|salt)}         kura taahhüdü, oyun başı
ops→oyuncu   role     {role}                          rol kartı
oyuncu→oda   mvote    {r:0, x}                        Muhtar oyu
ops→oda      muhtar   {p, w}                          seçim sonucu ve ağırlık
oyuncu→oda   night    {r, x}                          vampir / doktor / gözcü hamlesi
ops→oda      seerr    {r, x, vamp}                    gözcü cevabı
oyuncu→oda   accuse   {r, x}   ·   second {r, x}      suçlama ve destek
oyuncu→oda   verdict  {r, x, y:1|0}                   assın / asmasın
ops→oda      phase    {r, ph, by}                     faz geçişi ve kimin tetiklediği
ops→oda      result   {r, died, saved, lynched, role}
oyuncu→oda   will {txt} · heir {x} · gvote {r, x}
ops→ölen     spoiler  {roles}
ops→oda      chatroot {r, ph, h}                      faz sonu chat hash'i (uzaktan mod)
ops→oda      seedr    {seed, salt}                    kura açılımı, oyun sonu
ops→oyuncu   badge    {kind, label, event}            kalıcı rozet
ops→oyuncu   prize    {zat, reason, event}            ödül havuzu payı (gerçek ödeme)
```

### Kanıtlı kura
Rol dağıtım tohumu oyun başında taahhüt olarak mühürlenir, sonunda açılır. Aynı tohumla karıştırma tekrar koşulur, rollerin oyundan önce sabitlendiği görülür. (v1'de tohum taahhütsüzdü.)

### İfşa partisi v2
Oda anahtarı + (kanıt modunda) oyuncu anahtarları + kura tohumu + olay günlüğü → zaman çizelgesi: kim ne zaman kimi suçladı, kim kime "assın" dedi, vampirler geceleri kimi seçti. Meydanda replay; her satırın explorer linki.

### Hayalet ≠ seyirci
Hayalet oda anahtarını canlı alır (ölüdür, oyuna sadıktır). Seyirci linki sunucunun süzülmüş görünümüdür; anahtar yalnız oyun sonunda açılır.

### Ödül havuzu (sponsorlu)
Havuzu **oyuncu değil organizatör/sponsor** doldurur (ZcashTR turu, topluluk, marka). Oyuncu para koymaz → bahis değil, yarışma. Oyun sonunda ops cüzdanından kazananlara **anında** `prize` memo'lu gerçek ödeme; ekranda "ödül geldi". Kazanan ödülü oyun cüzdanında bırakır ya da **Zashi köprüsü** ile kendi adresine alır. Sponsor nasıl isterse öyle öder (TRY/USDT/ZEC), biz ZEC'e çeviririz; kazanan borsa linkiyle TRY'ye çevirir. Havuz ve dağıtım tablosu etkinlik kaydında yazılıdır (mağaza yarışma kuralı için).

### Zashi köprüsü (isteğe bağlı)
Oyuncu kendi cüzdan adresini QR/ZIP-321 ile verirse rol kartı, rozet ve ödül oraya da gider. Cüzdan zorunlu değil.

### Mainnet
Aynı protokol, zincir bayrağıyla. zingolib Ironwood rebase + Common. Gönderim mainnet'te mixnet üzerinden, clearnet yedek. Testnet geliştirme, mainnet kanıt (ZecHub builder rehberiyle uyumlu).

### Grant metrikleri (events tablosundan)
oyun · gerçek oyuncu · şehir · shielded tx · (kanıt modunda) gerçek gönderici.

---

## 6. Onboarding ve hesap

- **Oyuncu kripto kelimesi görmez.** Giriş isim + avatar. Cüzdan, ZEC, memo hiçbir formda yok; Zcash perdede ve ifşa partisinde hissedilir.
- **Para girişi yok.** Potsuz + sponsorlu havuz → oyuncudan tahsilat sıfır. USDT/TRY yalnız sponsor ödemesinde ve kazananın nakde çevirme linkinde yaşar.
- **İlk açılış:** beş kartlık köy kuralları (kim kimdir, gece, dava, Muhtar, kazanma); atlanabilir, lobide tekrar açılır. Rol kartında "senin gecen böyle geçer" satırı.
- **Salon girişi:** perdedeki QR → `zkoy.fun/j/KOD`; uygulama yüklüyse açar, değilse web'de oynatır. Masa mağazadan indirme beklemez.
- **Uzaktan giriş:** arkadaş odası kod/link. Açık oda listesi (kurucu "herkese açık" işaretler). Eşleştirme algoritması yok.
- **Hesap:** varsayılan misafir (cihaz anahtarı). Rozet/istatistik taşımak isteyen Apple veya Google bağlar; Apple kuralı gereği ikisi birlikte gelir. E-posta istenmez.
- **Ödül alma:** kazanan "ödülü kendi cüzdanına al" der (Zashi QR) ya da oyun cüzdanında bırakır.
- **Bildirim:** mağaza sürümünde push ("gece bitti", "dava açıldı: sen", "oylama başladı"); web'de ses + titreşim.
- **Dil:** Türkçe önce; İngilizce çeviri dosyası baştan yapıda.
- **Yaş:** 12+; kan/şiddet görseli yok, karikatür köy.

---

## 7. Mağaza yolu — TASLAK (Bekir ile konuşulacak)

- **En düşük riskli çizgi:** parti oyunu; cüzdan barındırmaz, para almaz, "kazan" vaat etmez. Zcash listede tek cümle. Etkinlik ödülleri sponsorlu yarışma kuralıyla, resmi kural metni etkinlik kaydında. "NFT" kelimesi geçmez.
- **Maddeler:** Apple 3.1.5 kripto (temiz) · Apple 5.3 / Google gerçek paralı oyun (oyuncu para koymuyor; sponsorlu yarışma kuralına uyulur) · Apple 4.2 (Flutter native) · **Apple 1.2 / Google UGC: şikayet et, engelle, sustur, kurucunun oyuncu atması ZORUNLU — ekran/akış kararı Bekir + Selinay** · Apple 4.8 (Google varsa Apple girişi) · gizlilik politikası, mikrofon/kamera izin metinleri.
- **Hesaplar:** Apple Developer hesabı **Selinay'da var** (iOS/TestFlight bu hesaptan). Google Play hesabı henüz yok, üçüncü sırada olduğu için sonra alınır; yeni bireysel hesaplara üretim öncesi kapalı test şartı (12 test kullanıcısı) var — hesap açılınca doğrulanacak, tur oyuncuları test kullanıcısı olur.
- **Derleme:** iOS Selinay'ın Mac'inde yerel Xcode → TestFlight; bulut Mac gerekmez. Android Windows'tan; ayrıca doğrudan APK.
- **Sıra (Bekir, 2 Eyl):** web/PWA önce ve canlı kalır (tur buna dayanır) → **Apple App Store** → Google Play. Mağaza uzaktan modun kapısıdır.
- **Liste:** ZKöy · Vampir Köylü · Oyun/Strateji · 12+ · gerçek ekran görüntüleri · TR + EN.

---

## 8. Marka ve pazarlama çerçevesi — TASLAK (metinler Bekir'in sesinden)

- **Sabitler:** ZKöy · Mühür · köy teması (Şirince'de doğdu, artık her şehir bir köy) · karikatür köy, gece/gündüz, fener ve meydan · avatar sistemi ve şehir rozetleri marka varlığı.
- **Hikâye iskeleti:** kahraman masa, rehber ZKöy. Çatışma: "herkes Vampir Köylü'yü sever AMA … BU YÜZDEN …" (Bekir doldurur). Final cümle önce.
- **Üç kitle:** masa/oyuncular (TR) · Zcash ekosistemi ve grant jürisi (EN, minimal) · ZcashTR turu / Batuhan (TR). Her biri için tek cümle Bekir'den.
- **Kanıt varlıkları:** salon fotoğrafları, gerçek ekran kaydı demo, ifşa partisi replay'i, explorer linkleri, şehir tablosu. Sahte yok.
- **Kanallar/ritim:** forum lansman thread'i (mainnet sonrası), iki haftada bir güncelleme, ZcashTR aylık raporu (ayın 19'u), ZecHub Community Projects PR, ZecMarket ilk oyun ilanı, ZcashTR Discord, X proje hesabı (açılacak).
- **Ölçüm:** oyun · gerçek oyuncu · şehir · shielded tx · gerçek gönderici.

---

## 9. Kapsam dışı (bilinçli)

Oyuncu parasıyla pot / bahis · zincir üstü USDT/stablecoin · karışık masa (salon + uzaktan) · eşleştirme algoritması · zorunlu self-custody · kendi Zakura düğümü (grant sonrası) · memo tabanlı chat (Zchat dersi) · Ö7 kanıtlı gözcü (stretch, v1'den devir) · hayalet kehanetine para ödülü (rozet var).

---

## 10. İnşa sırası ve kapı kuralları (süre yok; risk seviyesi var)

1. **Motor v2** — SEÇİM fazı, Muhtar ağırlığı/halef, gündüz iç durumları (dava/karar), açık oy sayımı, kanıtlı kura, testler. Zincirsiz çalışır (demo sigortası). *Risk: düşük.*
2. **Sunucu omurgası** — WebSocket, SQLite snapshot + olay günlüğü + kalıcı mühür kuyruğu, komutlar (Muhtar/kurucu), üst sınırlar (yalnız uzaktan). *Orta.*
3. **Flutter (Selinay)** — meydan bileşeni, SEÇİM ekranı, dava/savunma/karar ekranları, halef seçimi, kural kartları, WS istemcisi. `docs/API.md` v2 sözleşmesi bu adımdan önce güncellenir. *Orta.*
4. **Salon paketi** — perde = Flutter web seyirci görünümü, QR/derin link, etkinlik kodu, şehir rozeti. **Kapı:** tur öncesi salon modu mainnet'te en az bir prova eli.
5. **Zincir** — zingolib Ironwood rebase + Common, ekonomik mod, kanıtlı kura memo'ları, rozet/ödül memo'ları, Zashi köprüsü. *Yüksek.*
6. **VPS** — Hetzner CX32, Docker (bun + livekit), topluluk lightwalletd, zkoy.fun DNS, tünel emekli. *Düşük.*
7. **Uzaktan paketi** — LiveKit + izin makinesi, chat kanalları, moderasyon (şikayet/engelle/sustur/at), açık oda listesi. **Kapı:** mağaza öncesi en az iki uzak prova eli. *Orta.*
8. **Mağaza** — iOS (Selinay'ın hesabı) → Android, gizlilik sayfası, listeler. *Orta.*
9. **Kanıt modu** — oyuncu cüzdanından gönderim, paralel proving işçileri; fonlanınca. *Yüksek.*

---

## 11. Açık kararlar (Bekir'de)

- ZecHub hackathon ve film yarışması linkleri → uygunluk ve son tarih.
- Fortune'a PR #191 altına görev isteme yorumu: gönderilsin mi (taslak hazır).
- X proje hesabı adı.
- Evde Zakura düğümü için donanım var mı.
- Bölüm 7 ve 8 konuşması.
