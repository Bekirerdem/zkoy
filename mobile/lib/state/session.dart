import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Oyuncunun kimliğini (isim/oda/token) tutar; PWA sayfası yenilense de
/// oturum kaybolmasın diye shared_preferences ile kalıcı hale getirilir.
/// ChangeNotifier: isim girildiğinde / odaya girildiğinde AppRoot yeniden
/// çizilsin diye.
class Session extends ChangeNotifier {
  static const _kName = 'zkoy_name';
  static const _kCode = 'zkoy_code';
  static const _kPlayerId = 'zkoy_player_id';
  static const _kToken = 'zkoy_token';
  static const _kIsCreator = 'zkoy_is_creator';

  String? name;
  String? code;
  String? playerId;
  String? token;

  /// Sunucuda "ebe/kurucu" kavramı yok (POST /start herkese açık) — bu
  /// yalnız "Oyunu Başlat" butonunu kimin gördüğünü belirleyen istemci içi
  /// bir kolaylık bayrağı.
  bool isCreator = false;

  bool get hasRoom => code != null && token != null;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    name = prefs.getString(_kName);
    code = prefs.getString(_kCode);
    playerId = prefs.getString(_kPlayerId);
    token = prefs.getString(_kToken);
    isCreator = prefs.getBool(_kIsCreator) ?? false;
  }

  Future<void> saveName(String v) async {
    name = v;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kName, v);
    notifyListeners();
  }

  Future<void> saveRoom({
    required String code,
    required String playerId,
    required String token,
    required bool isCreator,
  }) async {
    this.code = code;
    this.playerId = playerId;
    this.token = token;
    this.isCreator = isCreator;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kCode, code);
    await prefs.setString(_kPlayerId, playerId);
    await prefs.setString(_kToken, token);
    await prefs.setBool(_kIsCreator, isCreator);
    notifyListeners();
  }

  Future<void> clearRoom() async {
    code = null;
    playerId = null;
    token = null;
    isCreator = false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kCode);
    await prefs.remove(_kPlayerId);
    await prefs.remove(_kToken);
    await prefs.remove(_kIsCreator);
    notifyListeners();
  }
}
