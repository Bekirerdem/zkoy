# ZKöy — mobil (Flutter PWA)

Vampir Köylü / Ağalık modu oyuncu istemcisi. Spec: [`../SPEC.md`](../SPEC.md),
API sözleşmesi: [`../docs/API.md`](../docs/API.md).

## Çalıştırma

Sahte (backend'siz) motor — tek cihazda uçtan uca oynanabilir, eksik oyuncular bot ile dolar:

```bash
flutter pub get
flutter run -d chrome --dart-define=USE_MOCK=true
```

Gerçek backend'e karşı (`bun run --watch src/server/index.ts` ile `../` içinde ayakta olmalı):

```bash
flutter run -d chrome --dart-define=USE_MOCK=false --dart-define=API_BASE=http://LAPTOP_IP:3131
```

Telefondan katılmak için laptop ve telefon aynı Wi-Fi'da olmalı; `flutter run`
komutuna `--web-hostname=0.0.0.0` eklenirse laptopun LAN IP'sinden erişilebilir.

## Mimari

- `lib/models/` — `docs/API.md`'deki JSON şekillerinin Dart karşılığı.
- `lib/services/api_client.dart` — soyut sözleşme; `MockApiClient` (bellek-içi
  motor, backend'siz demo) ve `HttpApiClient` (gerçek sunucu) aynı arayüzü uygular.
- `lib/state/game_provider.dart` — `GET /state`'i 1.5sn'de bir poll'lar, ekranlara yayınlar.
- `lib/widgets/app_root.dart` — faz → ekran yönlendirmesi (sunucudan gelen `phase`'e göre otomatik).

## Test

```bash
flutter analyze
flutter test   # test/game_flow_test.dart tek cihazda tam bir oyunu (bot'larla) baştan sona oynar
```
