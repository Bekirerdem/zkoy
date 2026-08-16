import 'package:flutter/material.dart';

import '../../models/role.dart';
import '../../utils/constants.dart';
import '../../widgets/common/flip_card.dart';
import '../../widgets/common/zkoy_button.dart';

class RoleRevealScreen extends StatefulWidget {
  final Role? role;
  final VoidCallback onContinue;
  const RoleRevealScreen({super.key, required this.role, required this.onContinue});

  @override
  State<RoleRevealScreen> createState() => _RoleRevealScreenState();
}

class _RoleRevealScreenState extends State<RoleRevealScreen> {
  bool _flipped = false;

  @override
  Widget build(BuildContext context) {
    final role = widget.role;
    if (role == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final color = roleColor(role);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Rolün', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 24),
                FlipCard(
                  onFlipped: (v) => setState(() => _flipped = v),
                  front: _cardFace(
                    context,
                    color: Colors.grey.shade800,
                    child: const Text('🃏', style: TextStyle(fontSize: 72)),
                  ),
                  back: _cardFace(
                    context,
                    color: color,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(roleEmoji(role), style: const TextStyle(fontSize: 72)),
                        const SizedBox(height: 12),
                        Text(
                          role.label,
                          style: Theme.of(context)
                              .textTheme
                              .displayLarge
                              ?.copyWith(color: Colors.white, fontSize: 30),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                if (!_flipped)
                  Text('Çevirmek için karta dokun',
                      style: Theme.of(context).textTheme.bodyLarge)
                else ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      role.description,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Kimseye söyleme.',
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(fontStyle: FontStyle.italic),
                  ),
                  const SizedBox(height: 28),
                  ZkoyButton(label: 'Anladım', big: true, onPressed: widget.onContinue),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _cardFace(BuildContext context, {required Color color, required Widget child}) {
    return Container(
      width: 240,
      height: 320,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.4),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: child,
    );
  }
}
