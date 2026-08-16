import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/game_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common/block_clock.dart';
import '../../widgets/common/countdown_timer.dart';
import '../../widgets/common/zkoy_button.dart';
import '../will/will_editor_screen.dart';

class DayDiscussionScreen extends StatelessWidget {
  const DayDiscussionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;

    return Scaffold(
      appBar: AppBar(title: const Text('Gündüz')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BlockClock(blockHeight: state.height),
                  const SizedBox(height: 20),
                  CountdownTimer(
                    seconds: state.secondsRemaining,
                    total: PhaseDurations.day.inSeconds,
                    label: 'TARTIŞMA',
                  ),
                  const SizedBox(height: 28),
                  const Text('☀️', style: TextStyle(fontSize: 56)),
                  const SizedBox(height: 12),
                  Text(
                    'Salonda tartışın — şüphelendiğiniz kişiyi konuşun.\nOylama az sonra başlayacak.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 28),
                  ZkoyButton(
                    label: 'Vasiyetimi Düzenle',
                    icon: Icons.edit_note_rounded,
                    color: Colors.blueGrey,
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
