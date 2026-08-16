/// docs/API.md: tier 1=Rençber, 2=Muhtar, 3=Ağa; oy ağırlığı == tier.
enum Tier { rencber, muhtar, aga }

extension TierX on Tier {
  static Tier fromInt(int n) => switch (n) {
        3 => Tier.aga,
        2 => Tier.muhtar,
        _ => Tier.rencber,
      };

  int get wireInt => switch (this) {
        Tier.rencber => 1,
        Tier.muhtar => 2,
        Tier.aga => 3,
      };

  String get label => switch (this) {
        Tier.rencber => 'Rençber',
        Tier.muhtar => 'Muhtar',
        Tier.aga => 'Ağa',
      };

  /// Giriş tutarı (zatoshi) — engine.ts TIER_ENTRY_ZATS.
  int get entryZats => switch (this) {
        Tier.rencber => 100000,
        Tier.muhtar => 400000,
        Tier.aga => 900000,
      };

  double get entryTaz => entryZats / 100000000;

  int get voteWeight => wireInt;

  String get emoji => switch (this) {
        Tier.rencber => '🌾',
        Tier.muhtar => '🏛️',
        Tier.aga => '👑',
      };
}

String formatZats(int zats) => (zats / 100000000).toStringAsFixed(6);
