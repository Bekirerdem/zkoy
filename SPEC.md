# ZKöy — Vampir Köylü on Zcash — Tasarım Spec'i

> **ZKöy** = ZK (zero-knowledge) + köy. Repo: `Bekirerdem/zkoy`. Protokol katmanının adı: **Mühür** (mühürlü oylama protokolü).

> Rlay Week Şirince — ZcashTR 48h Challenge. Teslim: **17 Ağustos 20:30**.
> Takım: Bekir (backend + Zcash) · Selinay (Flutter).
> Tek doğruluk kaynağı bu dosya. Kapsam tartışması çıkarsa buraya bakılır; burada olmayan şey yapılmaz.

## 0. Tek cümlelik tez

Zcash ekosisteminde olmayan **mühürlü oylama protokolünü** memo üstüne yazdık; kanıtı, salonda hep birlikte oynanan Vampir Köylü. Oyunun her sır mekaniği bir Zcash primitifi: rol = şifreli memo, oy = mühürlü zarf, hayalet = viewing key, pot = shielded ödeme.

**Jüri kriterleri:** eğlenceli + yaratıcı, Zcash'i anlamlı kullanan, çalışan demo.
**Ayrışma (araştırmayla doğrulandı):** on-chain Mafia türü 2018'den beri var AMA (a) Zcash'te hiç yapılmamış, (b) hiçbir zincirde kontratsız/memo-tabanlı yapılmamış, (c) viewing-key hayalet modu ve canlı-mekân hibriti hiçbir yerde yok.

## 1. Oyun kuralları (dijital uyarlama)

- 7-15 oyuncu + ebe (= sunucu). Konuşma/tartışma **salonda yüz yüze**; uygulamadan yalnızca sırlar geçer.
- Roller: Vampir ×1-2, Doktor ×1, Gözcü ×1, Deli ×1 (8+ oyuncuda), kalanı Köylü.
- Döngü: GECE (vampir kurban seçer, doktor kurtarır, gözcü sorgular — hepsi mühürlü) → ŞAFAK (sonuç ilanı) → GÜNDÜZ (salonda tartışma) → OYLAMA (mühürlü, süreli) → İNFAZ (asılanın rolü açıklanır, vasiyeti perdeye düşer) → kazanan kontrolü → tekrar GECE.
- Kazanma: tüm vampirler ölür → köy; vampir sayısı ≥ sağ köylü → vampirler. Deli asılırsa Deli tek başına kazanır (pot payını alır), oyun devam eder.
- Ölüler: **hayalet** olur — oda viewing key'i verilir, her şeyi okur, konuşamaz ve oy atamaz (kehanet oyu hariç, bkz. Ö8).

## 2. Onaylı özelleştirmeler (hepsi kapsamda)

| # | Özellik | Ne | Primitif | Faz |
|---|---|---|---|---|
| Ö1 | Vasiyet | Oyuncu mühürlü vasiyet yazar/günceller; ölünce perdeye düşer. Değiştirilemezlik + blok mührü | memo | v1 |
| Ö2 | Sayım-gizli oy | Tur içinde perde yalnız toplam ağırlığı gösterir; kim-kime dökümü OYUN SONU anahtar ifşasında ("ifşa partisi") | memo + UFVK | v1 |
| Ö3 | Pot + doktor primi | Girişler potu doldurur; kazanan taraf bölüşür, onaylı kurtarışta doktora prim | shielded ödeme | v1 |
| Ö4 | Deli | Asılırsa kazanır; gece hamlesi yok | — | v1 |
| Ö5 | Blok saat kulesi | Perdede köy meydanı saati = blok yüksekliği | kozmetik | v1 |
| Ö6 | Şirince teması | Köy = Şirince; anonslar ve görsel dil yerel | kozmetik | v1 |
| Ö7 | Kanıtlı Gözcü | Gözcü sorgu cevabını zincir kanıtıyla perdeye açabilir (bedeli: kimliğini ifşa eder) | memo + seçici ifşa | stretch |
| Ö8 | Hayalet Kehaneti | Hayaletler her tur "sıradaki asılan kim" diye mühürlü oy atar; en isabetlisi "Kahin Hayalet" pot dilimi alır | memo | stretch |
| Ö9 | Ağalık modu | TEK oyun modu: kademeli gizli giriş + ağırlıklı gizli oy (aşağıda) | shielded tutar + commit | v1 |

