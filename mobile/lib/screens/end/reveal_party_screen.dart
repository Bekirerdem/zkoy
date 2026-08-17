import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../models/role.dart';
import '../../models/room_state.dart';
import '../../models/tier.dart';
import '../../state/game_provider.dart';
import '../../utils/constants.dart';
import '../../widgets/common/status_overlay.dart';
import '../../widgets/common/zkoy_button.dart';

/// Oyun sonu "ifşa partisi": oda UFVK'sı + tier ifşaları + ÇÖZÜLMÜŞ oyun
/// dökümü (kim kime oy verdi, vampir kimi seçti) — "cam ebe" kanıtı burada
/// okunur hale gelir.
class RevealPartyScreen extends StatefulWidget {
  const RevealPartyScreen({super.key});

  @override
  State<RevealPartyScreen> createState() => _RevealPartyScreenState();
}

class _RevealPartyScreenState extends State<RevealPartyScreen> {
  List<Map<String, dynamic>>? _memos;

  @override
  void initState() {
    super.initState();
    _loadMemos();
  }

  Future<void> _loadMemos() async {
    final gp = context.read<GameProvider>();
    final code = gp.code;
    if (code == null) return;
    try {
      final memos = await gp.api.revealMemos(code);
      if (mounted) setState(() => _memos = memos);
    } catch (_) {
      if (mounted) setState(() => _memos = const []);
    }
  }

  /// Memo'daki oyuncu id'sini isme çevirir (id'ler zincirde, isimler odada).
  String _name(Map<String, String> names, dynamic id) =>
      names[id] ?? (id?.toString() ?? '?');

  String? _memoLine(Map<String, dynamic> m, Map<String, String> names,
      Map<String, Role> roles) {
    switch (m['t']) {
      case 'night':
        final actor = _name(names, m['p']);
        final role = roles[names[m['p']] ?? ''] ?? Role.koylu;
        return '${roleEmoji(role)} $actor → ${_name(names, m['x'])}';
      case 'vote':
        return '🗳️ ${_name(names, m['p'])} → ${_name(names, m['x'])}'
            ' (ağırlık ${m['w'] ?? 1})';
      case 'gvote':
        return '👻 kehanet: ${_name(names, m['p'])} → ${_name(names, m['x'])}';
      case 'seerr':
        return '🕵️ sorgu: ${_name(names, m['x'])} vampir mi? '
            '${m['vamp'] == true ? "EVET" : "hayır"}';
      case 'will':
        return '📜 ${_name(names, m['p'])}: "${m['txt']}"';
      case 'pot':
        return '💰 pot zincirde fonlandı';
      default:
        return null; // join/role/spoiler/result/reveal/prize: listeyi boğmasın
    }
  }

