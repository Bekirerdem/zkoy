import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/game_provider.dart';

/// Her başarılı aksiyonda ekranın ortasında büyüyüp sönen ✓ —
/// "tıkladım mı, geçti mi?" sorusunu kökten bitirir.
class ActionFlash extends StatefulWidget {
  final Widget child;
  const ActionFlash({super.key, required this.child});

  @override
  State<ActionFlash> createState() => _ActionFlashState();
}

class _ActionFlashState extends State<ActionFlash>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  );
  int _seenTick = 0;
  Timer? _hide;

  @override
  void dispose() {
    _hide?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tick = context.watch<GameProvider>().actionFlashTick;
    if (tick != _seenTick) {
      _seenTick = tick;
      _ctrl.forward(from: 0);
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        IgnorePointer(
          child: AnimatedBuilder(
            animation: _ctrl,
            builder: (_, __) {
              final t = _ctrl.value;
              if (t == 0 || t == 1) return const SizedBox.shrink();
              // hızlı belir (0-0.25), bekle, yumuşak sön (0.6-1.0)
              final opacity = t < 0.25
                  ? t / 0.25
                  : t > 0.6
                      ? (1 - t) / 0.4
                      : 1.0;
              final scale = 0.6 + 0.5 * Curves.easeOutBack.transform(
                    (t / 0.4).clamp(0.0, 1.0),
                  );
              return Center(
                child: Opacity(
                  opacity: opacity.clamp(0.0, 1.0),
                  child: Transform.scale(
                    scale: scale,
                    child: Container(
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        shape: BoxShape.circle,
                      ),
                      child: const Text(
                        '✓',
                        style: TextStyle(
                          fontSize: 64,
                          color: Color(0xFF2FD68C),
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
