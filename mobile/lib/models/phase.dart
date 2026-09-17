/// Game phases. Engine: `src/engine/types.ts` `Phase`.
///
/// The v2 cycle is LOBBY → ELECTION → NIGHT → DAWN → DAY → EXECUTION → … → END.
/// The day now carries three sub-stages of its own (see `day_stage.dart`), so
/// there is no separate voting phase.
enum Phase {
  lobby,
  election,
  night,
  dawn,
  day,
  execution,
  end,

  /// Left over from v1 — the engine has no such phase any more. It only exists
  /// so the old `vote_screen` still compiles.
  @Deprecated('v1 phase; the v2 day resolves a verdict via DayStage.verdict')
  vote,
}

extension PhaseX on Phase {
  static Phase fromWire(String s) {
    switch (s) {
      case 'ELECTION':
        return Phase.election;
      case 'NIGHT':
        return Phase.night;
      case 'DAWN':
        return Phase.dawn;
      case 'DAY':
        return Phase.day;
      case 'EXECUTION':
        return Phase.execution;
      case 'END':
        return Phase.end;
      case 'VOTE':
        // An old server may still be running; in v2 this maps onto the day.
        // ignore: deprecated_member_use_from_same_package
        return Phase.vote;
      case 'LOBBY':
      default:
        return Phase.lobby;
    }
  }

  String get wire => switch (this) {
        Phase.lobby => 'LOBBY',
        Phase.election => 'ELECTION',
        Phase.night => 'NIGHT',
        Phase.dawn => 'DAWN',
        Phase.day => 'DAY',
        Phase.execution => 'EXECUTION',
        Phase.end => 'END',
        // ignore: deprecated_member_use_from_same_package
        Phase.vote => 'VOTE',
      };

  /// Hard-coded display name, kept for the screens that predate localization.
  ///
  // TODO(v3): Delete this getter once every caller reads the phase name from
  // l10n (phaseLobby, phaseElection, phaseNight, …).
  String get label => switch (this) {
        Phase.lobby => 'Lobi',
        Phase.election => 'Seçim',
        Phase.night => 'Gece',
        Phase.dawn => 'Şafak',
        Phase.day => 'Gündüz',
        Phase.execution => 'İnfaz',
        Phase.end => 'Oyun Sonu',
        // ignore: deprecated_member_use_from_same_package
        Phase.vote => 'Oylama',
      };

  /// Whether the phase uses the dark theme. Night and dawn are dark; the
  /// election and the day both happen in the square.
  bool get isDark => this == Phase.night || this == Phase.dawn;
}
