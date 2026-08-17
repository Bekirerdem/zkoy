import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/role.dart';
import '../../models/tier.dart';
import '../../state/game_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common/status_overlay.dart';
import '../../widgets/common/zkoy_button.dart';

/// Oyun sonu "ifşa partisi": oda UFVK'sı + tier ifşaları perdeye düşer,
/// herkes bağımsız doğrular ("cam ebe" — spec §3 görünürlük modeli).
class RevealPartyScreen extends StatelessWidget {
  const RevealPartyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final end = state.end;
    final amAlive = state.me?.alive ?? false;

    return StatusOverlay(
      tone: amAlive ? StatusTone.none : StatusTone.dead,
      child: Scaffold(
        backgroundColor: amAlive ? null : Colors.transparent,
        appBar: AppBar(title: const Text('İfşa Partisi')),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: end == null
                  ? const Padding(
                      padding: EdgeInsets.all(40),
                      child: CircularProgressIndicator(),
                    )
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            state.winner == 'koy'
                                ? 'Köy kazandı 🏘️'
                                : 'Vampirler kazandı 🧛',
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Toplam pot: ${formatZats(state.potZats)} TAZ',
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                          const SizedBox(height: 16),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: Theme.of(context).cardTheme.color,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(
                              'UFVK: ${end.ufvk}',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(fontFamily: 'monospace'),
                            ),
                          ),
                          const SizedBox(height: 22),
                          Text(
                            'Kim kime — tier ifşaları',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 10),
                          ...end.reveals.map((e) {
                            final payout = end.payouts
                                .where((p) => p.name == e.name)
                                .map((p) => p.zats)
                                .fold<int>(0, (a, b) => a + b);
                            final role = e.role ?? Role.koylu;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: roleColor(
                                    role,
                                  ).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: roleColor(
                                      role,
                                    ).withValues(alpha: 0.4),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Text(
                                      roleEmoji(role),
                                      style: const TextStyle(fontSize: 20),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            e.name,
                                            style: Theme.of(
                                              context,
                                            ).textTheme.titleLarge,
                                          ),
                                          Text(
                                            '${role.label} · ${TierX.fromInt(e.tier).label}',
                                            style: Theme.of(
                                              context,
                                            ).textTheme.bodyMedium,
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (payout > 0)
                                      Text(
                                        '+${formatZats(payout)}',
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleLarge
                                            ?.copyWith(color: Colors.green),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          }),
                          const SizedBox(height: 24),
                          ZkoyButton(
                            label: 'Yeni Oyun',
                            onPressed: () =>
                                context.read<GameProvider>().leaveRoom(),
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
