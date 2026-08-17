import 'dart:async';
import 'dart:math';

import '../models/phase.dart';
import '../models/role.dart';
import '../models/room_state.dart';
import '../models/tier.dart';
import 'api_client.dart';

/// Bekir'in gerçek `src/engine/engine.ts` + `src/server/rooms.ts` mantığının
/// bire bir Dart karşılığı — GET /state ile tamamen aynı JSON şeklini üretir
/// (bkz. docs/API.md), böylece backend hazır olmadan da uygulama gerçekçi
/// biçimde uçtan uca oynanabilir (spec §5 Faz 1 "demo sigortası").
class _PlayerRec {
  final String id;
  final String token;
  final String name;
  final Tier tier;
  Role? role;
  bool alive = true;
  String? will;
  int? diedInRound;
  final bool isBot;

  _PlayerRec({
    required this.id,
    required this.token,
    required this.name,
    required this.tier,
    this.isBot = false,
  });
}

class _Announcement {
  final int at;
  final String kind;
  final String text;
  final String? will;
  _Announcement(this.kind, this.text, {this.will}) : at = DateTime.now().millisecondsSinceEpoch;

  Map<String, dynamic> toJson() => {'at': at, 'kind': kind, 'text': text, 'will': will};
}

class _Payout {
  final String playerId;
  final int zats;
  final String reason;
  _Payout(this.playerId, this.zats, this.reason);
}

class _Room {
  final String code;
  final String roomAddress;
  final String ufvk;
  Phase phase = Phase.lobby;
  int round = 0;
  int? phaseEndsAt;
  int height;
  final List<_PlayerRec> players = [];
  final List<_Announcement> announcements = [];
  Timer? timer;

  final Map<String, String> vampireTargets = {};
  String? doctorSave;
  String? gozcuTarget;
  final Map<String, String> votes = {};
  final Map<String, String> gvotes = {};

  Map<String, dynamic>? lastNight; // {round,died,saved,gozcuResult:{target,vamp}}
  Map<String, dynamic>? lastVote; // {round,lynched,role}
  String? winner; // "koy" | "vampir"
  bool deliWon = false;
  int doctorSaves = 0;
  List<_Payout>? payouts;

  _Room(this.code, this.roomAddress, this.ufvk) : height = 2600000 + Random().nextInt(50000);

  int get potZats => players.fold(0, (s, p) => s + p.tier.entryZats);
}

const _durations = {
  Phase.night: 75000,
  Phase.dawn: 12000,
  Phase.day: 120000,
  Phase.vote: 75000,
  Phase.execution: 12000,
};

const List<String> _botNamePool = [
  'Ahmet', 'Ayşe', 'Mehmet', 'Fatma', 'Mustafa', 'Zeynep', 'Hasan', 'Elif',
  'Hüseyin', 'Emine', 'İbrahim', 'Hatice', 'Ali', 'Sıla', 'Veli', 'Derya',
  'Kemal', 'Nurcan', 'Osman', 'Şirin',
];

const _codeAlphabet = 'ACDEFHJKLMNPRSTUVYZ234679';

class MockApiClient implements ApiClient {
  final Map<String, _Room> _rooms = {};
  final _rng = Random();

  String _code() =>
      List.generate(4, (_) => _codeAlphabet[_rng.nextInt(_codeAlphabet.length)]).join();
  String _id(String prefix) =>
      '$prefix${DateTime.now().microsecondsSinceEpoch}${_rng.nextInt(9999)}';

  _Room _get(String code) {
    final room = _rooms[code.toUpperCase()];
    if (room == null) throw Exception('oda yok: $code');
    return room;
  }

  _PlayerRec _byToken(_Room room, String token) => room.players
      .firstWhere((p) => p.token == token, orElse: () => throw Exception('geçersiz token'));

  @override
  Future<CreateRoomResult> createRoom() async {
    var code = _code();
    while (_rooms.containsKey(code)) {
      code = _code();
    }
    final room = _Room(code, 'utest1room${code}mockaddr', 'uviewtest1${code}mockufvk');
    _rooms[code] = room;
    return CreateRoomResult(code: code, roomAddress: room.roomAddress);
  }

