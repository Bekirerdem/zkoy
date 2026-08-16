import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/role.dart';
import '../../state/game_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common/countdown_timer.dart';
import '../../widgets/common/player_name_grid.dart';
import '../../widgets/common/zkoy_button.dart';
import '../will/will_editor_screen.dart';

class NightActionScreen extends StatefulWidget {
  const NightActionScreen({super.key});

  @override
  State<NightActionScreen> createState() => _NightActionScreenState();
}

class _NightActionScreenState extends State<NightActionScreen> {
  String? _pendingTarget;

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final me = state.me!;
    final role = me.role;

    final title = switch (role) {
      Role.vampir => 'Kurbanını seç 🧛',
      Role.doktor => 'Kimi koruyacaksın? 💊',
      Role.gozcu => 'Kimi sorgulayacaksın? 🕵️',
      _ => 'Köy Uyuyor 🌙',
    };

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gece'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_note_rounded),
            tooltip: 'Vasiyet',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const WillEditorScreen()),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  CountdownTimer(
                    seconds: state.secondsRemaining,
                    total: PhaseDurations.night.inSeconds,
                    label: 'GECE',
                  ),
                  const SizedBox(height: 28),
                  Text(title, style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 20),
                  if (role == null || !role.hasNightAction) ...[
                    const Text('😴', style: TextStyle(fontSize: 56)),
                    const SizedBox(height: 16),
                    Text(
                      'Gözlerini kapat, köy şimdi uyuyor. Sabah tekrar açacaksın.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ] else ...[
                    if (me.acted && _pendingTarget == null)
                      Text('Hamlen mühürlendi. Bekleniyor…',
                          style: Theme.of(context).textTheme.bodyLarge)
                    else ...[
                      PlayerNameGrid(
                        targets: me.targets,
                        selectedId: _pendingTarget,
                        onSelect: (id) => setState(() => _pendingTarget = id),
                      ),
                      const SizedBox(height: 20),
                      ZkoyButton(
                        label: 'Hamleyi Mühürle',
                        big: true,
                        onPressed: _pendingTarget == null
                            ? null
                            : () {
                                context.read<GameProvider>().sendNight(_pendingTarget!);
                                setState(() {});
                              },
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
