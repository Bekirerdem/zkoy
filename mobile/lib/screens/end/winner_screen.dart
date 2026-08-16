import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/tier.dart';
import '../../state/game_provider.dart';
import '../../widgets/common/status_overlay.dart';
import '../../widgets/common/zkoy_button.dart';
import 'reveal_party_screen.dart';

class WinnerScreen extends StatelessWidget {
  const WinnerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final end = state.end;
    final myPayout = end?.payouts.where((p) => p.name == state.me?.name).firstOrNull;

    return StatusOverlay(
      tone: StatusTone.winner,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('🏆', style: TextStyle(fontSize: 72)),
                    const SizedBox(height: 16),
                    Text(
                      'Kazandın!',
                      style: Theme.of(context)
                          .textTheme
                          .displayLarge
                          ?.copyWith(color: Colors.white),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      state.winner == 'koy'
                          ? 'Köy vampirleri temizledi.'
                          : 'Vampirler köyü ele geçirdi.',
                      style: Theme.of(context)
                          .textTheme
                          .bodyLarge
                          ?.copyWith(color: Colors.white),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 28),
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Column(
                        children: [
                          Text('Pot Payın',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyLarge
                                  ?.copyWith(color: Colors.white)),
                          const SizedBox(height: 8),
                          Text(
                            '${formatZats(myPayout?.zats ?? 0)} TAZ',
                            style: Theme.of(context)
                                .textTheme
                                .displayLarge
                                ?.copyWith(color: Colors.white, fontSize: 36),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),
                    ZkoyButton(
                      label: 'İfşa Partisine Git',
                      color: Colors.black.withValues(alpha: 0.25),
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const RevealPartyScreen()),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