  @override
  Future<JoinResult> joinRoom({
    required String code,
    required String name,
    required Tier tier,
  }) async {
    final room = _get(code);
    if (room.phase != Phase.lobby) throw Exception('oda artık katılıma kapalı');
    final trimmed = name.trim().replaceAll("'", '');
    final safeName = trimmed.length > 24 ? trimmed.substring(0, 24) : trimmed;
    if (safeName.isEmpty) throw Exception('isim gerekli');
    if (room.players.any((p) => p.name == safeName)) throw Exception('bu isim alınmış');
    if (room.players.length >= 15) throw Exception('oda dolu');

    final rec = _PlayerRec(
      id: 'p${room.players.length}-${_id('')}',
      token: _id('t'),
      name: safeName,
      tier: tier,
    );
    room.players.add(rec);
    return JoinResult(
      playerId: rec.id,
      token: rec.token,
      playerAddress: 'utest1player${rec.id}mockaddr',
    );
  }

  @override
  Future<void> startRoom(String code) async {
    final room = _get(code);
    if (room.phase != Phase.lobby) return;

    // Tek cihazda uçtan uca test edilebilsin diye eksik oyuncular bot ile
    // dolduruluyor (backend hazır değilken demo sigortası).
    final pool = List<String>.from(_botNamePool)..shuffle(_rng);
    var i = 0;
    while (room.players.length < 7 && i < pool.length) {
      final name = pool[i];
      if (!room.players.any((p) => p.name == name)) {
        final tiers = Tier.values;
        room.players.add(_PlayerRec(
          id: 'p${room.players.length}-${_id('')}',
          token: _id('bt'),
          name: name,
          tier: tiers[_rng.nextInt(tiers.length)],
          isBot: true,
        ));
      }
      i++;
    }
    if (room.players.length < 7) throw Exception('en az 7 oyuncu gerek');

    _assignRoles(room);
    room.phase = Phase.night;
    room.round = 1;
    room.announcements.add(_Announcement('info', 'Köy uykuya dalıyor… roller mühürlendi.'));
    _armTimer(room);
  }

  void _assignRoles(_Room room) {
    final n = room.players.length;
    final roles = <Role>[Role.vampir, Role.doktor, Role.gozcu];
    if (n >= 10) roles.add(Role.vampir);
    if (n >= 8) roles.add(Role.deli);
    while (roles.length < n) {
      roles.add(Role.koylu);
    }
    roles.shuffle(_rng);
    for (var i = 0; i < room.players.length; i++) {
      room.players[i].role = roles[i];
    }
  }

  void _armTimer(_Room room) {
    room.timer?.cancel();
    if (room.phase == Phase.lobby || room.phase == Phase.end) {
      room.phaseEndsAt = null;
      return;
    }
    final ms = _durations[room.phase]!;
    room.phaseEndsAt = DateTime.now().millisecondsSinceEpoch + ms;
    room.timer = Timer(Duration(milliseconds: ms), () => _resolvePhase(room));
  }

  void _botAct(_Room room) {
    final alive = room.players.where((p) => p.alive).toList();
    for (final p in alive.where((p) => p.isBot)) {
      if (room.phase == Phase.night) {
        if (p.role == Role.vampir && !room.vampireTargets.containsKey(p.id)) {
          final targets = alive.where((x) => x.id != p.id).toList();
          if (targets.isNotEmpty) {
            room.vampireTargets[p.id] = targets[_rng.nextInt(targets.length)].id;
          }
        } else if (p.role == Role.doktor && room.doctorSave == null) {
          room.doctorSave = alive[_rng.nextInt(alive.length)].id;
        } else if (p.role == Role.gozcu && room.gozcuTarget == null) {
          final targets = alive.where((x) => x.id != p.id).toList();
          if (targets.isNotEmpty) {
            room.gozcuTarget = targets[_rng.nextInt(targets.length)].id;
          }
        }
      } else if (room.phase == Phase.vote) {
        if (!room.votes.containsKey(p.id) && _rng.nextDouble() < 0.9) {
          final targets = alive.where((x) => x.id != p.id).toList();
          if (targets.isNotEmpty) {
            room.votes[p.id] = targets[_rng.nextInt(targets.length)].id;
          }
        }
      }
    }
  }

