import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../models/tier.dart';
import '../../state/game_provider.dart';
import '../../widgets/common/zkoy_button.dart';
import '../../widgets/common/zkoy_card.dart';

class RoomWaitingScreen extends StatelessWidget {
  const RoomWaitingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final isHost = gp.amHost;
    final myTier = state.me != null ? TierX.fromInt(state.me!.tier) : null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Köy Meydanı'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Odadan çık',
            onPressed: () => context.read<GameProvider>().leaveRoom(),
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
                  Text('Oda Kodu', style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 8),
                  Text(
                    gp.code ?? '----',
                    style: Theme.of(context)
                        .textTheme
                        .displayLarge
                        ?.copyWith(fontSize: 52, letterSpacing: 6),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: QrImageView(
                      data: gp.code ?? '',
                      size: 160,
                      backgroundColor: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 28),
                  if (myTier != null)
                    Text(
                      'Kademen: ${myTier.emoji} ${myTier.label} (kimseye görünmez)',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  const SizedBox(height: 8),
                  Text(
                    '${state.players.length} oyuncu köyde',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  ...state.players.map((p) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: ZkoyCard(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 18, vertical: 12),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(p.name,
                                    style: Theme.of(context).textTheme.titleLarge),
                              ),
                              if (p.id == gp.myPlayerId)
                                const Icon(Icons.person_rounded),
                            ],
                          ),
                        ),
                      )),
                  const SizedBox(height: 20),
                  if (isHost)
                    ZkoyButton(
                      label: gp.loading ? 'Başlatılıyor…' : 'Oyunu Başlat',
                      big: true,
                      onPressed: gp.loading
                          ? null
                          : () => context.read<GameProvider>().startRoom(),
                    )
                  else
                    Text(
                      'Ev sahibinin oyunu başlatması bekleniyor…',
                      style: Theme.of(context).textTheme.bodyLarge,
                      textAlign: TextAlign.center,
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
