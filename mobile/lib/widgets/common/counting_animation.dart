import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

/// Rol dağıtımı sırasında oynatılan "karıştırma/sayma" animasyonu:
/// hızlıca rastgele sayılar/emoji değişir, süre bitince [onDone] çağrılır.
class CountingAnimation extends StatefulWidget {
  final Duration duration;
  final VoidCallback onDone;
  final List<String> symbols;

  const CountingAnimation({
    super.key,
    required this.onDone,
    this.duration = const Duration(seconds: 3),
    this.symbols = const ['🧛', '🌾', '🏛️', '👑', '🕵️', '💊', '🗡️'],
  });

  @override
  State<CountingAnimation> createState() => _CountingAnimationState();
}

class _CountingAnimationState extends State<CountingAnimation> {
  final _rng = Random();
  Timer? _tickTimer;
  Timer? _doneTimer;
  int _n = 0;
  String _symbol = '🧛';

  @override
  void initState() {
    super.initState();
    _tickTimer = Timer.periodic(const Duration(milliseconds: 90), (_) {
      if (!mounted) return;
      setState(() {
        _n = _rng.nextInt(900) + 100;
        _symbol = widget.symbols[_rng.nextInt(widget.symbols.length)];
      });
    });
    _doneTimer = Timer(widget.duration, widget.onDone);
  }

  @override
  void dispose() {
    _tickTimer?.cancel();
    _doneTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(_symbol, style: const TextStyle(fontSize: 64)),
        const SizedBox(height: 12),
        Text(
          '$_n',
          style: Theme.of(context)
              .textTheme
              .displayLarge
              ?.copyWith(fontSize: 48),
        ),
        const SizedBox(height: 18),
        Text(
          'Roller dağıtılıyor…',
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ],
    );
  }
}
