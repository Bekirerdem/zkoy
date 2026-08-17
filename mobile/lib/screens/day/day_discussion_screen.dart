import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/game_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common/block_clock.dart';
import '../../widgets/common/countdown_timer.dart';
import '../../widgets/common/zkoy_card.dart';
import '../will/will_editor_screen.dart';

class DayDiscussionScreen extends StatelessWidget {
  const DayDiscussionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final dawn = state.lastDawn;
    final alive = state.players.where((p) => p.alive).length;

    return Scaffold(
      appBar: AppBar(title: Text('Gündüz — Tur ${state.round}')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BlockClock(blockHeight: state.height),
                  const SizedBox(height: 16),
                  CountdownTimer(
                    seconds: state.secondsRemaining,
                    total: PhaseDurations.day.inSeconds,
                    label: 'TARTIŞMA',
                  ),
                  const SizedBox(height: 20),
                  // Dün gecenin sonucu — ŞAFAK 12 sn'de geçiyor, kaçıran
                  // burada görür; tartışmanın hammaddesi bu.
                  if (dawn != null)
                    ZkoyCard(
                      child: Column(
                        children: [
                          Text('🌅 ${dawn.text}',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.titleLarge),
                          if (dawn.will != null && dawn.will!.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(
                              'vasiyet — "${dawn.will}"',
                              textAlign: TextAlign.center,
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyMedium
                                  ?.copyWith(fontStyle: FontStyle.italic),
                            ),
                          ],
                        ],
                      ),
                    ),
                  const SizedBox(height: 16),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text('KÖY MEYDANI · $alive sağ',
                        style: Theme.of(context).textTheme.bodyMedium),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: state.players
                        .map((p) => Chip(
                              label: Text(
                                p.name,
                                style: TextStyle(
                                  decoration: p.alive
                                      ? null
                                      : TextDecoration.lineThrough,
                                ),
                              ),
                              avatar: Text(p.alive ? '🌾' : '🪦'),
                              backgroundColor: p.alive
                                  ? null
                                  : Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerHighest,
                            ))
                        .toList(),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Salonda tartışın — şüphelendiğiniz kişiyi konuşun.\nOylama az sonra başlıyor.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 20),
                  TextButton.icon(
                    icon: const Icon(Icons.edit_note_rounded),
                    label: const Text('Vasiyetimi düzenle'),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const WillEditorScreen()),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
