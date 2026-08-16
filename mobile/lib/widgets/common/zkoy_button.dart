import 'package:flutter/material.dart';

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

    return SizedBox(
      width: double.infinity,
      height: big ? 76 : 60,
      child: ElevatedButton(
        onPressed: onPressed,
        style: color != null
            ? ElevatedButton.styleFrom(
                backgroundColor: color,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              )
            : null,
        child: child,
      ),
    );
  }
}
