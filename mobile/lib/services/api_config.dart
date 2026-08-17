import 'api_client.dart';
import 'http_api_client.dart';
import 'mock_api_client.dart';

/// Backend hazır olduğunda:
/// `flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE=http://LAPTOP_IP:3131`
class ApiConfig {
  static const bool useMock =
      bool.fromEnvironment('USE_MOCK', defaultValue: true);

  /// Build'e sabit bir IP/link gömülmesin diye: önce `--dart-define`
  /// override'ı, yoksa sayfanın kendi servis edildiği origin (aynı host'tan
  /// hem statik dosyaları hem API'yi veren bir kurulumda otomatik doğru
  /// adresi bulur), o da yoksa yerel geliştirme varsayılanı.
  static String get apiBase {
    const fromEnv = String.fromEnvironment('API_BASE');
    if (fromEnv.isNotEmpty) return fromEnv;
    if (Uri.base.scheme.startsWith('http')) return Uri.base.origin;
    return 'http://localhost:3131';
  }

  static final ApiClient client =
      useMock ? MockApiClient() : HttpApiClient(baseUrl: apiBase);
}
