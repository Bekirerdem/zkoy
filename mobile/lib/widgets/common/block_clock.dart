import 'package:flutter/material.dart';

/// Ö5 — köy meydanı saati = blok yüksekliği (kozmetik).
class BlockClock extends StatelessWidget {
  final int blockHeight;
  const BlockClock({super.key, required this.blockHeight});

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
      letterSpacing: 0.5,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('⛏️', style: TextStyle(fontSize: 14)),
        const SizedBox(width: 6),
        Text('blok #$blockHeight', style: style),
      ],
    );
  }
}
