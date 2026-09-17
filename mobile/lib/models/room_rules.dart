/// Rules the host picks while creating a room.
///
/// All three are switches on the room creation screen. `screen` is purely a
/// client concern; `watcher` and `accusedVotes` are passed to the engine as
/// flags.
class RoomRules {
  /// Whether a projector is in use. Off by default so a group without one can
  /// still play. When off the square opens directly on each phone; when on the
  /// phone starts as a remote control instead.
  final bool screen;

  /// Whether the Watcher role is dealt. On by default with 13+ players, off at
  /// 12 or fewer where the role is too strong. The host can override.
  final bool watcher;

  /// Whether the accused may vote in their own trial. Off by default: in a
  /// playtest a headman on trial kept saving themselves with a double vote.
  /// While off, the majority threshold is computed excluding the accused.
  final bool accusedVotes;

  const RoomRules({
    this.screen = false,
    this.watcher = true,
    this.accusedVotes = false,
  });

  /// Defaults derived from the table size. The Watcher threshold is 13.
  factory RoomRules.defaultsFor(int playerCount) =>
      RoomRules(watcher: playerCount >= 13);

  RoomRules copyWith({bool? screen, bool? watcher, bool? accusedVotes}) =>
      RoomRules(
        screen: screen ?? this.screen,
        watcher: watcher ?? this.watcher,
        accusedVotes: accusedVotes ?? this.accusedVotes,
      );

  /// Wire keys are fixed by the server's `rooms.rules` JSON column and stay
  /// Turkish there.
  factory RoomRules.fromJson(Map<String, dynamic> j) => RoomRules(
        screen: j['perde'] as bool? ?? false,
        watcher: j['gozcu'] as bool? ?? true,
        accusedVotes: j['accusedVotes'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'perde': screen,
        'gozcu': watcher,
        'accusedVotes': accusedVotes,
      };
}
