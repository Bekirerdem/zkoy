import 'package:flutter/material.dart';

import '../models/role.dart';

Color roleColor(Role role) => switch (role) {
      Role.vampir => const Color(0xFFC1272D),
      Role.doktor => const Color(0xFF2E86AB),
      Role.gozcu => const Color(0xFF6C3FA8),
      Role.deli => const Color(0xFFE07B39),
      Role.koylu => const Color(0xFF2FA36B),
    };

String roleEmoji(Role role) => switch (role) {
      Role.vampir => '🧛',
      Role.doktor => '💊',
      Role.gozcu => '🕵️',
      Role.deli => '🤪',
      Role.koylu => '🌾',
    };

/// src/server/rooms.ts DEFAULT_DURATIONS ile birebir — sayaç ilerleme
/// çubuğunun "total" değeri için (asıl süre sunucudan `endsAt` ile gelir).
class PhaseDurations {
  static const night = Duration(seconds: 75);
  static const dawn = Duration(seconds: 12);
  static const day = Duration(seconds: 120);
  static const vote = Duration(seconds: 75);
  static const execution = Duration(seconds: 12);
}

class GameConfig {
  static const minPlayers = 7;
  static const maxPlayers = 15;
  static const pollInterval = Duration(milliseconds: 1500);
}

/// Hangi build'in yüklü olduğunu ekranda tartışmasız gösterir
/// (service worker eski sürümü tutabiliyor). Build komutunda
/// `--dart-define=BUILD_STAMP=...` ile basılır.
const String kBuildStamp = String.fromEnvironment('BUILD_STAMP', defaultValue: 'dev');
