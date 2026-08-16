import 'package:flutter_test/flutter_test.dart';

import 'package:zkoy_app/main.dart';
import 'package:zkoy_app/state/session.dart';

void main() {
  testWidgets('Uygulama isim giriş ekranıyla açılır', (WidgetTester tester) async {
    final session = Session();
    await tester.pumpWidget(ZkoyApp(session: session));
    await tester.pump();

    expect(find.text('ZKöy'), findsOneWidget);
    expect(find.text('Devam Et'), findsOneWidget);
  });
}
