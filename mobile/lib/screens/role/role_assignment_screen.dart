import 'package:flutter/material.dart';

import '../../widgets/common/counting_animation.dart';

class RoleAssignmentScreen extends StatelessWidget {
  final VoidCallback onDone;
  const RoleAssignmentScreen({super.key, required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(child: CountingAnimation(onDone: onDone)),
    );
  }
}
