enum Role { vampir, koylu, doktor, gozcu, deli }

extension RoleX on Role {
  static Role fromWire(String s) {
    switch (s) {
      case 'vampir':
        return Role.vampir;
      case 'doktor':
        return Role.doktor;
      case 'gozcu':
        return Role.gozcu;
      case 'deli':
        return Role.deli;
      case 'koylu':
      default:
        return Role.koylu;
    }
  }

  String get wire => switch (this) {
        Role.vampir => 'vampir',
        Role.koylu => 'koylu',
        Role.doktor => 'doktor',
        Role.gozcu => 'gozcu',
        Role.deli => 'deli',
      };

  String get label => switch (this) {
        Role.vampir => 'Vampir',
        Role.koylu => 'Köylü',
        Role.doktor => 'Doktor',
        Role.gozcu => 'Gözcü',
        Role.deli => 'Deli',
      };

  String get description => switch (this) {
        Role.vampir => 'Geceleri bir kurbanı seçersin. Kimliğini gizli tut.',
        Role.koylu => 'Gündüz tartış, oyla. Gece köy uyur, sen de uyursun.',
        Role.doktor => 'Her gece bir kişiyi vampirden koruyabilirsin.',
        Role.gozcu => 'Her gece bir kişinin vampir olup olmadığını sorgularsın.',
        Role.deli => 'Gece hamlen yok. Asılırsan tek başına kazanırsın.',
      };

  bool get hasNightAction =>
      this == Role.vampir || this == Role.doktor || this == Role.gozcu;

  bool get isVillageTeam => this != Role.vampir;
}
