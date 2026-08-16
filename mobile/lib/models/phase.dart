enum Phase { lobby, night, dawn, day, vote, execution, end }

extension PhaseX on Phase {
  static Phase fromWire(String s) {
    switch (s) {
      case 'NIGHT':
        return Phase.night;
      case 'DAWN':
        return Phase.dawn;
      case 'DAY':
        return Phase.day;
      case 'VOTE':
        return Phase.vote;
      case 'EXECUTION':
        return Phase.execution;
      case 'END':
        return Phase.end;
      case 'LOBBY':
      default:
        return Phase.lobby;
    }
  }

  String get wire => switch (this) {
        Phase.lobby => 'LOBBY',
        Phase.night => 'NIGHT',
        Phase.dawn => 'DAWN',
        Phase.day => 'DAY',
        Phase.vote => 'VOTE',
        Phase.execution => 'EXECUTION',
        Phase.end => 'END',
      };

  String get label => switch (this) {
        Phase.lobby => 'Lobi',
        Phase.night => 'Gece',
        Phase.dawn => 'Şafak',
        Phase.day => 'Gündüz',
        Phase.vote => 'Oylama',
        Phase.execution => 'İnfaz',
        Phase.end => 'Oyun Sonu',
      };

  /// Karanlık tema mı? (spec: gece/şafak koyu, gündüz/oy/infaz açık)
  bool get isDark => this == Phase.night || this == Phase.dawn;
}
