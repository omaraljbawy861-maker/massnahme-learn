import 'package:flutter_test/flutter_test.dart';
import 'package:massnahme_learn/main.dart';

void main() {
  testWidgets('shows native MAßNAHME LEARN shell', (tester) async {
    await tester.pumpWidget(const MassnahmeApp());
    // The app contains repeating UI animations, so pump a fixed frame instead
    // of waiting for the entire widget tree to become idle.
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('MAßNAHME LEARN'), findsOneWidget);
    expect(find.text('كل خطوة تعليم'), findsOneWidget);
  });
}
