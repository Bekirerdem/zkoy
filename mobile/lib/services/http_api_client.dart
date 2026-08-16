import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/room_state.dart';
import '../models/tier.dart';
import 'api_client.dart';

/// docs/API.md'deki gerçek Bun sunucusuna karşı çalışan HTTP istemcisi.
/// Taban URL örneği: `http://LAPTOP_IP:3131` (telefon aynı Wi-Fi'da).
class HttpApiClient implements ApiClient {
  final String baseUrl;
  HttpApiClient({required this.baseUrl});

  Uri _u(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> _decode(Future<http.Response> req) async {
    final res = await req;
    final body = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final msg = body is Map && body['error'] != null
          ? body['error'] as String
          : 'API hatası ${res.statusCode}';
      throw Exception(msg);
    }
    return body as Map<String, dynamic>;
  }

  @override
  Future<CreateRoomResult> createRoom() async {
    final j = await _decode(http.post(_u('/room')));
    return CreateRoomResult(
      code: j['code'] as String,
      roomAddress: j['roomAddress'] as String,
    );
  }

  @override
  Future<JoinResult> joinRoom({
    required String code,
    required String name,
    required Tier tier,
  }) async {
    final j = await _decode(http.post(
      _u('/room/$code/join'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'name': name, 'tier': tier.wireInt}),
    ));
    return JoinResult(
      playerId: j['playerId'] as String,
      token: j['token'] as String,
      playerAddress: j['playerAddress'] as String,
    );
  }

  @override
  Future<void> startRoom(String code) async {
    await _decode(http.post(_u('/room/$code/start')));
  }

  @override
  Future<RoomState> getState(String code, {required String token}) async {
    final j = await _decode(
      http.get(_u('/room/$code/state', {'token': token})),
    );
    return RoomState.fromJson(j);
  }

  @override
  Future<void> sendAction({
    required String code,
    required String token,
    required String type,
    String? target,
    String? txt,
  }) async {
    await _decode(http.post(
      _u('/room/$code/action'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'token': token,
        'type': type,
        if (target != null) 'target': target,
        if (txt != null) 'txt': txt,
      }),
    ));
  }
}