### Ö9 — Ağalık modu detayı
- Giriş kademeleri: **Rençber 0.001 / Muhtar 0.004 / Ağa 0.009 TAZ** → oy ağırlığı **1x / 2x / 3x** (karekök fiyatlama: ağırlık parayla doğrusal artmaz → plütokrasi freni).
- Kademe seçimi gizli: join memo'suna `sha256(tier|salt)` taahhüdü yazılır; oyun sonunda tier+salt ifşa edilir, taahhütle eşleşir (sonradan değiştirilemez).
- Kademeli yapı anonimlik kümesi korur (aynı kademede birden çok oyuncu) — benzersiz ağırlığın kimlik sızdırması problemi böyle çözülür (NU7'nin oy-bölme çözümünün hafif kardeşi; sunumda söylenir).
- Pot payı girişle orantılı: güç alan risk de alır (Ağa vampir yakalanırsa büyük kaybeder).
- **Tek mod: Ağalık** (karar 17 Ağu — Klasik mod kaldırıldı). Kademe seçmek istemeyen Rençber girer; taahhüt herkes için zorunlu. Demo tek modla oynanır.

### Pot dağıtım tablosu (END)
- Deli asıldıysa: potun %10'u Deli'ye (bir kez).
- Kahin Hayalet (Ö8 açıksa): %5.
- Doktor primi (onaylı kurtarış başına): %5, en fazla %10.
- Kalan: kazanan tarafın sağ üyelerine giriş-orantılı. Vampirler kazanırsa kalanın tamamı vampirlere.

## 3. Mimari

```
[Flutter (oyuncu)] --HTTP polling 1-2sn--> [Bun sunucu]
[Perde sayfası (tarayıcı)] ---------------^   |-- Oda Motoru (durum makinesi, N oda)
                                              |-- Zcash Servisi (child_process)
                                              +--> zingo-cli --gRPC--> testnet.zec.rocks:443
```

**İlke: oyun temposu sunucudan, kanıt zincirden.** Custodial modelde göndericiler biziz → oyun akışı blok beklemez; zincir noter olarak arkadan yetişir. Faz süreleri sabit sayaç (gece 60-90 sn, tartışma+oy 2-3 dk).

### Cüzdan düzeni (tek zingolib cüzdanı, çok hesap)
- **Ops hesabı**: fonlu (0.2 TAZ); tüm gönderimler buradan.
- **Oda hesabı** (oda başına): tüm oyun-akışı memo'ları BURAYA gider. UFVK'sı = hayalet anahtarı + oyun sonu denetim anahtarı. Oda izolasyonu hesap bazında bedava.
- **Oyuncu hesabı** (oyuncu başına, yalnız alıcı, fonsuz): rol kartı, spoiler, ödül buraya düşer → "rolün zincirden geldi" anı gerçek.

### Görünürlük modeli (bilinçli tasarım)
- Oda memo'larını canlı okuyabilen: ebe + hayaletler. Hayaletlerin gece hamlelerini ve oyları canlı görmesi **gerçek oyuna sadık** (ölüler gözü açık izler, konuşamaz).
- Yaşayanlar yalnız kendi ekran verisini görür; roller oyuncu hesabında (hayalet ROLLERİ göremez, ölüm anında kendisine spoiler memo'su gelir).
- Oyun sonu: oda UFVK'sı + tier ifşaları perdeye → herkes bağımsız doğrular (**cam ebe**).

### Memo protokolü (v1, JSON ≤512B) — asıl "ürün" katmanı
Hedef: ops→oda. İstisnalar belirtildi.
```
{"v":1,"t":"join","g","p","name","c":"<tierCommit>"}
{"v":1,"t":"role","role":"vampir|koylu|doktor|gozcu|deli"}        → oyuncu hesabına
{"v":1,"t":"night","r","p","x":"<hedef>"}                          (vampir/doktor/gözcü hamlesi)
{"v":1,"t":"seerr","r","p":"<gözcü>","x","vamp":true|false}        (gece çözümünde ebe yazar)
{"v":1,"t":"vote","r","p","x","w":1|2|3}
{"v":1,"t":"gvote","r","p","x"}                                    (hayalet kehaneti)
{"v":1,"t":"will","p","txt"}                                       (vasiyet; son geçerli olan geçerli)
{"v":1,"t":"result","r","died","saved":bool,"lynched","role"}
{"v":1,"t":"spoiler","roles":{...}}                                → ölen oyuncunun hesabına
{"v":1,"t":"reveal","p","tier","salt"}                             (oyun sonu taahhüt açılımı)
{"v":1,"t":"prize","zat":<miktar>,"reason"}                        → kazanan hesabına, gerçek ödeme
```
Pot fonlaması: oda başına tek gerçek tx (ops→oda, toplam giriş tutarı).

### Ö7-Ö8 mimariye nasıl oturuyor (yeni altyapı: SIFIR)
- **Ö7 Kanıtlı Gözcü**: `seerr` memo'su zaten gece çözümünde odaya yazılıyor. "Kanıtı aç" = `POST /action {type:"prove"}` → sunucu o TEK memo'nun çözülmüş içeriğini + txid + blok linkini perdeye basar. Oyun sonu UFVK ifşasında herkes aynı memo'yu bağımsız doğrular. Yani Ö7 = mevcut bir memo'nun perde render'ı + bir buton. Denge: kanıt açan gözcü hedef olur (kendi kendini dengeler).
- **Ö8 Hayalet Kehaneti**: oy borusunun aynısı, `t:"gvote"` etiketi + seyirci filtresi (yalnız hayaletler atabilir). Skorlama motorda 10 satır; ödeme END dağıtım tablosundan. 
- İkisi de aynı mühürlü-memo borusunun tip etiketi → **Faz 2 (çekirdek zincir entegrasyonu) uçtan uca çalışmadan bu ikisine BAŞLANMAZ** (kapı kuralı).

### API
```
POST /room                       → {code, roomAddress}
POST /room/:code/join {name,tier}→ {playerId, token, playerAddress}
POST /room/:code/start
GET  /room/:code/state           → faz, sayaç, oyuncular, sayım(toplam), perde verisi
POST /room/:code/action {token, type:"night"|"vote"|"gvote"|"will"|"prove", target|txt}
POST /room/:code/reveal          → UFVK + tier ifşaları + çözülmüş zaman çizelgesi
GET  /screen/:code               → perde sayfası (sunucu render, tarayıcıda tam ekran)
```

### Durum makinesi (oda başına)
`LOBBY → NIGHT → DAWN → DAY → VOTE → EXECUTION → (win?) → NIGHT ... → END`
- NIGHT: rol bazlı hamle toplanır (vampirler çoğunluk/ilk geçerli; doktor 1; gözcü 1). Zaman aşımı: hamle yoksa "pas".
- VOTE: yaşayanlardan mühürlü oy; Ö8 açıksa paralelde gvote. Beraberlikte kimse asılmaz.
- EXECUTION: infaz + rol ifşası + vasiyet perdeye + Deli kontrolü.
- END: ödüller (gerçek tx) + UFVK/tier ifşası + denetim çizelgesi ("ifşa partisi").
- Terk/kopma: her faz zaman aşımıyla ilerler; oyuncu düşerse "pas" sayılır, oyun kilitlenmez.

## 4. İş bölümü

**Bekir:** Bun sunucu (oda motoru + API + perde sayfası) · Zcash servisi (zingo-cli sarmalayıcı: hesap türet, UFVK export, memo gönder/oku, retry'lı Nym gönderimi) · dağıtım/ödeme mantığı · denetim görünümü.
**Selinay (Flutter, `http`+`qr_flutter`+`mobile_scanner` yeter):** Lobi (kur/kodla katıl + kademe seçimi) · Oda bekleme · Rol kartı (çevirme animasyonu) · Gece (rol bazlı hedef seçimi / köylüye "köy uyuyor") · Gündüz+Oy · Vasiyet editörü · Hayalet ekranı (memo akışı + kehanet oyu) · Gözcü "kanıtı aç" butonu · Kazanan ekranı.
Sözleşme: bu dosyadaki API + memo şeması. Değişiklik ikisinin onayıyla ve bu dosyaya işlenerek.

## 5. İnşa sırası ve kapı kuralları

- **Faz 0 — doğrulama (önce bu):** zingo-cli'de (1) yeni hesap türetme, (2) hesap-başına UFVK export, (3) JSON memo gönder + oda hesabından okuma. Üçü kanıtlanmadan Faz 2 mimarisine güven yok.
- **Faz 1 — motor (zincirsiz, paralel):** sahte Zcash servisiyle oyun uçtan uca oynanır; Selinay sahte API'ye karşı ekranları yapar. **Oyun, zincir olmadan da oynanabilir olmalı** (demo sigortası).
- **Faz 2 — zincir takılır:** rol/oy/vasiyet/sonuç memo'ları + pot + ödül gerçek testnet'te. Mixnet nazlanması bilinen risk → gönderimler kuyruklu+retry'lı.
- **Faz 3 — sahne:** perde sayfası + cam ebe denetim görünümü + Ağalık demo provası.
- **Kapı:** Ö7-Ö8 yalnız Faz 2 E2E yeşilse; Gözcü rolü v1'de var ama Ö7 kanıt butonu stretch.

## 6. Kapsam DIŞI (bilinçli)

Self-custody oyuncu cüzdanı (yol haritası: ZIP-321 QR ile kendi cüzdanından katılım) · commit-reveal oy (ebe merdiveni 2. basamak) · FROST eşik-ebe (3. basamak) · rüşvet direnci/MACI (slayt cümlesi) · mainnet · hesap sistemi/login · oda listesi/keşif · ses/müzik.

## 7. Dürüstlük notları (sunumda saklanmaz, söylenir)

- Custodial demo: anahtarlar sunucuda; "cam ebe" modeli merkezi ama **denetlenebilir** merkezi (oyun sonu UFVK ifşası + blok mühürleri). NU7'nin validatör kurulu emsaldir: felsefe "operatörü yok et" değil "denetlenebilir yap".
- Tür yeni değil (2018'den beri on-chain Mafia denemeleri var) — mekanizma yeni: Zcash'te ilk, kontratsız ilk, hayalet-viewing-key ve canlı-mekân hibriti her yerde ilk.

## 8. Demo akış taslağı (sunum ~10 dk)

1. 60 sn tez + mimari tek slayt (memo protokolü vurgusu)
2. Salonla **Ağalık eli** (hızlandırılmış: 1-2 gece + gündüz; kademeler gizli, perde sayımında "kim bu ağa?" anı)
3. Oyun sonu **ifşa partisi**: UFVK perdeye, kim-kime dökümü + tier'lar + blok mühürleri
4. Kapanış: NU7 bağlantısı + yol haritası merdiveni + "Sinancan, sıradaki etkinlikte bununla oynatın"
