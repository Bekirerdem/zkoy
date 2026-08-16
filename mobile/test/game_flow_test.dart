import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:zkoy_app/main.dart';
import 'package:zkoy_app/state/session.dart';

/// Tek cihazda uçtan uca duman testi: isim -> oda kur -> kademe seç ->
/// başlat -> rol animasyonu -> rol kartı -> (bot'lar dolduruyor) ->
/// gece/şafak/gündüz/oy/infaz döngüsü zaman atlamalı sürülür -> oyun
/// sonuna (END) ulaşılır. MockApiClient'ın tüm durum makinesini ve
/// AppRoot'un faz->ekran yönlendirmesini tek seferde doğrular.
void main() {
  testWidgets('tam oyun tek cihazda END fazına ulaşır', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final session = Session();
    await tester.pumpWidget(ZkoyApp(session: session));
    await tester.pump();

    // İsim gir
    await tester.enterText(find.byType(TextField), 'Selin');
    await tester.tap(find.text('Devam Et'));
    await tester.pump();

    // Oda kur
    await tester.tap(find.text('Oda Kur'));
    await tester.pump();

    // Kademe seç (Rençber) ve katıl
    await tester.tap(find.text('Rençber'));
    await tester.pump();
    await tester.ensureVisible(find.text('Köye Katıl'));
    await tester.pump();
    await tester.tap(find.text('Köye Katıl'), warnIfMissed: false);
    await tester.pump(); // async createAndJoin + ilk poll
    await tester.pump();

    expect(find.text('Oyunu Başlat'), findsOneWidget,
        reason: 'lobiye ulaşılmalı ve ev sahibi başlat butonunu görmeli');

    // Oyunu başlat
    await tester.ensureVisible(find.text('Oyunu Başlat'));
    await tester.pump();
    await tester.tap(find.text('Oyunu Başlat'), warnIfMissed: false);
    await tester.pump();
    await tester.pump();

    // Rol dağıtım animasyonu (~3sn) tamamlansın
    await tester.pump(const Duration(seconds: 3, milliseconds: 200));
    await tester.pump();

    // Rol kartını çevir
    expect(find.text('🃏'), findsOneWidget);
    await tester.tap(find.text('🃏'));
    await tester.pump(const Duration(milliseconds: 750));
    await tester.pump();

    await tester.ensureVisible(find.text('Anladım'));
    await tester.pump();
    await tester.tap(find.text('Anladım'), warnIfMissed: false);
    await tester.pump();

    // Artık faz bazlı ekranlardayız. Oyun END fazına ulaşana kadar
    // zamanı küçük adımlarla ileri sar (insan oyuncu hiç tıklamasa da
    // spec'e göre "pas" geçilir, bot'lar oyunu yürütür).
    var reachedEnd = false;
    for (var i = 0; i < 400; i++) {
      await tester.pump(const Duration(seconds: 6));
      final winnerScreen = find.text('Kazandın!');
      final revealScreen = find.text('İfşa Partisi');
      if (winnerScreen.evaluate().isNotEmpty || revealScreen.evaluate().isNotEmpty) {
        reachedEnd = true;
        break;
      }
    }

    expect(reachedEnd, isTrue, reason: 'oyun makul sayıda turda END fazına ulaşmalı');

    // Poll timer'ının iptal edilmesi için widget ağacını temizle.
    await tester.pumpWidget(const SizedBox());
  });
}
