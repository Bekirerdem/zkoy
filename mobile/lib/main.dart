import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'services/api_config.dart';
import 'state/game_provider.dart';
import 'state/session.dart';
import 'theme/app_theme.dart';
import 'widgets/app_root.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session();
  await session.load();
  runApp(ZkoyApp(session: session));
}

class ZkoyApp extends StatelessWidget {
  final Session session;
  const ZkoyApp({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<Session>.value(value: session),
        ChangeNotifierProvider<GameProvider>(
          create: (_) {
            final gp = GameProvider(api: ApiConfig.client, session: session);
            if (session.hasRoom) gp.startPolling();
            return gp;
          },
        ),
      ],
      child: MaterialApp(
        title: 'ZKöy',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.light,
        home: const AppRoot(),
      ),
    );
  }
}
