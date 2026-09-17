/// Badges sealed on chain when a game ends. Engine: `src/engine/types.ts`
/// `BadgeKind` / `Badge`.
///
/// Badges live on chain and are permanent; points live on the server and are
/// only cosmetic. Keep the two apart — a player's title is derived from the
/// badge count, never from points.
///
/// The wire tokens stay Turkish because the engine emits them that way.
enum BadgeKind { winner, fool, oracle, headman }

extension BadgeKindX on BadgeKind {
  static BadgeKind? fromWire(String s) => switch (s) {
        'kazanan' => BadgeKind.winner,
        'deli' => BadgeKind.fool,
        'kahin' => BadgeKind.oracle,
        'muhtar' => BadgeKind.headman,
        _ => null,
      };

  String get wire => switch (this) {
        BadgeKind.winner => 'kazanan',
        BadgeKind.fool => 'deli',
        BadgeKind.oracle => 'kahin',
        BadgeKind.headman => 'muhtar',
      };

  String get emoji => switch (this) {
        BadgeKind.winner => '🏆',
        BadgeKind.fool => '🤪',
        BadgeKind.oracle => '🔮',
        BadgeKind.headman => '🏛️',
      };
}

class Badge {
  final String playerId;
  final BadgeKind kind;

  /// Event rooms stamp the city name here, which is what the inter-city
  /// leaderboard is built from. Empty in a normal room.
  final String? label;

  const Badge({required this.playerId, required this.kind, this.label});

  factory Badge.fromJson(Map<String, dynamic> j) => Badge(
        playerId: j['playerId'] as String,
        kind: BadgeKindX.fromWire(j['kind'] as String) ?? BadgeKind.winner,
        label: j['label'] as String?,
      );
}
