import 'package:flutter/material.dart';

import '../../models/room_state.dart';
import 'zkoy_card.dart';

/// Gece hedefi / oylama için isim seçim ızgarası (Kahoot benzeri kart
/// grid'i). Sunucunun `me.targets` listesinden beslenir — kim seçilebilir
/// kuralı istemcide tekrarlanmaz.
class PlayerNameGrid extends StatelessWidget {
  final List<Target> targets;
  final String? selectedId;
  final ValueChanged<String> onSelect;
  final bool disabled;

  const PlayerNameGrid({
    super.key,
    required this.targets,
    required this.onSelect,
    this.selectedId,
    this.disabled = false,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: targets.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 2.4,
      ),
      itemBuilder: (context, i) {
        final t = targets[i];
        final selected = t.id == selectedId;
        return ZkoyCard(
          selected: selected,
          onTap: disabled ? null : () => onSelect(t.id),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Center(
            child: Text(
              t.name,
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        );
      },
    );
  }
}