  void _resolvePhase(_Room room) {
    _botAct(room);
    switch (room.phase) {
      case Phase.night:
        _resolveNight(room);
        break;
      case Phase.dawn:
        room.phase = Phase.day;
        break;
      case Phase.day:
        room.phase = Phase.vote;
        break;
      case Phase.vote:
        _resolveVote(room);
        break;
      case Phase.execution:
        room.round += 1;
        room.phase = Phase.night;
        room.announcements.add(_Announcement('info', 'Gece ${room.round} çöküyor…'));
        break;
      case Phase.lobby:
      case Phase.end:
        break;
    }

    if (room.phase == Phase.end) {
      room.phaseEndsAt = null;
      room.timer?.cancel();
      room.announcements.add(_Announcement(
        'end',
        room.winner == 'koy'
            ? 'KÖY KAZANDI — vampirler temizlendi. İfşa partisi başlıyor!'
            : 'VAMPİRLER KAZANDI — köy düştü. İfşa partisi başlıyor!',
      ));
    } else {
      _armTimer(room);
    }
  }

  String? _vampireVerdict(_Room room) {
    if (room.vampireTargets.isEmpty) return null;
    final tally = <String, int>{};
    for (final t in room.vampireTargets.values) {
      tally[t] = (tally[t] ?? 0) + 1;
    }
    final maxV = tally.values.reduce(max);
    return room.vampireTargets.values.firstWhere((t) => tally[t] == maxV);
  }

  String? _checkWin(_Room room) {
    final alive = room.players.where((p) => p.alive).toList();
    final vampires = alive.where((p) => p.role == Role.vampir).length;
    if (vampires == 0) return 'koy';
    if (vampires >= alive.length - vampires) return 'vampir';
    return null;
  }

  void _kill(_Room room, String id) {
    final p = room.players.firstWhere((q) => q.id == id);
    p.alive = false;
    p.diedInRound = room.round;
  }

  void _resolveNight(_Room room) {
    final victim = _vampireVerdict(room);
    final saved = victim != null && room.doctorSave == victim;
    String? died;
    if (victim != null && !saved) {
      died = victim;
      _kill(room, victim);
    }
    if (saved) room.doctorSaves += 1;

    Map<String, dynamic>? gozcuResult;
    final gozcu = room.players.where((p) => p.role == Role.gozcu && p.alive).firstOrNull;
    if (room.gozcuTarget != null && gozcu != null) {
      final target = room.players.firstWhere((p) => p.id == room.gozcuTarget);
      gozcuResult = {'target': target.id, 'vamp': target.role == Role.vampir};
    }
    room.lastNight = {'round': room.round, 'died': died, 'saved': saved, 'gozcuResult': gozcuResult};

    if (died != null) {
      final p = room.players.firstWhere((q) => q.id == died);
      room.announcements.add(_Announcement(
        'dawn',
        'Şafak söktü. ${p.name} bu gece aramızdan alındı.',
        will: p.will,
      ));
    } else if (saved) {
      room.announcements.add(_Announcement('dawn', 'Şafak söktü. Doktor bu gece bir can kurtardı!'));
    } else {
      room.announcements.add(_Announcement('dawn', 'Şafak söktü. Köy sakin bir gece geçirdi.'));
    }

    room.vampireTargets.clear();
    room.doctorSave = null;
    room.gozcuTarget = null;

    final winner = _checkWin(room);
    if (winner != null) {
      room.winner = winner;
      room.phase = Phase.end;
      _settle(room);
    } else {
      room.phase = Phase.dawn;
    }
  }

  void _resolveVote(_Room room) {
    final tally = <String, int>{};
    for (final entry in room.votes.entries) {
      final voter = room.players.firstWhereOrNull((p) => p.id == entry.key);
      if (voter == null || !voter.alive) continue;
      tally[entry.value] = (tally[entry.value] ?? 0) + voter.tier.voteWeight;
    }
    String? lynched;
    var top = 0;
    var tied = false;
    for (final e in tally.entries) {
      if (e.value > top) {
        top = e.value;
        lynched = e.key;
        tied = false;
      } else if (e.value == top) {
        tied = true;
      }
    }
    if (tied || top == 0) lynched = null;

    Role? lynchedRole;
    if (lynched != null) {
      final victim = room.players.firstWhere((p) => p.id == lynched);
      lynchedRole = victim.role;
      _kill(room, lynched);
      if (victim.role == Role.deli) room.deliWon = true;
      room.announcements.add(_Announcement(
        'execution',
        'Köy kararını verdi: ${victim.name} asıldı. Rolü: ${victim.role!.wire.toUpperCase()}.',
        will: victim.will,
      ));
      if (victim.role == Role.deli) {
        room.announcements.add(_Announcement('info', "DELİ ASILDI — potun %10'u onun. Oyun sürüyor!"));
      }
    } else {
      room.announcements.add(_Announcement('execution', 'Oylar dengelendi — bugün kimse asılmadı.'));
    }

    room.lastVote = {'round': room.round, 'lynched': lynched, 'role': lynchedRole?.wire};
    room.votes.clear();
    room.gvotes.clear();
    room.phase = Phase.execution;

    final winner = _checkWin(room);
    if (winner != null) {
      room.winner = winner;
      room.phase = Phase.end;
      _settle(room);
    }
  }

