import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Dokunuş geri bildirimi: basınca hafif küçülme + dokunulan noktadan
/// büyüyüp sönen halka ve saçılan mini kıvılcımlar.
///
/// [Listener] kullanır — gesture arena'ya GİRMEZ, alttaki butonun/kartın
/// tıklaması asla engellenmez (tıklama güvenliği şartı).
class TapBurst extends StatefulWidget {
  final Widget child;
  final bool enabled;
  final Color? color;

  const TapBurst({
    super.key,
    required this.child,
    this.enabled = true,
    this.color,
  });

  @override
  State<TapBurst> createState() => _TapBurstState();
}

class _Burst {
  final Offset center;
  final AnimationController ctrl;
  final double seed;
  _Burst(this.center, this.ctrl, this.seed);
}

class _TapBurstState extends State<TapBurst> with TickerProviderStateMixin {
  final List<_Burst> _bursts = [];
  bool _pressed = false;

  void _spawn(Offset local) {
    final ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 450),
    );
    final burst = _Burst(local, ctrl, math.Random().nextDouble() * math.pi);
    setState(() => _bursts.add(burst));
    ctrl.forward().whenCompleteOrCancel(() {
      if (mounted) setState(() => _bursts.remove(burst));
      ctrl.dispose();
    });
  }

  @override
  void dispose() {
    for (final b in _bursts) {
      b.ctrl.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? Theme.of(context).colorScheme.secondary;
    return Listener(
      onPointerDown: widget.enabled
          ? (e) {
              setState(() => _pressed = true);
              _spawn(e.localPosition);
            }
          : null,
      onPointerUp: (_) => setState(() => _pressed = false),
      onPointerCancel: (_) => setState(() => _pressed = false),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          AnimatedScale(
            scale: _pressed ? 0.96 : 1.0,
            duration: Duration(milliseconds: _pressed ? 90 : 260),
            curve: _pressed ? Curves.easeOut : Curves.easeOutBack,
            child: widget.child,
          ),
          ..._bursts.map(
            (b) => Positioned.fill(
              child: IgnorePointer(
                child: AnimatedBuilder(
                  animation: b.ctrl,
                  builder: (_, __) => CustomPaint(
                    painter: _BurstPainter(
                      center: b.center,
                      t: Curves.easeOutCubic.transform(b.ctrl.value),
                      color: color,
                      seed: b.seed,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BurstPainter extends CustomPainter {
  final Offset center;
  final double t; // 0..1
  final Color color;
  final double seed;

  _BurstPainter({
    required this.center,
    required this.t,
    required this.color,
    required this.seed,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final fade = (1 - t).clamp(0.0, 1.0);
    // büyüyen halka
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5 * fade
      ..color = color.withValues(alpha: 0.45 * fade);
    canvas.drawCircle(center, 14 + 42 * t, ring);
    // saçılan kıvılcımlar
    final spark = Paint()..color = color.withValues(alpha: 0.7 * fade);
    for (var i = 0; i < 6; i++) {
      final angle = seed + i * math.pi / 3;
      final dist = 10 + 34 * t;
      canvas.drawCircle(
        center + Offset(math.cos(angle) * dist, math.sin(angle) * dist),
        2.2 * fade,
        spark,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _BurstPainter old) => old.t != t;
}
