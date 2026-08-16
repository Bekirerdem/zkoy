/// Spec §3 memo protokolündeki tip etiketleri (JSON ≤512B).
class Memo {
  final String type; // join|role|night|seerr|vote|gvote|will|result|spoiler|reveal|prize
  final Map<String, dynamic> data;
  final int blockHeight; // Ö5 blok saat kulesi (kozmetik)
  final DateTime at;
  final String? txid;

  const Memo({
    required this.type,
    required this.data,
    required this.blockHeight,
    required this.at,
    this.txid,
  });

  factory Memo.fromJson(Map<String, dynamic> json) {
    return Memo(
      type: json['t'] as String,
      data: json,
      blockHeight: json['blockHeight'] as int? ?? 0,
      at: json['at'] != null
          ? DateTime.parse(json['at'] as String)
          : DateTime.now(),
      txid: json['txid'] as String?,
    );
  }

  String get label => switch (type) {
        'join' => '${data['name']} köye katıldı',
        'role' => 'Rol dağıtıldı',
        'night' => 'Gece hamlesi mühürlendi',
        'seerr' => 'Gözcü sorgusu çözüldü',
        'vote' => 'Oy mühürlendi (ağırlık ${data['w'] ?? '?'})',
        'gvote' => 'Hayalet kehaneti atıldı',
        'will' => 'Vasiyet güncellendi',
        'result' => 'Gece sonucu ilan edildi',
        'spoiler' => 'Ölüm anı — rol perdeye düştü',
        'reveal' => 'Kademe ifşa edildi: ${data['tier'] ?? '?'}',
        'prize' => 'Ödül gönderildi: ${data['zat'] ?? '?'} zat',
        _ => type,
      };
}
