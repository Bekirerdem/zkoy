import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:zkoy_app/screens/end/reveal_party_screen.dart';
import 'package:zkoy_app/services/mock_api_client.dart';
import 'package:zkoy_app/state/game_provider.dart';
import 'package:zkoy_app/state/session.dart';

/// The reveal party is reached with Navigator.push from the winner screen, so
/// it sits above AppRoot and is not covered by AppRoot's null-state guard. Its
/// own "Yeni Oyun" button clears the room, which notifies the provider and
/// rebuilds this screen with no state — one frame before AppRoot pops the
/// route. That rebuild used to throw and flash Flutter's red error screen.
void main() {
  testWidgets('ifşa partisi oda temizlendiğinde çökmeden çizilir',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final session = Session();
    final provider = GameProvider(api: MockApiClient(), session: session);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<Session>.value(value: session),
          ChangeNotifierProvider<GameProvider>.value(value: provider),
        ],
        child: const MaterialApp(home: RevealPartyScreen()),
      ),
    );
    await tester.pump();

    expect(
      tester.takeException(),
      isNull,
      reason: 'state null iken ifşa partisi istisna atmamalı',
    );

    // Leaving the room is what nulls the state in the real flow; a rebuild
    // triggered that way must stay quiet too.
    await provider.leaveRoom();
    await tester.pump();

    expect(
      tester.takeException(),
      isNull,
      reason: 'leaveRoom sonrası yeniden çizim istisna atmamalı',
    );

    await tester.pumpWidget(const SizedBox());
  });
}
