# zingo-cli forku: `network clearnet` yaması + Zakura Common

ZKöy sunucusu, testnet gönderimleri için **forklu** bir zingo-cli build'i kullanır.
Fork GitHub'da: `github.com/Bekirerdem/zingolib` (upstream `zingolabs/zingolib`).
Yerel checkout: `Desktop\Web3-projeleri\zcash-camp\zingolib` (remote `bekir`).

| Dal | İçerik |
|---|---|
| `zkoy-dev` | upstream `dev` (7 Eyl 2026, `884d8928`, Ironwood/NU6.3 + 0.30 yığını) + `network clearnet` yaması |
| `zakura-common` | `zkoy-dev` + kripto yığını Zakura Common crate'lerine kablolanmış (**sunucunun kullandığı dal**) |

Yama upstream'e gönderilmedi.

## Neden gerekli

zingo v5'te tx gönderimi varsayılan olarak Nym mixnet'inden gider ve gönderim
hedefleri (correspondent'lar) küratörlü bir indexer rehberinden seçilir. Bu
rehber **yalnız mainnet** sunucuları içerir; testnet'te sweep "0 transmit
candidates" der ve escalation mainnet listesine düşer. Sonuç: testnet
işlemi mainnet düğümlerine gider ve her seferinde
`unknown Ironwood anchor` ile reddedilir — testnet'te mixnet gönderimi
**yapısal olarak imkânsız**.

CLI'daki `network off` çare değil: oturumu tamamen çevrimdışına alır
(indexer bağlantısı da düşer). zingolib'de clearnet gönderim rotası
(`TransmitRoute::Clearnet`) zaten var ama ona geçen `MixnetMode::SwitchedOff`
durumuna CLI'dan ulaşılamıyor (yalnız test API'si `disable_mixnet()` geçiyor).

## Ne yapıyor

Yeni `network clearnet` alt komutu `lightclient.disable_mixnet().await`
çağırır: mixnet slot'u `SwitchedOff` olur, pinlenmiş indexer bağlı kalır,
gönderimler clearnet'ten pinli sunucuya (testnet.zec.rocks) gider.
Oturum-bazlıdır; sonraki açılış mixnet duruşuna döner.

```diff
@@ pub(crate) enum NetworkSubCommand {
     Off,
+    #[command(
+        about = "Switch the mixnet off for this session: sends route over clearnet through the pinned indexer"
+    )]
+    Clearnet,
@@ async fn network_command(
+        NetworkSubCommand::Clearnet => {
+            lightclient.disable_mixnet().await;
+            Ok("Mixnet Mode: switched off (send and price-fetch use clearnet through the \
+                 configured indexer). Per-session consent; the next launch returns to the \
+                 mixnet posture."
+                    .to_string())
+        }
```

## Zakura Common kablolaması (dal `zakura-common`, 7 Eyl 2026)

Zakura Common = librustzcash'in hızlandırılmış forkları, crates.io'da `zakura-*`
adlarıyla (lib hedef adları aynı, `use` yolları değişmez). Cüzdan katmanı için
`zakura-core/wallet-libraries` → `zakura-client-backend`. Yöntem `[patch]` değil,
bağımlılık adı değiştirme; Zakura'nın kendi düğümü de böyle tüketiyor.

Değişen yerler:

- Kök `Cargo.toml` `[workspace.dependencies]`: `orchard`, `sapling-crypto`,
  `zcash_primitives`, `zcash_proofs`, `zcash_keys`, `jubjub` →
  `{ version = "=1.0.0", package = "zakura-…" }`; `zcash_client_backend` →
  `{ version = "0.1.0-rc4", package = "zakura-client-backend" }` (upstream
  rc.7 hattından çatal, zingolib'in beklediği sürüm).
- `zcash_proofs`'a `features = ["local-prover"]` (Zakura'nın varsayılanında yok,
  `default_params_folder` bu özelliğe kilitli).
- Zakura yığını `rand_core 0.10`; builder sınırındaki iki çağrı
  (`zingolib/src/wallet/migration/{parts,split}.rs`) `rand::rngs::OsRng` yerine
  `rand10::rand_core::UnwrapErr(rand10::rngs::SysRng)` kullanır
  (`rand10 = { package = "rand", version = "0.10", features = ["sys_rng"] }`).
- `zcash_pool_migration` (Ironwood göç motoru) crates.io'dan değil
  `zcash-camp/vendor/zcash_pool_migration` (rc.7 kaynağı, bağımlılıkları
  `zakura-*`'a çevrilmiş) path bağımlılığı olarak gelir; aksi hâlde crates.io
  `orchard`/`zcash_primitives` kopyası grafiğe girer ve tipler çakışır.
  Kural: `cargo metadata` çıktısında kripto crate'lerinin yalnız `zakura-*`
  sürümü görünmeli.

Ölçüm (7 Eyl, testnet, aynı cüzdan, 10k zat self-send, kanıt dahil):

| Binary | `quicksend` süresi | Senkron (aynı cüzdan) |
|---|---|---|
| `zkoy-dev` (upstream dev HEAD) | 3,5 s | 3 dk 10 s |
| `zakura-common` | **1,0 s** | 2 dk |

## Yeniden derleme

```powershell
$env:PROTOC = "C:\Users\l3eki\Desktop\Web3-projeleri\zcash-camp\tools\protoc\bin\protoc.exe"   # yoksa lightwallet-protocol build-script düşer
cd C:\Users\l3eki\Desktop\Web3-projeleri\zcash-camp\zingolib
git checkout zakura-common
cargo build --release -p zingo-cli     # incremental ~2-3 dk, temiz ~15 dk
```

Sunucu binary'yi `target/release/zingo-cli.exe`'den alır; `ZINGO_BIN` ortam
değişkeniyle başka bir sürüme (ör. `zingo-cli-devhead.exe`) döndürülür.

## Senkron işareti (dev HEAD)

Yeni sürüm senkron bitişini yalnız `tracing` ile bildirir: sunucu zingo-cli'yi
`RUST_LOG=info` ile açar ve stderr'de `SYNC_SPAN=close` (ya da
`Sync successfully shutdown`) görünce gönderir. Bu olmadan oturum
`ZKOY_SYNC_WAIT_MS` (120 s) boyunca boşuna bekler.

## Sunucunun kullanım şekli

Gönderim, ops cüzdanında piped interaktif oturumla yapılır
(`src/zcash/zingo.ts`):

```
network clearnet
quicksend '[{"address":"utest1...","amount":10000,"memo":"{\"v\":1,...}"}]'
quit
```

Doğrulanmış örnek (17 Ağu): txid
`0215f72bd1c930250000d8d966e5fc5d857e60c513703ada9436c1e6fecb065c`,
clearnet üzerinden testnet.zec.rocks, memo mempool'dan okundu.

## Sunum notu (dürüstlük)

Mixnet katmanı testnet rehber eksiği yüzünden devre dışı; mainnet'te aynı kod
mixnet'ten gider. "İki katmanlı gizlilik" anlatısı mainnet için doğru,
testnet demosunda IP katmanı clearnet — saklamıyoruz, söylüyoruz.
