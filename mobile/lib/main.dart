import 'dart:convert';
// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const supabaseUrl = 'https://edzuhinhxhoxxocfjvbu.supabase.co';
const supabasePublishableKey = 'sb_publishable_PVmHT2QwKiWtWYEgb-nYkw_dd2VtQiO';
bool get supabaseReady => supabasePublishableKey.isNotEmpty;
bool get supabaseInitialized { try { Supabase.instance.client; return true; } catch (_) { return false; } }
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try { if (supabaseReady) await Supabase.initialize(url: supabaseUrl, publishableKey: supabasePublishableKey); } catch (_) {}
  runApp(const MassnahmeApp());
}
const navy = Color(0xFF0B1424), panel = Color(0xFF142238), gold = Color(0xFFD6B36A), muted = Color(0xFF9BAAC0);

class MassnahmeApp extends StatelessWidget {
  const MassnahmeApp({super.key});
  @override Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner:false, title:'MAßNAHME LEARN',
    theme:ThemeData(brightness:Brightness.dark,scaffoldBackgroundColor:navy,colorScheme:ColorScheme.fromSeed(seedColor:gold,brightness:Brightness.dark),useMaterial3:true),
    home:const Directionality(textDirection:TextDirection.rtl,child:AuthGate()));
}
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});
  @override Widget build(BuildContext context) {
    if(!supabaseReady || !supabaseInitialized)return const MainShell();
    return StreamBuilder<AuthState>(stream:Supabase.instance.client.auth.onAuthStateChange,builder:(context,snapshot)=>
      Supabase.instance.client.auth.currentUser==null?const LoginScreen():const MainShell());
  }
}
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override State<LoginScreen> createState()=>_LoginScreenState();
}
class _LoginScreenState extends State<LoginScreen> {
  final email=TextEditingController(),password=TextEditingController();
  bool signup=false,busy=false; String? error;
  Future<void> submit() async {
    setState((){busy=true;error=null;});
    try {
      if(signup) {
        final r=await Supabase.instance.client.auth.signUp(email:email.text.trim(),password:password.text);
        if(r.session==null&&mounted)setState(()=>error='تم إنشاء الحساب إن كان البريد جديداً. افتح رسالة التأكيد ثم سجّل الدخول.');
      } else { await Supabase.instance.client.auth.signInWithPassword(email:email.text.trim(),password:password.text); }
    } on AuthException catch(e){if(mounted)setState(()=>error=e.message);}
      catch(_){if(mounted)setState(()=>error='تعذر الاتصال. تحقق من الإنترنت ثم حاول مجدداً.');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override void dispose(){email.dispose();password.dispose();super.dispose();}
  @override Widget build(BuildContext context)=>Scaffold(body:SafeArea(child:Center(child:SingleChildScrollView(padding:const EdgeInsets.all(24),child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:440),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    const BrandHeader(),const SizedBox(height:38),Text(signup?'إنشاء حساب طالب':'مرحباً بعودتك',style:const TextStyle(fontSize:28,fontWeight:FontWeight.bold)),
    const SizedBox(height:10),const Text('سجّل الدخول لتتابع دراستك وتزامن تقدّمك.',style:TextStyle(color:muted)),
    const SizedBox(height:24),TextField(controller:email,keyboardType:TextInputType.emailAddress,decoration:const InputDecoration(labelText:'البريد الإلكتروني',prefixIcon:Icon(Icons.email_outlined))),
    const SizedBox(height:12),TextField(controller:password,obscureText:true,decoration:const InputDecoration(labelText:'كلمة المرور',prefixIcon:Icon(Icons.lock_outline))),
    if(error!=null)Padding(padding:const EdgeInsets.only(top:12),child:Text(error!,style:const TextStyle(color:Colors.orangeAccent))),
    const SizedBox(height:18),FilledButton(onPressed:busy?null:submit,style:FilledButton.styleFrom(backgroundColor:gold,foregroundColor:navy,padding:const EdgeInsets.all(16)),child:Text(busy?'جارٍ التنفيذ…':signup?'إنشاء الحساب':'تسجيل الدخول')),
    TextButton(onPressed:()=>setState(()=>signup=!signup),child:Text(signup?'لديك حساب؟ سجّل الدخول':'إنشاء حساب جديد'))
  ]))))));
}
class BrandHeader extends StatelessWidget {
  const BrandHeader({super.key});
  @override Widget build(BuildContext context)=>Row(children:[
    Container(width:54,height:54,decoration:BoxDecoration(color:gold,borderRadius:BorderRadius.circular(16)),child:const Center(child:Text('M',style:TextStyle(color:navy,fontWeight:FontWeight.w900,fontSize:30)))),
    const SizedBox(width:12),const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text('MAßNAHME LEARN',style:TextStyle(fontWeight:FontWeight.w900,fontSize:18)),
      Text('BILDUNG FÜR ALLE • التعليم للجميع',style:TextStyle(color:gold,fontSize:10))
    ])
  ]);
}
class MainShell extends StatefulWidget { const MainShell({super.key}); @override State<MainShell> createState()=>_MainShellState(); }
class _MainShellState extends State<MainShell> {
  int index=0;
  late final pages=[DashboardPage(onNavigate:(v)=>setState(()=>index=v)),const SubjectsPage(),const ZfaPage(),const AssistantPage(),const ProfilePage()];
  final labels=const['الرئيسية','المواد','أكاديمية ZFA','المساعد','حسابي'];
  final icons=const[Icons.home_rounded,Icons.menu_book_rounded,Icons.medical_services_rounded,Icons.auto_awesome,Icons.person_rounded];
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const BrandHeader(),toolbarHeight:72),
    body:IndexedStack(index:index,children:pages),
    bottomNavigationBar:NavigationBar(selectedIndex:index,onDestinationSelected:(v)=>setState(()=>index=v),backgroundColor:panel,indicatorColor:gold.withValues(alpha:.18),
      destinations:List.generate(labels.length,(i)=>NavigationDestination(icon:Icon(icons[i]),label:labels[i]))));
}
class DashboardPage extends StatelessWidget {
  final ValueChanged<int> onNavigate;
  const DashboardPage({super.key,required this.onNavigate});
  @override Widget build(BuildContext context)=>ListView(padding:const EdgeInsets.all(18),children:[
    Container(padding:const EdgeInsets.all(22),decoration:BoxDecoration(gradient:const LinearGradient(colors:[Color(0xFF1B3150),panel]),borderRadius:BorderRadius.circular(24),border:Border.all(color:gold.withValues(alpha:.3))),child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text('مساحة تعلّمك الخاصة',style:TextStyle(color:gold,fontWeight:FontWeight.bold)),SizedBox(height:10),
      Text('كل خطوة تعليم',style:TextStyle(fontSize:29,fontWeight:FontWeight.w900)),SizedBox(height:8),
      Text('تابع دروسك، اختبر معلوماتك، وارجع لتقدّمك من أي جهاز.',style:TextStyle(color:muted,height:1.6))
    ])),
    const SizedBox(height:22),const Text('ابدأ التعلّم',style:TextStyle(fontSize:21,fontWeight:FontWeight.bold)),const SizedBox(height:10),
    _Feature(icon:Icons.menu_book,title:'المناهج المدرسية',subtitle:'مواد الصف التاسع والدروس والتمارين',onTap:()=>onNavigate(1)),
    _Feature(icon:Icons.medical_services,title:'أكاديمية مساعد طبيب الأسنان',subtitle:'13 مجالاً وفق إطار ZFA الألماني',onTap:()=>onNavigate(2)),
    _Feature(icon:Icons.auto_awesome,title:'المساعد الدراسي الذكي',subtitle:'اسأل عن الدروس واحصل على شرح',onTap:()=>onNavigate(3))
  ]);
}
class _Feature extends StatelessWidget {
  final IconData icon;final String title,subtitle;final VoidCallback onTap;
  const _Feature({required this.icon,required this.title,required this.subtitle,required this.onTap});
  @override Widget build(BuildContext context)=>Card(color:panel,child:ListTile(contentPadding:const EdgeInsets.all(14),leading:CircleAvatar(backgroundColor:gold.withValues(alpha:.15),child:Icon(icon,color:gold)),title:Text(title,style:const TextStyle(fontWeight:FontWeight.bold)),subtitle:Text(subtitle,style:const TextStyle(color:muted)),trailing:const Icon(Icons.chevron_left,color:gold),onTap:onTap));
}
class Course {
  final String name,german,icon,description;final List<dynamic> lessons;
  Course(Map<String,dynamic> j):name='${j['name']??j['title']??'مادة'}',german='${j['german']??''}',icon='${j['icon']??'📘'}',description='${j['description']??''}',lessons=List<dynamic>.from(j['lessons']??[]);
}
class CourseRepository {
  static Future<List<Course>> load() async {
    final manifest=await AssetManifest.loadFromAssetBundle(rootBundle);
    final paths=manifest.listAssets().where((p)=>p.startsWith('assets/courses/')&&p.endsWith('.json')&&!p.contains('zfa_')).toList()..sort();
    final result=<Course>[];
    for(final path in paths){try{final d=jsonDecode(await rootBundle.loadString(path));if(d is Map<String,dynamic>&&d['lessons'] is List)result.add(Course(d));}catch(_){}}
    return result;
  }
}
class SubjectsPage extends StatelessWidget {
  const SubjectsPage({super.key});
  @override Widget build(BuildContext context)=>FutureBuilder<List<Course>>(future:CourseRepository.load(),builder:(context,s){
    if(!s.hasData)return const Center(child:CircularProgressIndicator(color:gold));
    return ListView(padding:const EdgeInsets.all(18),children:[
      const Text('المواد الدراسية',style:TextStyle(fontSize:24,fontWeight:FontWeight.bold)),const SizedBox(height:6),
      const Text('الدروس مضمّنة داخل التطبيق ويمكن فتحها دون اتصال.',style:TextStyle(color:muted)),const SizedBox(height:14),
      ...s.data!.map((c)=>Card(color:panel,child:ListTile(
        leading:CircleAvatar(backgroundColor:gold.withValues(alpha:.15),child:Text(c.icon,style:const TextStyle(color:gold))),
        title:Text(c.name,style:const TextStyle(fontWeight:FontWeight.bold)),subtitle:Text('${c.german} • ${c.lessons.length} درس',style:const TextStyle(color:muted)),
        trailing:const Icon(Icons.chevron_left,color:gold),onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>CourseDetailPage(course:c)))))),
    ]);
  });
}
class CourseDetailPage extends StatelessWidget {
  final Course course;const CourseDetailPage({super.key,required this.course});
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(course.name)),body:ListView(padding:const EdgeInsets.all(16),children:[
    Text(course.description,style:const TextStyle(color:muted)),
    ...course.lessons.asMap().entries.map((e){final l=Map<String,dynamic>.from(e.value as Map);return Card(color:panel,child:ListTile(
      leading:CircleAvatar(backgroundColor:gold.withValues(alpha:.15),child:Text('${e.key+1}',style:const TextStyle(color:gold))),
      title:Text('${l['title']??l['germanTitle']??'درس'}'),subtitle:Text('${l['germanTitle']??''} • ${l['duration']??''}',style:const TextStyle(color:muted)),
      trailing:const Icon(Icons.chevron_left,color:gold),onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>LessonPage(lesson:l)))));})
  ]));
}
class LessonPage extends StatelessWidget {
  final Map<String,dynamic> lesson;const LessonPage({super.key,required this.lesson});
  @override Widget build(BuildContext context){
    final vocab=lesson['vocab'] as List? ?? [];
    return Scaffold(appBar:AppBar(title:Text('${lesson['title']??'الدرس'}')),body:ListView(padding:const EdgeInsets.all(18),children:[
      Text('${lesson['germanTitle']??''}',style:const TextStyle(fontSize:22,color:gold,fontWeight:FontWeight.bold)),
      _LessonSection(title:'أهداف التعلّم',body:(lesson['objectives'] as List? ?? []).join('\\n')),
      _LessonSection(title:'شرح باللغة الألمانية',body:'${lesson['german']??''}'),
      _LessonSection(title:'الشرح بالعربية',body:'${lesson['explanation']??lesson['lessonText']??''}'),
      if(vocab.isNotEmpty)_LessonSection(title:'المفردات',body:vocab.map((v)=>'${v[0]} — ${v[1]}').join('\\n')),
      if(lesson['example']!=null)_LessonSection(title:'مثال تطبيقي',body:'${lesson['example']}'),
      if(lesson['practice'] is List)_LessonSection(title:'تدريبات',body:(lesson['practice'] as List).map((v)=>'• ${v['q']}').join('\\n')),
      if(lesson['homework'] is List)_LessonSection(title:'واجب منزلي',body:(lesson['homework'] as List).map((v)=>'• ${v['q']}').join('\\n'))
    ]));
  }
}
class _LessonSection extends StatelessWidget {
  final String title,body;const _LessonSection({required this.title,required this.body});
  @override Widget build(BuildContext context)=>Card(color:panel,margin:const EdgeInsets.only(bottom:12),child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(title,style:const TextStyle(color:gold,fontSize:17,fontWeight:FontWeight.bold)),const SizedBox(height:9),Text(body,style:const TextStyle(height:1.65))])));
}
class ZfaPage extends StatefulWidget {const ZfaPage({super.key});@override State<ZfaPage> createState()=>_ZfaPageState();}
class _ZfaPageState extends State<ZfaPage> {
  late final future=rootBundle.loadString('assets/courses/zfa_official_curriculum.json').then((s)=>jsonDecode(s) as Map<String,dynamic>);
  @override Widget build(BuildContext context)=>FutureBuilder<Map<String,dynamic>>(future:future,builder:(context,s){
    if(!s.hasData)return const Center(child:CircularProgressIndicator(color:gold));
    final meta=Map<String,dynamic>.from(s.data!['meta']);final fields=List<Map<String,dynamic>>.from((s.data!['fields'] as List).map((e)=>Map<String,dynamic>.from(e)));
    return ListView(padding:const EdgeInsets.all(18),children:[
      const Text('أكاديمية ZFA',style:TextStyle(fontSize:25,fontWeight:FontWeight.bold)),
      Text('${meta['title']}\\n${meta['decision']} • ${meta['regulation']}',style:const TextStyle(color:muted,height:1.6)),
      Card(color:panel,child:Padding(padding:const EdgeInsets.all(16),child:Text('13 مجالاً تعليمياً • ${meta['totalHours']} ساعة تدريبية',style:const TextStyle(color:gold,fontWeight:FontWeight.bold)))),
      ...fields.map((f)=>Card(color:panel,child:ListTile(
        leading:CircleAvatar(backgroundColor:gold.withValues(alpha:.15),child:Text('${f['n']}',style:const TextStyle(color:gold))),
        title:Text('${f['title']}',style:const TextStyle(fontWeight:FontWeight.bold)),
        subtitle:Text('${f['ar']}\\n${f['hours']} ساعة • السنة ${f['year']}',style:const TextStyle(color:muted,height:1.5)),isThreeLine:true,
        onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>ZfaFieldPage(field:f)))))),
    ]);
  });
}
class ZfaFieldPage extends StatelessWidget {
  final Map<String,dynamic> field;const ZfaFieldPage({super.key,required this.field});
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text('Lernfeld ${field['n']}')),body:ListView(padding:const EdgeInsets.all(18),children:[
    Text('${field['title']}',style:const TextStyle(fontSize:22,fontWeight:FontWeight.bold,color:gold)),Text('${field['ar']}',style:const TextStyle(color:muted)),
    _LessonSection(title:'الكفاءة المهنية',body:'${field['competence']}'),
    _LessonSection(title:'الموضوعات',body:(field['topics'] as List? ?? []).map((x)=>'• $x').join('\\n')),
    _LessonSection(title:'مهام تطبيقية',body:(field['tasks'] as List? ?? []).map((x)=>'• $x').join('\\n')),
    _LessonSection(title:'التقييم',body:'${field['assessment']}')
  ]));
}
class AssistantPage extends StatefulWidget {const AssistantPage({super.key});@override State<AssistantPage> createState()=>_AssistantPageState();}
class _AssistantPageState extends State<AssistantPage> {
  final input=TextEditingController();final messages=<Map<String,String>>[];bool busy=false;
  Future<void> send() async {
    final q=input.text.trim();if(q.isEmpty||busy)return;
    setState((){messages.add({'role':'user','content':q});input.clear();busy=true;});
    try{
      final r=await Supabase.instance.client.functions.invoke('free-chat',body:{'messages':messages.map((m)=>{'role':m['role'],'content':m['content']}).toList(),'personaGender':'female','preferredLanguage':'ar'});
      final reply=r.data is Map?r.data['reply']?.toString():null;
      if(reply==null||reply.isEmpty)throw Exception();
      if(mounted)setState(()=>messages.add({'role':'assistant','content':reply}));
    }catch(_){if(mounted)setState(()=>messages.add({'role':'assistant','content':'تعذر الحصول على رد حالياً. تحقق من الاتصال وتسجيل الدخول ثم حاول مجدداً.'}));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override void dispose(){input.dispose();super.dispose();}
  @override Widget build(BuildContext context)=>Column(children:[
    const Padding(padding:EdgeInsets.all(16),child:Column(children:[Text('المساعد الدراسي الذكي',style:TextStyle(fontSize:23,fontWeight:FontWeight.bold)),Text('اسأل عن أي درس أو مصطلح دراسي',style:TextStyle(color:muted))])),
    Expanded(child:messages.isEmpty?const Center(child:Column(mainAxisSize:MainAxisSize.min,children:[Icon(Icons.auto_awesome,color:gold,size:42),SizedBox(height:10),Text('كيف أستطيع مساعدتك اليوم؟',style:TextStyle(color:muted))])):ListView(padding:const EdgeInsets.all(14),children:messages.map((m)=>Align(alignment:m['role']=='user'?Alignment.centerLeft:Alignment.centerRight,child:Container(margin:const EdgeInsets.only(bottom:10),padding:const EdgeInsets.all(14),constraints:const BoxConstraints(maxWidth:330),decoration:BoxDecoration(color:m['role']=='user'?const Color(0xFF203754):panel,borderRadius:BorderRadius.circular(18)),child:Text(m['content']!)))).toList())),
    if(busy)const Padding(padding:EdgeInsets.all(8),child:Text('جارٍ إعداد الرد…',style:TextStyle(color:muted))),
    SafeArea(top:false,child:Padding(padding:const EdgeInsets.fromLTRB(12,6,12,12),child:Row(children:[
      Expanded(child:TextField(controller:input,minLines:1,maxLines:4,onSubmitted:(_)=>send(),decoration:const InputDecoration(hintText:'اكتب سؤالك هنا…'))),
      const SizedBox(width:8),IconButton.filled(onPressed:busy?null:send,icon:const Icon(Icons.send),style:IconButton.styleFrom(backgroundColor:gold,foregroundColor:navy))
    ])))
  ]);
}
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});
  @override Widget build(BuildContext context){
    final user=supabaseInitialized?Supabase.instance.client.auth.currentUser:null;
    return ListView(padding:const EdgeInsets.all(20),children:[
      const Icon(Icons.account_circle_outlined,color:gold,size:72),const SizedBox(height:12),
      const Center(child:Text('حساب الطالب',style:TextStyle(fontSize:23,fontWeight:FontWeight.bold))),
      Center(child:Text(user?.email??'وضع التصفح',style:const TextStyle(color:muted))),
      const SizedBox(height:24),if(user!=null)FilledButton.icon(onPressed:()=>Supabase.instance.client.auth.signOut(),icon:const Icon(Icons.logout),label:const Text('تسجيل الخروج')),
      const Card(color:panel,child:Padding(padding:EdgeInsets.all(16),child:Text('يستخدم التطبيق حساب المنصة نفسه. مزامنة التقدّم وسجل المحادثات قيد ربط واختبار الجداول الحالية.'))),
      const SizedBox(height:10),const Text('تطبيق Android أصلي مستقل',textAlign:TextAlign.center,style:TextStyle(color:muted))
    ]);
  }
}