  @override
  Widget build(BuildContext context) {
    final gp = context.watch<GameProvider>();
    final state = gp.state!;
    final end = state.end;
    final amAlive = state.me?.alive ?? false;

    final names = <String, String>{
      for (final p in state.players) p.id: p.name,
    };
    final roles = <String, Role>{
      for (final r in end?.reveals ?? <EndReveal>[])
        if (r.role != null) r.name: r.role!,
    };

    return StatusOverlay(
      tone: amAlive ? StatusTone.none : StatusTone.dead,
      child: Scaffold(
        backgroundColor: amAlive ? null : Colors.transparent,
        appBar: AppBar(title: const Text('İfşa Partisi')),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: end == null
                  ? const Padding(
                      padding: EdgeInsets.all(40),
                      child: CircularProgressIndicator(),
                    )
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            state.winner == 'koy'
                                ? 'Köy kazandı 🏘️'
                                : 'Vampirler kazandı 🧛',
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Toplam pot: ${formatZats(state.potZats)} TAZ',
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                          const SizedBox(height: 16),
                          // ── Cam ebe anahtarı: ne olduğu + kopyala ──
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Theme.of(context).cardTheme.color,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: Theme.of(context)
                                    .colorScheme
                                    .secondary
                                    .withValues(alpha: 0.5),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '🔑 Odanın Okuma Anahtarı',
                                  style:
                                      Theme.of(context).textTheme.titleLarge,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Bu oyunun TÜM mühürlü mektuplarını açan '
                                  'anahtar — para harcatmaz, sadece okutur. '
                                  'Kopyalayıp kendi Zcash cüzdanına izleme '
                                  'hesabı olarak ekleyebilir, aşağıdaki dökümü '
                                  'kendin doğrulayabilirsin.',
                                  style:
                                      Theme.of(context).textTheme.bodyMedium,
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  '${end.ufvk.substring(0, 24)}…'
                                  '${end.ufvk.substring(end.ufvk.length - 8)}',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodyMedium
                                      ?.copyWith(fontFamily: 'monospace'),
                                ),
                                const SizedBox(height: 10),
                                TextButton.icon(
                                  icon: const Icon(Icons.copy_rounded),
                                  label: const Text('Anahtarı Kopyala'),
                                  onPressed: () async {
                                    await Clipboard.setData(
                                      ClipboardData(text: end.ufvk),
                                    );
                                    if (context.mounted) {
                                      ScaffoldMessenger.of(context)
                                          .showSnackBar(
                                        const SnackBar(
                                          content:
                                              Text('Anahtar kopyalandı ✓'),
                                        ),
                                      );
                                    }
                                  },
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 22),
                          Text(
                            'Kimin eli neydi',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 10),
                          ...end.reveals.map((e) {
                            final payout = end.payouts
                                .where((p) => p.name == e.name)
                                .map((p) => p.zats)
                                .fold<int>(0, (a, b) => a + b);
                            final role = e.role ?? Role.koylu;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: roleColor(
                                    role,
                                  ).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: roleColor(
                                      role,
                                    ).withValues(alpha: 0.4),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Text(
                                      roleEmoji(role),
                                      style: const TextStyle(fontSize: 20),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            e.name,
                                            style: Theme.of(
                                              context,
                                            ).textTheme.titleLarge,
                                          ),
                                          Text(
                                            '${role.label} · ${TierX.fromInt(e.tier).label}',
                                            style: Theme.of(
                                              context,
                                            ).textTheme.bodyMedium,
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (payout > 0)
                                      Text(
                                        '+${formatZats(payout)}',
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleLarge
                                            ?.copyWith(color: Colors.green),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          }),
                          const SizedBox(height: 22),
                          // ── Oyun dökümü: mühürlerin çözülmüş içi ──
                          Text(
                            'Oyun dökümü — mühürlerin içi',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Zincire mühürlenen her hamle, tur tur:',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 10),
                          if (_memos == null)
                            const Center(
                              child: Padding(
                                padding: EdgeInsets.all(12),
                                child: CircularProgressIndicator(),
                              ),
                            )
                          else
                            ..._buildTimeline(context, names, roles),
                          const SizedBox(height: 24),
                          ZkoyButton(
                            label: 'Yeni Oyun',
                            onPressed: () =>
                                context.read<GameProvider>().leaveRoom(),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildTimeline(BuildContext context,
      Map<String, String> names, Map<String, Role> roles) {
    final rows = <Widget>[];
    int? lastRound;
    var shown = 0;
    for (final m in _memos!) {
      final line = _memoLine(m, names, roles);
      if (line == null) continue;
      final round = m['r'] as int?;
      if (round != null && round != lastRound) {
        lastRound = round;
        rows.add(Padding(
          padding: const EdgeInsets.only(top: 10, bottom: 4),
          child: Text('— Tur $round —',
              style: Theme.of(context).textTheme.bodyMedium),
        ));
      }
      rows.add(Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(line, style: Theme.of(context).textTheme.bodyLarge),
      ));
      shown++;
    }
    if (shown == 0) {
      rows.add(Text(
        'Döküm henüz boş — mühürler zincire oturdukça burada görünür '
        '(perdedeki MÜHÜR DEFTERİ de aynı kanıtı gösterir).',
        style: Theme.of(context).textTheme.bodyMedium,
      ));
    }
    return rows;
  }
}
