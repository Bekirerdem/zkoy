import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/role.dart';
import '../../models/room_state.dart';
import '../../state/game_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common/countdown_timer.dart';
import '../../widgets/common/phase_background.dart';
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
  bool _sealed = false;
  int _round = -1;

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final me = state.me!;
    final role = me.role;

    // Widget turlar arasında yeniden kullanılır — eski seçim/onay sızmasın.
    if (state.round != _round) {
      _round = state.round;
      _sealed = false;
      _pendingTarget = null;
    }

    final title = switch (role) {
      Role.vampir => 'Kurbanını seç 🧛',
      Role.doktor => 'Kimi koruyacaksın? 💊',
      Role.gozcu => 'Kimi sorgulayacaksın? 🕵️',
      _ => 'Köy Uyuyor 🌙',
    };

    final accent = role != null && role.hasNightAction ? roleColor(role) : null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gece'),
        backgroundColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_note_rounded),
            tooltip: 'Vasiyet',
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const WillEditorScreen())),
          ),
        ],
      ),
      extendBodyBehindAppBar: true,
      body: PhaseBackground(
        mood: PhaseMood.night,
        accent: accent,
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
                      total: PhaseDurations.night.inSeconds,
                      label: 'GECE',
                    ),
                    const SizedBox(height: 28),
                    Text(
                      title,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 20),
                    if (role == null || !role.hasNightAction) ...[
                      // Köylü gecesi: pasif değil — bilgi + şüphe + vasiyet.
                      Text(
                        'Sen uyurken köy dönüyor:\n'
                        '🧛 vampir avlanıyor · 💊 doktor nöbette · 🕵️ gözcü iz sürüyor',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      if (state.lastDawn != null) ...[
                        const SizedBox(height: 14),
                        Text(
                          '🌅 Dün: ${state.lastDawn!.text}',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ],
                      const SizedBox(height: 22),
                      Text(
                        '🔍 Şüpheni işaretle',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      Text(
                        'Kimse görmez — sabah oylamada sana hatırlatılır.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 12),
                      PlayerNameGrid(
                        targets: [
                          for (final p in state.players)
                            if (p.alive && p.id != me.id)
                              Target(id: p.id, name: p.name),
                        ],
                        selectedId: gp.suspicionRound == state.round
                            ? gp.suspicionId
                            : null,
                        onSelect: (id) =>
                            gp.markSuspicion(id, state.round),
                      ),
                      const SizedBox(height: 18),
                      TextButton.icon(
                        icon: const Icon(Icons.edit_note_rounded),
                        label: const Text(
                          'Vasiyetini yaz — ölürsen perdeye düşer',
                        ),
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const WillEditorScreen(),
                          ),
                        ),
                      ),
                    ] else ...[
                      if (_sealed || me.acted) ...[
                        const Text('✅', style: TextStyle(fontSize: 44)),
                        const SizedBox(height: 8),
                        Text(
                          'Hamlen mühürlendi',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        Text(
                          'Diğerleri bekleniyor…',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        TextButton(
                          onPressed: () => setState(() => _sealed = false),
                          child: const Text('Hamlemi değiştir'),
                        ),
                      ] else ...[
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
                                  context.read<GameProvider>().sendNight(
                                    _pendingTarget!,
                                  );
                                  setState(() {
                                    _sealed = true;
                                    _pendingTarget = null;
                                  });
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
      ),
    );
  }
}
