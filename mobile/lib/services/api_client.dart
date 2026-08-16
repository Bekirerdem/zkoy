import '../models/room_state.dart';
import '../models/tier.dart';

class CreateRoomResult {
  final String code;
  final String roomAddress;
  const CreateRoomResult({required this.code, required this.roomAddress});
}

class JoinResult {
  final String playerId;
  final String token;
  final String playerAddress;
  const JoinResult({
    required this.playerId,
    required this.token,
    required this.playerAddress,
  });
}

/// docs/API.md'deki kesin sözleşme: POST /room · POST /room/:code/join ·
/// POST /room/:code/start · GET /room/:code/state?token=… ·
/// POST /room/:code/action · POST /room/:code/reveal (denetim; perde
/// sayfası kullanır, Flutter tarafından çağrılması gerekmez).
abstract class ApiClient {
  Future<CreateRoomResult> createRoom();

  Future<JoinResult> joinRoom({
    required String code,
    required String name,
    required Tier tier,
  });

  Future<void> startRoom(String code);

  Future<RoomState> getState(String code, {required String token});

  Future<void> sendAction({
    required String code,
    required String token,
    required String type, // night|vote|gvote|will
    String? target,
    String? txt,
  });
}
