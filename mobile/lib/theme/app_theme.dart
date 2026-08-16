import 'package:flutter/material.dart';

/// Kahoot benzeri sade, kart/buton/sayaç ağırlıklı görsel dil.
/// Zaman/gerçek saat değil — spec'e göre GECE/ŞAFAK koyu, GÜNDÜZ/OY/İNFAZ açık tema.
class AppColors {
  static const gold = Color(0xFFF4B728); // Zcash sarısı
  static const purple = Color(0xFF5A44A0);
  static const deathRed = Color(0xFFE5484D);
  static const winGreen = Color(0xFF2FD68C);

  static const nightBg = Color(0xFF11101B);
  static const nightSurface = Color(0xFF1D1B2E);
  static const dayBg = Color(0xFFFAF7EF);
  static const daySurface = Color(0xFFFFFFFF);
}

class AppTheme {
  static ThemeData light = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    scaffoldBackgroundColor: AppColors.dayBg,
    colorScheme: const ColorScheme.light(
      primary: AppColors.purple,
      secondary: AppColors.gold,
      surface: AppColors.daySurface,
    ),
    textTheme: _textTheme(Brightness.light),
    elevatedButtonTheme: _buttonTheme(),
    cardTheme: const CardThemeData(
      elevation: 0,
      color: AppColors.daySurface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(20)),
      ),
    ),
  );

  static ThemeData dark = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.nightBg,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.gold,
      secondary: AppColors.purple,
      surface: AppColors.nightSurface,
    ),
    textTheme: _textTheme(Brightness.dark),
    elevatedButtonTheme: _buttonTheme(),
    cardTheme: const CardThemeData(
      elevation: 0,
      color: AppColors.nightSurface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(20)),
      ),
    ),
  );

  static TextTheme _textTheme(Brightness b) {
    final color = b == Brightness.dark ? Colors.white : const Color(0xFF1C1B29);
    return TextTheme(
      displayLarge: TextStyle(
          fontWeight: FontWeight.w900, color: color, fontSize: 40),
      headlineMedium: TextStyle(
          fontWeight: FontWeight.w800, color: color, fontSize: 26),
      titleLarge:
          TextStyle(fontWeight: FontWeight.w800, color: color, fontSize: 20),
      bodyLarge: TextStyle(fontWeight: FontWeight.w600, color: color),
      bodyMedium: TextStyle(fontWeight: FontWeight.w500, color: color),
    );
  }

  static ElevatedButtonThemeData _buttonTheme() {
    return ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.purple,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 28),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
      ),
    );
  }
}
