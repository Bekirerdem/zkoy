import 'package:flutter/material.dart';

import 'tap_burst.dart';

class ZkoyButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final Color? color;
  final IconData? icon;
  final bool big;

  const ZkoyButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.color,
    this.icon,
    this.big = false,
  });

  @override
  Widget build(BuildContext context) {
    final bg = color ?? Theme.of(context).colorScheme.primary;
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[
          Icon(icon, size: big ? 28 : 22),
          const SizedBox(width: 10),
        ],
        Text(label, style: TextStyle(fontSize: big ? 22 : 18)),
      ],
    );

    return TapBurst(
      enabled: onPressed != null,
      color: Colors.white,
      child: SizedBox(
        width: double.infinity,
        height: big ? 76 : 60,
        child: ElevatedButton(
          onPressed: onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: bg,
            foregroundColor: Colors.white,
            elevation: onPressed == null ? 0 : 6,
            shadowColor: bg.withValues(alpha: 0.5),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}
