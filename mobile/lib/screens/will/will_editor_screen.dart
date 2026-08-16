import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/game_provider.dart';
import '../../widgets/common/zkoy_button.dart';

/// Ö1 — vasiyet: oyuncu mühürlü vasiyetini yazar/günceller; ölünce perdeye
/// düşer, sonradan değiştirilemez (yalnız hayattayken güncellenebilir).
class WillEditorScreen extends StatefulWidget {
  const WillEditorScreen({super.key});

  @override
  State<WillEditorScreen> createState() => _WillEditorScreenState();
}

class _WillEditorScreenState extends State<WillEditorScreen> {
  late final TextEditingController _controller;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    final current = context.read<GameProvider>().state?.me?.will ?? '';
    _controller = TextEditingController(text: current);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    await context.read<GameProvider>().sendWill(_controller.text.trim());
    if (!mounted) return;
    setState(() => _saved = true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Vasiyet')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Ölürsen bu metin perdeye düşer. Son kaydedilen geçerlidir.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _controller,
                    maxLines: 5,
                    maxLength: 200,
                    style: const TextStyle(fontSize: 16),
                    decoration: const InputDecoration(
                      hintText: 'Vasiyetini yaz…',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.all(Radius.circular(16)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ZkoyButton(
                    label: _saved ? 'Mühürlendi ✓' : 'Vasiyeti Mühürle',
                    onPressed: _save,
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Kapat'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