  void _settle(_Room room) {
    final payouts = <_Payout>[];
    var pot = room.potZats;

    if (room.deliWon) {
      final deli = room.players.where((p) => p.role == Role.deli).firstOrNull;
      if (deli != null) {
        final cut = (room.potZats * 0.1).floor();
        payouts.add(_Payout(deli.id, cut, 'deli asıldı'));
        pot -= cut;
      }
    }
    final primCount = min(room.doctorSaves, 2);
    if (primCount > 0) {
      final doktor = room.players.where((p) => p.role == Role.doktor).firstOrNull;
      if (doktor != null) {
        final cut = (room.potZats * 0.05).floor() * primCount;
        payouts.add(_Payout(doktor.id, cut, 'doktor primi'));
        pot -= cut;
      }
    }

    final side = room.winner == 'koy'
        ? room.players.where((p) => p.alive && p.role != Role.vampir).toList()
        : room.players.where((p) => p.role == Role.vampir).toList();
    final totalEntry = side.fold<int>(0, (s, p) => s + p.tier.entryZats);
    for (final p in side) {
      final share = totalEntry == 0 ? 0 : (pot * p.tier.entryZats / totalEntry).floor();
      payouts.add(_Payout(
        p.id,
        share,
        room.winner == 'koy' ? 'köy kazandı' : 'vampirler kazandı',
      ));
    }
    room.payouts = payouts;
  }

  Map<String, dynamic> _statePayload(_Room room, String? token) {
    final base = <String, dynamic>{
      'code': room.code,
      'phase': room.phase.wire,
      'round': room.round,
      'endsAt': room.phaseEndsAt,
      'potZats': room.potZats,
      'height': room.height,
      'players': room.players.map((p) => {'id': p.id, 'name': p.name, 'alive': p.alive}).toList(),
      'voteWeightCast': room.phase == Phase.vote
          ? room.votes.keys.fold<int>(0, (sum, id) {
              final p = room.players.firstWhereOrNull((q) => q.id == id);
              return sum + (p?.tier.voteWeight ?? 0);
            })
          : null,
      'announcements': room.announcements.reversed.take(12).toList().reversed.map((a) => a.toJson()).toList(),
      'winner': room.winner,
      'roomAddress': room.roomAddress,
      'chain': 'mock',
      'sealedCount': room.announcements.length,
    };

    if (room.phase == Phase.end) {
      base['end'] = {
        'payouts': (room.payouts ?? []).map((p) {
          final name = room.players.firstWhereOrNull((q) => q.id == p.playerId)?.name;
          return {'name': name, 'zats': p.zats, 'reason': p.reason};
        }).toList(),
        'ufvk': room.ufvk,
        'reveals': room.players
            .map((p) => {
                  'name': p.name,
                  'tier': p.tier.wireInt,
                  'salt': _id('salt').substring(0, 8),
                  'commit': _id('commit').substring(0, 12),
                  'role': p.role?.wire,
                })
            .toList(),
      };
    }

    if (token != null) {
      final me = _byToken(room, token);
      final aliveOthers = room.players
          .where((p) => p.alive && p.id != me.id)
          .map((p) => {'id': p.id, 'name': p.name})
          .toList();

      final acted = room.phase == Phase.night
          ? (me.role == Role.vampir
              ? room.vampireTargets.containsKey(me.id)
              : me.role == Role.doktor
                  ? room.doctorSave != null
                  : me.role == Role.gozcu
                      ? room.gozcuTarget != null
                      : true)
          : room.phase == Phase.vote
              ? (me.alive ? room.votes.containsKey(me.id) : room.gvotes.containsKey(me.id))
              : true;

      final targets = room.phase == Phase.night && me.alive
          ? (me.role == Role.doktor
              ? [
                  {'id': me.id, 'name': me.name},
                  ...aliveOthers,
                ]
              : aliveOthers)
          : room.phase == Phase.vote
              ? aliveOthers
              : const [];

      Map<String, dynamic>? gozcuResult;
      if (me.role == Role.gozcu && room.lastNight?['gozcuResult'] != null) {
        final gr = room.lastNight!['gozcuResult'] as Map<String, dynamic>;
        final target = room.players.firstWhereOrNull((p) => p.id == gr['target']);
        gozcuResult = {'name': target?.name, 'vamp': gr['vamp']};
      }

      base['me'] = {
        'id': me.id,
        'name': me.name,
        'role': me.role?.wire,
        'alive': me.alive,
        'tier': me.tier.wireInt,
        'will': me.will,
        'acted': acted,
        'targets': targets,
        'gozcuResult': gozcuResult,
      };

      if (!me.alive) {
        base['ghost'] = {
          'memos': room.announcements
              .map((a) => {
                    'txid': 'mock:${a.at}',
                    'memo': {'v': 1, 't': a.kind, 'text': a.text},
                  })
              .toList(),
        };
      }
    }

    return base;
  }

