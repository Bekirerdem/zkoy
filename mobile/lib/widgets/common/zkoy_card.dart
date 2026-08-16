import 'package:flutter/material.dart';

class ZkoyCard extends StatelessWidget {
  final Widget child;
  final Color? color;
  final VoidCallback? onTap;
  final bool selected;
  final EdgeInsets padding;

  const ZkoyCard({
    super.key,
    required this.child,
    this.color,
    this.onTap,
    this.selected = false,
    this.padding = const EdgeInsets.all(20),
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: color ?? Theme.of(context).cardTheme.color,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? scheme.primary : Colors.transparent,
              width: 3,
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}
