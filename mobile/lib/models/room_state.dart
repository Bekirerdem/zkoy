import 'phase.dart';
import 'role.dart';

/// docs/API.md `players[]` — herkese açık, yalnız id/isim/durum (kademe/rol
/// GİZLİ — Ö9 anonimlik kümesi böyle korunuyor).
class PublicPlayer {
  final String id;
  final String name;
  final bool alive;

  const PublicPlayer({required this.id, required this.name, required this.alive});

  factory PublicPlayer.fromJson(Map<String, dynamic> j) => PublicPlayer(
        id: j['id'] as String,
        name: j['name'] as String,
        alive: j['alive'] as bool? ?? true,
      );
}

/// docs/API.md `me.targets[]` / `ghost` içindeki isim çiftleri.
class Target {
  final String id;
  final String name;
  const Target({required this.id, required this.name});

  factory Target.fromJson(Map<String, dynamic> j) =>
      Target(id: j['id'] as String, name: j['name'] as String);
}

class GozcuResult {
  final String name;
  final bool vamp;
  const GozcuResult({required this.name, required this.vamp});

  factory GozcuResult.fromJson(Map<String, dynamic> j) =>
      GozcuResult(name: j['name'] as String, vamp: j['vamp'] as bool);
}

/// docs/API.md `me` — yalnız isteği yapan token için doldurulur.
class MeView {
  final String id;
  final String name;
  final Role? role;
  final bool alive;
  final int tier;
  final bool isHost;
  final String? will;
  final bool acted;
  final List<Target> targets;
  final GozcuResult? gozcuResult;

  const MeView({
    required this.id,
    required this.name,
    required this.role,
    required this.alive,
    required this.tier,
    required this.isHost,
    required this.will,
    required this.acted,
    required this.targets,
    required this.gozcuResult,
  });

  factory MeView.fromJson(Map<String, dynamic> j) => MeView(
        id: j['id'] as String,
        name: j['name'] as String,
        role: j['role'] != null ? RoleX.fromWire(j['role'] as String) : null,
        alive: j['alive'] as bool,
        tier: j['tier'] as int,
        isHost: j['isHost'] as bool? ?? false,
        will: j['will'] as String?,
        acted: j['acted'] as bool? ?? false,
        targets: (j['targets'] as List? ?? [])
            .map((t) => Target.fromJson(t as Map<String, dynamic>))
            .toList(),
        gozcuResult: j['gozcuResult'] != null
            ? GozcuResult.fromJson(j['gozcuResult'] as Map<String, dynamic>)
            : null,
      );
}

/// docs/API.md `announcements[]` — dawn/execution/info/end anonsları.
class Announcement {
  final int at;
  final String kind;
  final String text;
  final String? will;

  const Announcement({
    required this.at,
    required this.kind,
    required this.text,
    this.will,
  });

  factory Announcement.fromJson(Map<String, dynamic> j) => Announcement(
        at: j['at'] as int,
        kind: j['kind'] as String,
        text: j['text'] as String,
        will: j['will'] as String?,
      );
}

/// docs/API.md `ghost.memos[]` — mühürlü oda memo akışı (txid + ham memo).
class GhostMemo {
  final String txid;
  final Map<String, dynamic> memo; // v1 memo protokolü: v,t,r,p,x,...

  const GhostMemo({required this.txid, required this.memo});

  factory GhostMemo.fromJson(Map<String, dynamic> j) => GhostMemo(
        txid: j['txid'] as String,
        memo: j['memo'] as Map<String, dynamic>,
      );

  String get type => memo['t'] as String? ?? '?';

  String get label => switch (type) {
        'join' => '${memo['name']} köye katıldı',
        'role' => 'Rol mühürlendi',
        'pot' => 'Pot fonlandı',
        'night' => 'Gece hamlesi mühürlendi',
        'seerr' => 'Gözcü sorgusu çözüldü (vampir: ${memo['vamp']})',
        'vote' => 'Oy mühürlendi (ağırlık ${memo['w'] ?? '?'})',
        'gvote' => 'Hayalet kehaneti atıldı',
        'will' => 'Vasiyet güncellendi',
        'result' => 'Tur sonucu ilan edildi',
        'spoiler' => 'Ölüm anı — roller perdeye düştü',
        'reveal' => 'Kademe ifşa edildi',
        'prize' => 'Ödül gönderildi: ${memo['zat'] ?? '?'} zat',
        _ => type,
      };
}

class EndPayout {
  final String? name;
  final int zats;
  final String reason;
  const EndPayout({required this.name, required this.zats, required this.reason});

