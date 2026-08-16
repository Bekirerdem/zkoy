import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/tier.dart';
import '../../state/game_provider.dart';
import '../../state/session.dart';
import '../../widgets/common/zkoy_button.dart';
import '../../widgets/common/zkoy_card.dart';
import 'qr_scan_screen.dart';

enum _Mode { none, create, join }

class CreateJoinScreen extends StatefulWidget {
  const CreateJoinScreen({super.key});

  @override
  State<CreateJoinScreen> createState() => _CreateJoinScreenState();
}

class _CreateJoinScreenState extends State<CreateJoinScreen> {
  _Mode _mode = _Mode.none;
  Tier? _tier;
  final _codeController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final gp = context.read<GameProvider>();
    final name = context.read<Session>().name!;
    if (_tier == null) return;
    if (_mode == _Mode.create) {
      await gp.createAndJoin(name: name, tier: _tier!);
    } else {
      final code = _codeController.text.trim().toUpperCase();
      if (code.isEmpty) return;
      await gp.joinExisting(code: code, name: name, tier: _tier!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Text('Şirince Köyü', style: Theme.of(context).textTheme.displayLarge),
                  const SizedBox(height: 24),
                  if (_mode == _Mode.none) ...[
                    ZkoyButton(
                      label: 'Oda Kur',
                      icon: Icons.add_home_rounded,
                      big: true,
                      onPressed: () => setState(() => _mode = _Mode.create),
                    ),
                    const SizedBox(height: 14),
                    ZkoyButton(
                      label: 'Kodla Katıl',
                      icon: Icons.qr_code_rounded,
                      big: true,
                      color: Colors.teal,
                      onPressed: () => setState(() => _mode = _Mode.join),
                    ),
                  ] else ...[
                    if (_mode == _Mode.join) ...[
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _codeController,
                              textAlign: TextAlign.center,
                              textCapitalization: TextCapitalization.characters,
                              style: const TextStyle(fontSize: 28, letterSpacing: 6),
                              maxLength: 4,
                              decoration: const InputDecoration(
                                hintText: 'ACDE',
                                counterText: '',
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.all(Radius.circular(16)),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          IconButton.filled(
                            icon: const Icon(Icons.qr_code_scanner_rounded),
                            tooltip: 'QR okut',
                            onPressed: () async {
                              final code = await Navigator.of(context).push<String>(
                                MaterialPageRoute(builder: (_) => const QrScanScreen()),
                              );
                              if (code != null) {
                                _codeController.text =
                                    code.length > 4 ? code.substring(0, 4) : code;
                              }
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                    ],
                    Text('Kademeni seç', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 6),
                    Text(
                      'Kademe herkesten gizli kalır; pota koyduğun tutarı belirler.',
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ...Tier.values.map((t) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: ZkoyCard(
                            selected: _tier == t,
                            onTap: () => setState(() => _tier = t),
                            child: Row(
                              children: [
                                Text(t.emoji, style: const TextStyle(fontSize: 32)),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(t.label, style: Theme.of(context).textTheme.titleLarge),
                                      Text(
                                          '${t.entryTaz.toStringAsFixed(3)} TAZ · oy ağırlığı ${t.voteWeight}x',
                                          style: Theme.of(context).textTheme.bodyMedium),
                                    ],
                                  ),
                                ),
                                if (_tier == t) const Icon(Icons.check_circle_rounded),
                              ],
                            ),
                          ),
                        )),
                    const SizedBox(height: 12),
                    if (gp.error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(gp.error!, style: const TextStyle(color: Colors.red)),
                      ),
                    ZkoyButton(
                      label: gp.loading ? 'Katılıyor…' : 'Köye Katıl',
                      big: true,
                      onPressed: (_tier == null || gp.loading) ? null : _submit,
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => setState(() {
                        _mode = _Mode.none;
                        _tier = null;
                      }),
                      child: const Text('Geri'),
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
