import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/tier.dart';
import '../../state/game_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common/countdown_timer.dart';
import '../../widgets/common/phase_background.dart';
import '../../widgets/common/player_name_grid.dart';
import '../../widgets/common/zkoy_button.dart';

class VoteScreen extends StatefulWidget {
  const VoteScreen({super.key});

  @override
  State<VoteScreen> createState() => _VoteScreenState();
}

class _VoteScreenState extends State<VoteScreen> {
  String? _pending;
  bool _sealed = false;
  int _round = -1;

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final me = state.me!;
    final myTier = TierX.fromInt(me.tier);

    if (state.round != _round) {
      _round = state.round;
      _sealed = false;
      _pending = null;
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Oylama')),
      body: PhaseBackground(
        mood: PhaseMood.vote,
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    CountdownTimer(
                      endsAt: state.endsAt,
                      total: PhaseDurations.vote.inSeconds,
                      label: 'OYLAMA',
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Senin oyun ${myTier.voteWeight}x ağırlığında (${myTier.label})',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Şu ana kadar mühürlenen toplam ağırlık: ${state.voteWeightCast ?? 0}',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Kimi asalım?',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    if (gp.suspicionRound == state.round &&
                        gp.suspicionId != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        '🔍 Gece şüphen: '
                        '${state.players.where((p) => p.id == gp.suspicionId).map((p) => p.name).join()}',
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ],
                    const SizedBox(height: 16),
                    if (_sealed || me.acted) ...[
                      const Text('🗳️', style: TextStyle(fontSize: 44)),
                      const SizedBox(height: 8),
                      Text(
                        'Oyun mühürlendi',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      Text(
                        'Sandık kapanıyor…',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      TextButton(
                        onPressed: () => setState(() => _sealed = false),
                        child: const Text('Oyumu değiştir'),
                      ),
                    ] else ...[
                      PlayerNameGrid(
                        targets: me.targets,
                        selectedId: _pending,
                        onSelect: (id) => setState(() => _pending = id),
                      ),
                      const SizedBox(height: 20),
                      ZkoyButton(
                        label: 'Oyu Mühürle',
                        big: true,
                        color: Colors.redAccent,
                        onPressed: _pending == null
                            ? null
                            : () {
                                context.read<GameProvider>().sendVote(
                                  _pending!,
                                );
                                setState(() {
                                  _sealed = true;
                                  _pending = null;
                                });
                              },
                      ),
                    ],
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