  factory EndPayout.fromJson(Map<String, dynamic> j) => EndPayout(
        name: j['name'] as String?,
        zats: j['zats'] as int,
        reason: j['reason'] as String,
      );
}

class EndReveal {
  final String name;
  final int tier;
  final String? salt;
  final String? commit;
  final Role? role;

  const EndReveal({
    required this.name,
    required this.tier,
    required this.salt,
    required this.commit,
    required this.role,
  });

  factory EndReveal.fromJson(Map<String, dynamic> j) => EndReveal(
        name: j['name'] as String,
        tier: j['tier'] as int,
        salt: j['salt'] as String?,
        commit: j['commit'] as String?,
        role: j['role'] != null ? RoleX.fromWire(j['role'] as String) : null,
      );
}

class EndView {
  final List<EndPayout> payouts;
  final String ufvk;
  final List<EndReveal> reveals;

  const EndView({required this.payouts, required this.ufvk, required this.reveals});

  factory EndView.fromJson(Map<String, dynamic> j) => EndView(
        payouts: (j['payouts'] as List? ?? [])
            .map((p) => EndPayout.fromJson(p as Map<String, dynamic>))
            .toList(),
        ufvk: j['ufvk'] as String,
        reveals: (j['reveals'] as List? ?? [])
            .map((r) => EndReveal.fromJson(r as Map<String, dynamic>))
            .toList(),
      );
}

/// docs/API.md GET /room/:code/state cevabının birebir karşılığı.
class RoomState {
  final String code;
  final Phase phase;
  final int round;
  final int? endsAt; // epoch ms, null olabilir (LOBBY/END)
  final int potZats;
  final int height;
  final List<PublicPlayer> players;
  final int? voteWeightCast; // yalnız VOTE fazında dolu (Ö2: yalnız toplam)
  final List<Announcement> announcements;
  final String? winner; // "koy" | "vampir" | null
  final String roomAddress;
  final String chain;
  final int sealedCount;
  final MeView? me;
  final List<GhostMemo>? ghostMemos; // yalnız ben ölüysem dolu gelir
  final EndView? end;

  /// İstemcide hesaplanır (poll anında) — sunucu `endsAt` epoch ms verir.
  final int secondsRemaining;

  const RoomState({
    required this.code,
    required this.phase,
    required this.round,
    required this.endsAt,
    required this.potZats,
    required this.height,
    required this.players,
    required this.voteWeightCast,
    required this.announcements,
    required this.winner,
    required this.roomAddress,
    required this.chain,
    required this.sealedCount,
    required this.me,
    required this.ghostMemos,
    required this.end,
    required this.secondsRemaining,
  });

  Announcement? get lastDawn => _lastOfKind('dawn');
  Announcement? get lastExecution => _lastOfKind('execution');

  Announcement? _lastOfKind(String kind) {
    for (var i = announcements.length - 1; i >= 0; i--) {
      if (announcements[i].kind == kind) return announcements[i];
    }
    return null;
  }

  factory RoomState.fromJson(Map<String, dynamic> j) {
    final endsAt = j['endsAt'] as int?;
    final now = DateTime.now().millisecondsSinceEpoch;
    final remaining = endsAt == null ? 0 : ((endsAt - now) / 1000).ceil().clamp(0, 999);

    return RoomState(
      code: j['code'] as String,
      phase: PhaseX.fromWire(j['phase'] as String),
      round: j['round'] as int? ?? 0,
      endsAt: endsAt,
      potZats: j['potZats'] as int? ?? 0,
      height: j['height'] as int? ?? 0,
      players: (j['players'] as List? ?? [])
          .map((p) => PublicPlayer.fromJson(p as Map<String, dynamic>))
          .toList(),
      voteWeightCast: j['voteWeightCast'] as int?,
      announcements: (j['announcements'] as List? ?? [])
          .map((a) => Announcement.fromJson(a as Map<String, dynamic>))
          .toList(),
      winner: j['winner'] as String?,
      roomAddress: j['roomAddress'] as String? ?? '',
      chain: j['chain'] as String? ?? 'mock',
      sealedCount: j['sealedCount'] as int? ?? 0,
      me: j['me'] != null ? MeView.fromJson(j['me'] as Map<String, dynamic>) : null,
      ghostMemos: j['ghost'] != null
          ? ((j['ghost'] as Map<String, dynamic>)['memos'] as List)
              .map((m) => GhostMemo.fromJson(m as Map<String, dynamic>))
              .toList()
          : null,
      end: j['end'] != null ? EndView.fromJson(j['end'] as Map<String, dynamic>) : null,
      secondsRemaining: remaining,
    );
  }
}
