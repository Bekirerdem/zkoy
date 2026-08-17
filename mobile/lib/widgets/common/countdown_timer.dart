import 'dart:async';

import 'package:flutter/material.dart';

/// Sunucunun verdiği bitiş anından (epoch ms) geriye sayar. Tek doğruluk
/// kaynağı `endsAt` — yerel tik + poll resenkronu karışımı sayaçta
/// "bir hızlı bir yavaş" titremesi yapıyordu (17 Ağu saha bulgusu);
/// artık her çeyrek saniyede kalan süre doğrudan hesaplanır.
class CountdownTimer extends StatefulWidget {
  final int? endsAt; // epoch ms; null → sayaç gizlenir
  final int total;
  final String? label;

  const CountdownTimer({
    super.key,
    required this.endsAt,
    required this.total,
    this.label,
  });

  @override
  State<CountdownTimer> createState() => _CountdownTimerState();
}

class _CountdownTimerState extends State<CountdownTimer> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(
      const Duration(milliseconds: 250),
      (_) => mounted ? setState(() {}) : null,
    );
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  int get _remaining {
    final e = widget.endsAt;
    if (e == null) return 0;
    final ms = e - DateTime.now().millisecondsSinceEpoch;
    return (ms / 1000).ceil().clamp(0, 9999);
  }

  @override
  Widget build(BuildContext context) {
    final left = _remaining;
    final ratio = widget.total == 0
        ? 0.0
        : (left / widget.total).clamp(0.0, 1.0);
    final urgent = left <= 10;
    final color = urgent
        ? Colors.redAccent
        : Theme.of(context).colorScheme.primary;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.label != null) ...[
          Text(
            widget.label!,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(letterSpacing: 1.2),
          ),
          const SizedBox(height: 10),
        ],
        Text(
          '$left',
          style: Theme.of(
            context,
          ).textTheme.displayLarge?.copyWith(color: color, fontSize: 56),
        ),
        if (left == 0)
          Text(
            'faz kapanıyor…',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: color),
          ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            height: 10,
            width: 220,
            child: LinearProgressIndicator(
              value: ratio,
              backgroundColor: color.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ),
      ],
    );
  }
}
