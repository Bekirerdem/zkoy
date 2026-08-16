import 'dart:math';

import 'package:flutter/material.dart';

/// Basit 3B çevirme animasyonu: [front] kapalı kart, dokununca [back]'e döner.
class FlipCard extends StatefulWidget {
  final Widget front;
  final Widget back;
  final ValueChanged<bool>? onFlipped;

  const FlipCard({
    super.key,
    required this.front,
    required this.back,
    this.onFlipped,
  });

  @override
  State<FlipCard> createState() => _FlipCardState();
}

class _FlipCardState extends State<FlipCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  );
  bool _flipped = false;

  void _toggle() {
    if (_flipped) return;
    setState(() => _flipped = true);
    _controller.forward();
    widget.onFlipped?.call(true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _toggle,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final angle = _controller.value * pi;
          final showFront = angle < pi / 2;
          final display = showFront
              ? widget.front
              : Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()..rotateY(pi),
                  child: widget.back,
                );
          return Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.0015)
              ..rotateY(angle),
            child: display,
          );
        },
      ),
    );
  }
}
