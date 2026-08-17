import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/game_provider.dart';
import '../../widgets/common/block_clock.dart';

class ExecutionScreen extends StatelessWidget {
  const ExecutionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final exec = state.lastExecution;

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
                  const Text('⚖️', style: TextStyle(fontSize: 56)),
                  const SizedBox(height: 16),
                  Text(
                    exec?.text ?? 'Bugün kimse asılmadı.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  if ((exec?.will ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const Divider(),
                    const SizedBox(height: 12),
                    Text(
                      'Vasiyeti',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '"${exec!.will}"',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        fontStyle: FontStyle.italic,
                      ),
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
