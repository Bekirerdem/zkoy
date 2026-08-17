import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

enum StatusTone { none, dead, winner }

/// Ölen oyuncuda tam ekran kırmızı, kazananda tam ekran yeşil ton
/// (kullanıcı isteği: "Ölen kişilerin ekranı kırmızıya dönmeli. En sonda
/// kazanan kişilerin ekranı yeşile dönmeli.").
class StatusOverlay extends StatelessWidget {
  final StatusTone tone;
  final Widget child;

  const StatusOverlay({super.key, required this.tone, required this.child});

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      StatusTone.dead => AppColors.deathRed,
      StatusTone.winner => AppColors.winGreen,
      StatusTone.none => Colors.transparent,
    };

    return AnimatedContainer(
      duration: const Duration(milliseconds: 600),
      decoration: BoxDecoration(
        gradient: tone == StatusTone.none
            ? null
            : LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  color.withValues(alpha: 0.55),
                  color.withValues(alpha: 0.85),
                ],
              ),
        color: tone == StatusTone.none ? null : color,
      ),
      child: child,
    );
  }
}
