import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/role.dart';
import '../../state/game_provider.dart';
import '../../widgets/common/block_clock.dart';

class DawnResultScreen extends StatelessWidget {
  const DawnResultScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final me = state.me!;
    final dawn = state.lastDawn;

    return Scaffold(
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
                  const SizedBox(height: 24),
                  const Text('🌅', style: TextStyle(fontSize: 56)),
                  const SizedBox(height: 16),
                  Text(
                    'Şafak Söktü',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    dawn?.text ?? 'Köy sakin bir gece geçirdi.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  if (me.role == Role.gozcu && me.gozcuResult != null) ...[
                    const SizedBox(height: 28),
                    const Divider(),
                    const SizedBox(height: 12),
                    Text(
                      'Gözcü Sorgun',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${me.gozcuResult!.name}: ${me.gozcuResult!.vamp ? "VAMPİR 🧛" : "temiz ✅"}',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
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
