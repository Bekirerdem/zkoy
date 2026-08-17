import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Faz ruhuna göre canlı arka plan: gece ateşböcekleri, gündüz ışık zerreleri,
/// oylamada yükselen korlar, hayalette süzülen tayflar, rol kartında ışıltılar.
/// Tek AnimationController + önceden üretilmiş parçacıklar — ucuz ve akıcı.
enum PhaseMood { night, day, vote, ghost, role }

class PhaseBackground extends StatefulWidget {
  final PhaseMood mood;
  final Color? accent;
  final Widget child;

  const PhaseBackground({
    super.key,
    required this.mood,
    required this.child,
    this.accent,
  });

  @override
  State<PhaseBackground> createState() => _PhaseBackgroundState();
}

class _Particle {
  final double x; // 0..1 yatay taban konumu
  final double y; // 0..1 dikey taban konumu
  final double size;
  final double speed; // tur başına kayma
  final double phase; // salınım fazı
  const _Particle(this.x, this.y, this.size, this.speed, this.phase);
}

class _PhaseBackgroundState extends State<PhaseBackground>
    with SingleTickerProviderStateMixin {
  // 15fps yeter (ateşböceği ağır süzülür) — 60fps tam-ekran repaint mobil
  // web'de scroll'u tıkıyordu (17 Ağu saha bulgusu).
  final ValueNotifier<double> _t = ValueNotifier(0);
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    final start = DateTime.now().millisecondsSinceEpoch;
    _tick = Timer.periodic(const Duration(milliseconds: 66), (_) {
      final ms = DateTime.now().millisecondsSinceEpoch - start;
      _t.value = (ms % 12000) / 12000;
    });
  }

  late final List<_Particle> _particles = _spawn();

  List<_Particle> _spawn() {
    final rnd = math.Random(42); // deterministik: her açılışta aynı gökyüzü
    final count = switch (widget.mood) {
      PhaseMood.ghost => 5,
      PhaseMood.role => 9,
      _ => 9,
    };
    return List.generate(count, (i) {
      return _Particle(
        rnd.nextDouble(),
        rnd.nextDouble(),
        switch (widget.mood) {
          PhaseMood.ghost => 26 + rnd.nextDouble() * 30,
          PhaseMood.role => 2 + rnd.nextDouble() * 3,
          _ => 2 + rnd.nextDouble() * 3.5,
        },
        0.35 + rnd.nextDouble() * 0.65,
        rnd.nextDouble() * math.pi * 2,
      );
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _t.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final accent = widget.accent ?? Theme.of(context).colorScheme.primary;
    return Stack(
      fit: StackFit.expand,
      children: [
        // Zemin: faz ruhuna göre yumuşak degrade (koyu modlarda opak,
        // açık modlarda scaffold rengi görünür kalır).
        DecoratedBox(decoration: BoxDecoration(gradient: _gradient(accent))),
        RepaintBoundary(
          child: IgnorePointer(
            child: ValueListenableBuilder<double>(
              valueListenable: _t,
              builder: (_, t, __) => CustomPaint(
                painter: _ParticlePainter(
                  t: t,
                  mood: widget.mood,
                  accent: accent,
                  particles: _particles,
                ),
              ),
            ),
          ),
        ),
        widget.child,
      ],
    );
  }

  Gradient? _gradient(Color accent) {
    switch (widget.mood) {
      case PhaseMood.night:
      case PhaseMood.role:
        return LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.lerp(const Color(0xFF11101B), accent, 0.14)!,
            const Color(0xFF11101B),
          ],
        );
      case PhaseMood.ghost:
        return const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF171528), Color(0xFF0E0D18)],
        );
      case PhaseMood.day:
        return const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFDF6E3), Color(0xFFFAF7EF)],
        );
      case PhaseMood.vote:
        return LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.lerp(const Color(0xFFFAF7EF), Colors.redAccent, 0.06)!,
            const Color(0xFFFAF7EF),
          ],
        );
    }
  }
}

class _ParticlePainter extends CustomPainter {
  final double t;
  final PhaseMood mood;
  final Color accent;
  final List<_Particle> particles;

  _ParticlePainter({
    required this.t,
    required this.mood,
    required this.accent,
    required this.particles,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint();
    for (final p in particles) {
      final drift = (t * p.speed + p.phase / (2 * math.pi)) % 1.0;
      double x, y, opacity;
      switch (mood) {
        case PhaseMood.night:
        case PhaseMood.role:
          // ateşböceği: yavaş yükselir, yatayda salınır, yanıp söner
          y = (p.y - drift) % 1.0;
          x = p.x + math.sin(t * 2 * math.pi * p.speed + p.phase) * 0.03;
          opacity =
              0.25 + 0.55 * (0.5 + 0.5 * math.sin(t * 6 * math.pi + p.phase));
          break;
        case PhaseMood.vote:
          // kor: hızlı yükselir, yükseldikçe söner
          y = (p.y - drift * 1.6) % 1.0;
          x = p.x + math.sin(t * 2 * math.pi + p.phase) * 0.015;
          opacity = (y).clamp(0.0, 1.0) * 0.35;
          break;
        case PhaseMood.day:
          // ışık zerresi: yana süzülür, çok silik
          x = (p.x + drift * 0.4) % 1.0;
          y = p.y + math.sin(t * 2 * math.pi + p.phase) * 0.02;
          opacity = 0.10 + 0.08 * math.sin(t * 4 * math.pi + p.phase);
          break;
        case PhaseMood.ghost:
          // tayf: iri, bulanık, ağır süzülür
          x = (p.x + drift * 0.25) % 1.0;
          y = p.y + math.sin(t * 2 * math.pi * 0.5 + p.phase) * 0.05;
          opacity = 0.05 + 0.05 * math.sin(t * 2 * math.pi + p.phase);
          break;
      }
      final color = switch (mood) {
        PhaseMood.day => const Color(0xFFF4B728),
        PhaseMood.vote => Colors.redAccent,
        PhaseMood.ghost => const Color(0xFF9BA7D9),
        _ => accent,
      };
      final alpha = opacity.clamp(0.0, 1.0);
      final center = Offset(x * size.width, y * size.height);
      if (mood == PhaseMood.ghost) {
        // MaskFilter blur mobil web'de çok pahalı — yumuşaklığı iç içe
        // halkalarla taklit et (scroll janki bulgusu, 17 Ağu).
        for (var ring = 3; ring >= 1; ring--) {
          paint.color = color.withValues(alpha: alpha / ring);
          canvas.drawCircle(center, p.size * ring / 3, paint);
        }
      } else {
        paint.color = color.withValues(alpha: alpha);
        canvas.drawCircle(center, p.size, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ParticlePainter old) => old.t != t;
}
