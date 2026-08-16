import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/phase.dart';
import '../models/role.dart';
import '../state/game_provider.dart';
import '../state/session.dart';
import '../theme/app_theme.dart';
import '../screens/entry/name_entry_screen.dart';
import '../screens/lobby/create_join_screen.dart';
import '../screens/lobby/room_waiting_screen.dart';
import '../screens/role/role_assignment_screen.dart';
import '../screens/role/role_reveal_screen.dart';
import '../screens/night/night_action_screen.dart';
import '../screens/dawn/dawn_result_screen.dart';
import '../screens/day/day_discussion_screen.dart';
import '../screens/vote/vote_screen.dart';
import '../screens/execution/execution_screen.dart';
import '../screens/ghost/ghost_screen.dart';
import '../screens/end/reveal_party_screen.dart';
import '../screens/end/winner_screen.dart';

/// Tek gerçeklik: oda durumuna göre gösterilecek ekranı seçen merkezi router.
/// Faz geçişleri sunucudan (poll) geldiği için manuel navigasyon gerekmez.
class AppRoot extends StatefulWidget {
  const AppRoot({super.key});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  String? _introForCode;
  bool _roleAssignSeen = false;
  bool _roleCardSeen = false;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final gp = context.watch<GameProvider>();

    if (session.name == null || session.name!.trim().isEmpty) {
      return const NameEntryScreen();
    }

    if (!session.hasRoom) {
      return const CreateJoinScreen();
    }

    final state = gp.state;
    if (state == null) {
      return _themed(
        isDark: false,
        child: const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (_introForCode != session.code) {
      _introForCode = session.code;
      _roleAssignSeen = false;
      _roleCardSeen = false;
    }

    if (state.phase == Phase.lobby) {
      return _themed(isDark: false, child: const RoomWaitingScreen());
    }

    if (!_roleAssignSeen) {
      return _themed(
        isDark: true,
        child: RoleAssignmentScreen(
          onDone: () => setState(() => _roleAssignSeen = true),
        ),
      );
    }
    if (!_roleCardSeen) {
      return _themed(
        isDark: true,
        child: RoleRevealScreen(
          role: state.me?.role,
          onContinue: () => setState(() => _roleCardSeen = true),
        ),
      );
    }

    if (state.phase == Phase.end) {
      final alive = state.me?.alive ?? false;
      final myRole = state.me?.role;
      final iWon = alive &&
          ((state.winner == 'koy' && myRole != Role.vampir) ||
              (state.winner == 'vampir' && myRole == Role.vampir));
      return _themed(
        isDark: false,
        child: iWon ? const WinnerScreen() : const RevealPartyScreen(),
      );
    }

    if (!(state.me?.alive ?? true)) {
      return _themed(isDark: state.phase.isDark, child: const GhostScreen());
    }

    final screen = switch (state.phase) {
      Phase.night => const NightActionScreen(),
      Phase.dawn => const DawnResultScreen(),
      Phase.day => const DayDiscussionScreen(),
      Phase.vote => const VoteScreen(),
      Phase.execution => const ExecutionScreen(),
      _ => const SizedBox.shrink(),
    };

    return _themed(isDark: state.phase.isDark, child: screen);
  }

  Widget _themed({required bool isDark, required Widget child}) {
    return AnimatedTheme(
      data: isDark ? AppTheme.dark : AppTheme.light,
      duration: const Duration(milliseconds: 500),
      child: child,
    );
  }
}
