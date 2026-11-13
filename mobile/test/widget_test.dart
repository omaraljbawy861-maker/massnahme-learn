import 'package:flutter_test/flutter_test.dart';
import 'package:massnahme_learn/main.dart';

void main() {
  testWidgets('shows native MAßNAHME LEARN shell', (tester) async {
    await tester.pumpWidget(const MassnahmeApp());
    await tester.pumpAndSettle();
    expect(find.text('MAßNAHME LEARN'), findsOneWidget);
    expect(find.text('كل خطوة تعليم'), findsOneWidget);
  });
}
