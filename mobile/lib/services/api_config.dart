import 'api_client.dart';
import 'http_api_client.dart';
import 'mock_api_client.dart';

/// Backend hazır olduğunda:
/// `flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE=http://LAPTOP_IP:3131`
class ApiConfig {
  static const bool useMock =
      bool.fromEnvironment('USE_MOCK', defaultValue: true);
  static const String apiBase =
      String.fromEnvironment('API_BASE', defaultValue: 'http://localhost:3131');

  static final ApiClient client =
      useMock ? MockApiClient() : HttpApiClient(baseUrl: apiBase);
}
