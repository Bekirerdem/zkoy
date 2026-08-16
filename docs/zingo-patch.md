# zingo-cli yaması: `network clearnet`

ZKöy sunucusu, testnet gönderimleri için **yamalı** bir zingo-cli build'i kullanır.
Yama yerel checkout'ta durur: `Desktop\Web3-projeleri\zcash-camp\zingolib`
(`zingo-cli/src/commands.rs`), upstream'e gönderilmedi.

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

## Yeniden derleme

```powershell
$env:PROTOC = "C:\Users\l3eki\Desktop\Web3-projeleri\zcash-camp\tools\protoc\bin\protoc.exe"
cd C:\Users\l3eki\Desktop\Web3-projeleri\zcash-camp\zingolib
cargo build --release --bin zingo-cli   # incremental ~2 dk
```

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