  @override
  Future<RoomState> getState(String code, {required String token}) async {
    final room = _get(code);
    return RoomState.fromJson(_statePayload(room, token));
  }

  @override
  Future<List<Map<String, dynamic>>> revealMemos(String code) async {
    // Mock modda döküm yok — gerçek sunucu (docs/API.md) timeline döndürür.
    return const [];
  }

  @override
  Future<void> sendAction({
    required String code,
    required String token,
    required String type,
    String? target,
    String? txt,
  }) async {
    final room = _get(code);
    final me = _byToken(room, token);
    switch (type) {
      case 'night':
        if (room.phase != Phase.night) throw Exception('bu hamle NIGHT fazında yapılır');
        if (!me.alive) throw Exception('ölüler gece hamlesi yapamaz');
        switch (me.role) {
          case Role.vampir:
            if (target == me.id) throw Exception('vampir kendini yiyemez');
            room.vampireTargets[me.id] = target!;
            break;
          case Role.doktor:
            room.doctorSave = target;
            break;
          case Role.gozcu:
            if (target == me.id) throw Exception('gözcü kendini sorgulayamaz');
            room.gozcuTarget = target;
            break;
          default:
            throw Exception('bu rolün gece hamlesi yok');
        }
        _maybeResolveEarly(room);
        break;
      case 'vote':
        if (room.phase != Phase.vote) throw Exception('bu hamle VOTE fazında yapılır');
        if (!me.alive) throw Exception('ölüler oy atamaz (kehanet hariç)');
        room.votes[me.id] = target!;
        _maybeResolveEarly(room);
        break;
      case 'gvote':
        if (room.phase != Phase.vote) throw Exception('bu hamle VOTE fazında yapılır');
        if (me.alive) throw Exception('kehanet oyu yalnız hayaletlerin');
        room.gvotes[me.id] = target!;
        break;
      case 'will':
        if (!me.alive) throw Exception('ölüler vasiyet güncelleyemez');
        final t = txt ?? '';
        if (t.length > 200) throw Exception('vasiyet en çok 200 karakter');
        me.will = t;
        break;
    }
  }

  void _maybeResolveEarly(_Room room) {
    final alive = room.players.where((p) => p.alive).toList();
    if (room.phase == Phase.night) {
      final vampires = alive.where((p) => p.role == Role.vampir);
      final doctor = alive.where((p) => p.role == Role.doktor).firstOrNull;
      final gozcu = alive.where((p) => p.role == Role.gozcu).firstOrNull;
      final allVamps = vampires.every((v) => room.vampireTargets.containsKey(v.id));
      final doctorDone = doctor == null || room.doctorSave != null;
      final gozcuDone = gozcu == null || room.gozcuTarget != null;
      if (allVamps && doctorDone && gozcuDone) _resolvePhaseNow(room);
    } else if (room.phase == Phase.vote) {
      if (alive.every((p) => room.votes.containsKey(p.id))) _resolvePhaseNow(room);
    }
  }

  void _resolvePhaseNow(_Room room) {
    room.timer?.cancel();
    _resolvePhase(room);
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
  T? firstWhereOrNull(bool Function(T) test) {
    for (final e in this) {
      if (test(e)) return e;
    }
    return null;
  }
}
