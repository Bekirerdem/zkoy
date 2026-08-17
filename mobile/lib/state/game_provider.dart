import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/room_state.dart';
import '../models/tier.dart';
import '../services/api_client.dart';
import '../utils/constants.dart';
import 'session.dart';

/// Uygulamanın tek gerçeklik kaynağı: [ApiClient]'ı sarar, faz süresince
/// 1.5sn'de bir GET /state poll'lar (spec §3 "HTTP polling 1-2sn") ve
/// ekranlara faz/oyuncu/sayaç değişimini yayınlar.
class GameProvider extends ChangeNotifier {
  final ApiClient api;
  final Session session;

  GameProvider({required this.api, required this.session});

  RoomState? state;
  Timer? _pollTimer;
  bool loading = false;
  String? error;

  /// Her başarılı aksiyonda artar — AppRoot bunun değişimini yakalayıp
  /// ekranda kaçırılamaz bir ✓ patlaması gösterir ("tıkladım mı?" bitti).
  int actionFlashTick = 0;

  /// Köylünün gece işaretlediği şüphe (yerel — sunucuya gitmez);
  /// oylama ekranında rozet olarak hatırlatılır.
  String? suspicionId;
  int? suspicionRound;

  void markSuspicion(String id, int round) {
    suspicionId = id;
    suspicionRound = round;
    notifyListeners();
  }

  String? get code => session.code;
  String? get myPlayerId => session.playerId;
  bool get amHost => session.isCreator;

  Future<void> createAndJoin({
    required String name,
    required Tier tier,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final room = await api.createRoom();
      final join = await api.joinRoom(code: room.code, name: name, tier: tier);
      await session.saveName(name);
      await session.saveRoom(
        code: room.code,
        playerId: join.playerId,
        token: join.token,
        isCreator: true,
      );
      startPolling();
    } catch (e) {
      error = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> joinExisting({
    required String code,
    required String name,
    required Tier tier,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final join = await api.joinRoom(code: code, name: name, tier: tier);
      await session.saveName(name);
      await session.saveRoom(
        code: code,
        playerId: join.playerId,
        token: join.token,
        isCreator: false,
      );
      startPolling();
    } catch (e) {
      error = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> startRoom() async {
    if (session.code == null) return;
    loading = true;
    notifyListeners();
    try {
      await api.startRoom(session.code!);
      error = null;
    } catch (e) {
      error = e.toString();
    } finally {
      loading = false;
    }
    await refresh();
  }

  /// Ebe-geçişi: kurucu bekleme fazlarını (şafak/gündüz/infaz) sayaç
  /// beklemeden ilerletir — salon temposu kurucunun elinde.
  Future<void> skipPhase() => _act('skip');

  Future<void> sendNight(String targetId) => _act('night', target: targetId);
  Future<void> sendVote(String targetId) => _act('vote', target: targetId);
  Future<void> sendGhostVote(String targetId) => _act('gvote', target: targetId);
  Future<void> sendWill(String text) => _act('will', txt: text);

  Future<void> _act(String type, {String? target, String? txt}) async {
    if (session.code == null || session.token == null) return;
    try {
      await api.sendAction(
        code: session.code!,
        token: session.token!,
        type: type,
        target: target,
        txt: txt,
      );
      error = null;
      if (type != 'skip') actionFlashTick++;
    } catch (e) {
      error = e.toString();
    }
    await refresh();
  }

  void startPolling() {
    _pollTimer?.cancel();
    refresh();
    _pollTimer = Timer.periodic(GameConfig.pollInterval, (_) => refresh());
  }

  Future<void> refresh() async {
    if (session.code == null || session.token == null) return;
    try {
      final next = await api.getState(session.code!, token: session.token!);
      state = next;
      error = null;
      notifyListeners();
    } catch (e) {
      final msg = e.toString();
      // Oda sunucuda artık yoksa (sunucu yeniden başladı vb.) oturumu
      // temizleyip lobiye dön — sonsuz hata döngüsünde mahsur kalma.
      if (msg.contains('oda yok') || msg.contains('geçersiz token')) {
        await leaveRoom();
        return;
      }
      error = msg;
      notifyListeners();
    }
  }

  Future<void> leaveRoom() async {
    _pollTimer?.cancel();
    state = null;
    await session.clearRoom();
    notifyListeners();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }
}
