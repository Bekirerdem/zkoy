# Zcash Testnet Geliştirme Ortamı — Kamp Kurulum Rehberi

> ZKöy ekibinin Rlay Week öncesi kurduğu ortamın tarifi. 48 saatlik bir
> challenge'da Zcash üstüne bir şey inşa etmek isteyenler için — Windows
> odaklı yazıldı, Linux/Mac'te daha da kolay.

## 1. Gerekenler

- Rust toolchain (Windows'ta MSVC Build Tools ile)
- `protoc` (Protocol Buffers derleyicisi) — [github.com/protocolbuffers/protobuf/releases](https://github.com/protocolbuffers/protobuf/releases)
- Bun ya da Node (sarmalayıcı/otomasyon scriptleri için)

## 2. zingo-cli derle (cüzdan motorunuz)

```powershell
git clone https://github.com/zingolabs/zingolib
cd zingolib
$env:PROTOC = "C:\yol\protoc\bin\protoc.exe"   # BUNSUZ DERLENMEZ
cargo build --release --bin zingo-cli           # ~78MB exe çıkar

# v5 online modda nym-proxy arar — ayrı workspace'ten derle, yanına koy:
cd zingo-netutils
cargo build --release --bin nym-proxy --features nym
copy target\release\nym-proxy.exe ..\target\release\
```

## 3. Testnet cüzdanı + para

```powershell
# İlk çalıştırma cüzdan üretir (seed'i not al: recovery_info komutu)
.\zingo-cli.exe --chain testnet --server https://testnet.zec.rocks:443 `
  --data-dir C:\benim-testnet-cuzdanim

# Non-interaktif tek komut biçimi:
.\zingo-cli.exe --chain testnet --server https://testnet.zec.rocks:443 `
  --data-dir ... --waitsync balance
```

- **Faucet:** https://zcashfaucet.jinolabs.xyz — CAPTCHA yok, hashcash PoW var
  (sha256/20bit). API'ye PoW gönderirken **nonce STRING olmalı** (sayı sessizce reddedilir).
- Explorer: https://testnet.cipherscan.app
- Testnet NU7'de: bakiye **Ironwood** havuzunda görünür — normal.

## 4. Bilinmesi ŞART tuzaklar (bizim kanla yazıldı)

| Tuzak | Gerçek | Çözüm |
|---|---|---|
| v5 offline-first | Oturum varsayılan çevrimdışı | `--server` vermek onay sayılır |
| **Testnet'te mixnet gönderimi KIRIK** | Transmit rehberi mainnet-only → "unknown Ironwood anchor" reddi, gönderim ASLA geçmez | zingo-cli'ye `network clearnet` alt komedu yaması — diff: bu reponun `docs/zingo-patch.md` dosyası |
| Ardışık gönderim ölür | Tek not → para üstü konfirmasyon bekler ("have 0") | `settings min_confirmations 1` + fonu kendine çok çıktılı tx ile 5-6 nota böl |
| Sync yarışı | Piped oturumda gönderim, arka plan sync bitmeden koşarsa stale state | stderr'de "Sync completed" işaretini bekle |
| Takılı expired tx | Sweep oyalanınca imzalı tx süresi dolar, cüzdanda REHİN kalır (notları kilitler) | `remove_transaction <txid>` |
| ZK proving CPU yer | Proof üretimi tüm çekirdekleri doyurur, sunucunuz nefes alamaz | zingo süreçlerini BelowNormal önceliğe çek |

## 5. İşinize yarayacak primitifler

- **Şifreli memo (512B)**: her shielded çıktının içinde şifreli veri alanı —
  JSON gömün, kontratsız protokol kurun (bizim bütün oyun bunun üstünde).
- **UFVK (görüş anahtarı)**: harcatmadan okutur — denetim/izleyici/hayalet ne
  lazımsa. `--viewkey <ufvk>` ile watch-only cüzdan açılır.
- **quicksend çok-alıcı**: `quicksend '[{"address":..,"amount":..,"memo":..},...]'`
  — tek tx'te düzinelerce memo.
- Memo'lar **mempool'dan okunur** — blok beklemeden tepki veren uygulama yapılır.

## 6. Önerilen 48 saat mimarisi

```
[Web/Mobil UI] ←HTTP→ [Bun/Node sarmalayıcı sunucu] ←child_process→ [zingo-cli]
                                                          ↓ gRPC
                                              testnet.zec.rocks:443
```

Sarmalayıcı örneği, memo protokolü ve tüm gerçek kod: bu repo (`src/zcash/zingo.ts`).
Sorusu olan ZKöy ekibini bulsun.
