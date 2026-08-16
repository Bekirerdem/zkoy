import 'dart:async';

import 'package:flutter/material.dart';

/// Sunucudan gelen [seconds] değerini gösterir, iki poll arasında akıcı
/// görünmesi için yerel olarak da saniyede bir azaltır (server-authoritative:
/// her yeni state geldiğinde [didUpdateWidget] ile resenkronize olur).
class CountdownTimer extends StatefulWidget {
  final int seconds;
  final int total;
  final String? label;

  const CountdownTimer({
    super.key,
    required this.seconds,
    required this.total,
    this.label,
  });

  @override
  State<CountdownTimer> createState() => _CountdownTimerState();
}

class _CountdownTimerState extends State<CountdownTimer> {
  late int _local = widget.seconds;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _startTicker();
  }

  void _startTicker() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _local = (_local - 1).clamp(0, widget.total));
    });
  }

  @override
  void didUpdateWidget(covariant CountdownTimer old) {
    super.didUpdateWidget(old);
    if (old.seconds != widget.seconds) {
      _local = widget.seconds;
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ratio = widget.total == 0 ? 0.0 : (_local / widget.total).clamp(0, 1);
    final urgent = _local <= 10;
    final color = urgent ? Colors.redAccent : Theme.of(context).colorScheme.primary;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.label != null) ...[
          Text(widget.label!,
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(letterSpacing: 1.2)),
          const SizedBox(height: 10),
        ],
        Text('$_local',
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
                  color: color,
                  fontSize: 56,
                )),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            height: 10,
            width: 220,
            child: LinearProgressIndicator(
              value: ratio.toDouble(),
              backgroundColor: color.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ),
      ],
    );
  }
}
