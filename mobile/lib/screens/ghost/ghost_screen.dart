import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/phase.dart';
import '../../state/game_provider.dart';
import '../../widgets/common/block_clock.dart';
import '../../widgets/common/phase_background.dart';
import '../../widgets/common/player_name_grid.dart';
import '../../widgets/common/status_overlay.dart';
import '../../widgets/common/zkoy_button.dart';

/// Ö8 — Hayalet Kehaneti: ölen oyuncular VOTE fazında "sıradaki asılan kim"
/// diye mühürlü oy atabilir; en isabetlisi pot dilimi alır. Hayaletler
/// ayrıca oda memo akışını canlı okuyabilir (spec §3 görünürlük modeli).
class GhostScreen extends StatefulWidget {
  const GhostScreen({super.key});

  @override
  State<GhostScreen> createState() => _GhostScreenState();
}

class _GhostScreenState extends State<GhostScreen> {
  String? _pending;

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final me = state.me!;
    final canGvote = state.phase == Phase.vote;
    final memos = state.ghostMemos ?? const [];

    return StatusOverlay(
      tone: StatusTone.dead,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          title: const Text('Hayalet'),
        ),
        body: PhaseBackground(
          mood: PhaseMood.ghost,
          child: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      const Text('👻', style: TextStyle(fontSize: 56)),
                      const SizedBox(height: 8),
                      BlockClock(blockHeight: state.height),
                      const SizedBox(height: 12),
                      // Hayalet oyunu takip edebilmeli: faz + kalan süre + son olay.
                      Text(
                        '${state.phase.label}'
                        '${state.secondsRemaining > 0 ? " · ${state.secondsRemaining} sn" : ""}',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      if (state.announcements.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          state.announcements.last.text,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ],
                      const SizedBox(height: 8),
                      Text(
                        'Her şeyi görürsün ama konuşamaz, oy atamazsın.\n'
                        '(Kehanet oyu hariç)',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      if (canGvote) ...[
                        const SizedBox(height: 24),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.25),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Hayalet Kehaneti',
                                style: Theme.of(context).textTheme.titleLarge
                                    ?.copyWith(color: Colors.white),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Sıradaki asılacak kim? Bil, pot dilimi kazan.',
                                style: Theme.of(context).textTheme.bodyMedium
                                    ?.copyWith(color: Colors.white70),
                              ),
                              const SizedBox(height: 14),
                              if (me.acted && _pending == null)
                                Text(
                                  'Bu tur için mühürlendi ✓',
                                  style: Theme.of(context).textTheme.bodyLarge
                                      ?.copyWith(color: Colors.white),
                                )
                              else ...[
                                PlayerNameGrid(
                                  targets: me.targets,
                                  selectedId: _pending,
                                  onSelect: (id) =>
                                      setState(() => _pending = id),
                                ),
                                const SizedBox(height: 14),
                                ZkoyButton(
                                  label: 'Kehaneti Mühürle',
                                  color: Colors.deepPurple,
                                  onPressed: _pending == null
                                      ? null
                                      : () {
                                          context
                                              .read<GameProvider>()
                                              .sendGhostVote(_pending!);
                                          setState(() {});
                                        },
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 24),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Memo Akışı',
                          style: Theme.of(
                            context,
                          ).textTheme.titleLarge?.copyWith(color: Colors.white),
                        ),
                      ),
                      const SizedBox(height: 8),
                      ...memos.reversed
                          .take(30)
                          .map(
                            (m) => Container(
                              margin: const EdgeInsets.only(bottom: 6),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                m.label,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
