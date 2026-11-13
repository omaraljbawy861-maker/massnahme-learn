import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const hg = Color(0xFFD6B36A), hp = Color(0xFF142238), hm = Color(0xFF9BAAC0);
String val(dynamic x) => x == null ? '' : x.toString();
String textOf(dynamic x) {
  if (x == null) return 'لا يوجد محتوى';
  if (x is List) return x.map((e) => e is List ? e.join(' — ') : e is Map ? e.entries.map((v) => v.key.toString() + ': ' + val(v.value)).join(' — ') : val(e)).join('\n');
  if (x is Map) return x.entries.map((e) => e.key.toString() + ': ' + val(e.value)).join('\n');
  return val(x);
}
Future<List<Map<String,dynamic>>> loadBooks() async {
  final m = await AssetManifest.loadFromAssetBundle(rootBundle);
  final paths = m.listAssets().where((p) => p.startsWith('assets/courses/') && p.endsWith('.json') && !p.contains('zfa_')).toList()..sort();
  final out = <Map<String,dynamic>>[];
  for (final p in paths) { try { final d=jsonDecode(await rootBundle.loadString(p)); if(d is Map && d['lessons'] is List) out.add(Map<String,dynamic>.from(d)); } catch (_) {} }
  return out;
}
class LearningHubPage extends StatelessWidget {
 const LearningHubPage({super.key});
 @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [
  const Text('مركز التعلّم',style:TextStyle(fontSize:24,fontWeight:FontWeight.bold)),
  const Text('مكتبة الطالب والواجبات والاختبارات والمتابعة',style:TextStyle(color:hm)),
  tile(c,Icons.menu_book,'مكتبة الكتب','الكتب والفصول والدروس',const BooksPage()),
  tile(c,Icons.assignment,'الواجبات','واجبات الدروس ومتابعة الإنجاز',const AssignmentsPage()),
  tile(c,Icons.quiz,'الاختبارات','أسئلة وتدريبات المناهج',const ExamsPage()),
  tile(c,Icons.calendar_month,'جدول الحصص','البرنامج الأسبوعي',const SchedulePage()),
  tile(c,Icons.forum,'سجل المحادثات','محادثاتك التعليمية المحفوظة',const ChatHistoryPage()),
  tile(c,Icons.insights,'تقدّم الطالب والمزامنة','إنجازك المحفوظ على حسابك',const StudentProgressPage()),
 ]);
}
Widget tile(BuildContext c,IconData i,String t,String s,Widget p)=>Card(color:hp,child:ListTile(leading:Icon(i,color:hg),title:Text(t),subtitle:Text(s,style:const TextStyle(color:hm)),trailing:const Icon(Icons.chevron_left,color:hg),onTap:()=>Navigator.push(c,MaterialPageRoute(builder:(_)=>p))));
class BooksPage extends StatelessWidget {
 const BooksPage({super.key});
 @override Widget build(BuildContext c)=>Scaffold(appBar:AppBar(title:const Text('مكتبة الكتب')),body:FutureBuilder<List<Map<String,dynamic>>>(future:loadBooks(),builder:(c,s){
 if(!s.hasData)return const Center(child:CircularProgressIndicator(color:hg));
 return ListView(padding:const EdgeInsets.all(12),children:s.data!.map((b){final ls=List<Map<String,dynamic>>.from((b['lessons'] as List).map((e)=>Map<String,dynamic>.from(e)));return Card(color:hp,child:ExpansionTile(title:Text(val(b['bookTitle']??b['name']??b['title'])),subtitle:Text(ls.length.toString()+' درس'),children:ls.map((l)=>ListTile(title:Text(val(l['title']??l['germanTitle'])),onTap:()=>Navigator.push(c,MaterialPageRoute(builder:(_)=>LessonBookPage(lesson:l))))).toList()));}).toList());
 }));
}
class LessonBookPage extends StatelessWidget {
 final Map<String,dynamic> lesson;const LessonBookPage({super.key,required this.lesson});
 @override Widget build(BuildContext c)=>Scaffold(appBar:AppBar(title:Text(val(lesson['title']))),body:ListView(padding:const EdgeInsets.all(14),children:[
  block('أهداف التعلّم',textOf(lesson['objectives'])),block('الشرح',val(lesson['german'])+'\n'+val(lesson['explanation']??lesson['lessonText'])),block('المفردات',textOf(lesson['vocab'])),block('الأمثلة',textOf(lesson['examples']??lesson['example'])),block('التدريبات',textOf(lesson['practice'])),block('الواجب المنزلي',textOf(lesson['homework']))
 ]));
}
Widget block(String t,String b)=>Card(color:hp,child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(t,style:const TextStyle(color:hg,fontWeight:FontWeight.bold)),const SizedBox(height:8),Text(b,style:const TextStyle(height:1.6))])));
class AssignmentsPage extends StatefulWidget {const AssignmentsPage({super.key});@override State<AssignmentsPage> createState()=>_AssignmentsPageState();}
class _AssignmentsPageState extends State<AssignmentsPage>{
 Set<String> done={};bool ready=false;
 @override void initState(){super.initState();loadDone();}
 Future<void> loadDone() async {try{final u=Supabase.instance.client.auth.currentUser;if(u!=null){final r=await Supabase.instance.client.from('student_progress').select('progress').eq('student_id',u.id).maybeSingle();done=Set<String>.from((r?['progress']??{})['assignments_done']??[]);}}catch(_){}if(mounted)setState(()=>ready=true);}
 Future<void> toggle(String id,bool v) async {setState(()=>v?done.add(id):done.remove(id));final u=Supabase.instance.client.auth.currentUser;if(u==null)return;try{final r=await Supabase.instance.client.from('student_progress').select('progress').eq('student_id',u.id).maybeSingle();final p=Map<String,dynamic>.from(r?['progress']??{});p['assignments_done']=done.toList();await Supabase.instance.client.from('student_progress').upsert({'student_id':u.id,'progress':p,'updated_at':DateTime.now().toUtc().toIso8601String()},onConflict:'student_id');}catch(_){}}
 @override Widget build(BuildContext c)=>Scaffold(appBar:AppBar(title:const Text('الواجبات')),body:!ready?const Center(child:CircularProgressIndicator(color:hg)):FutureBuilder<List<Map<String,dynamic>>>(future:loadBooks(),builder:(c,s){
 if(!s.hasData)return const Center(child:CircularProgressIndicator(color:hg));final tasks=<Map<String,String>>[];
 for(final b in s.data!){for(final raw in b['lessons']){final l=Map<String,dynamic>.from(raw);final q=l['homework']??l['practice'];if(q is List){for(var i=0;i<q.length;i++){final x=q[i];tasks.add({'id':val(l['id']??l['title'])+'_'+i.toString(),'q':x is Map?val(x['q']??x['question']??x['task']):val(x),'lesson':val(l['title']),'book':val(b['name']??b['title'])});}}}}
 if(tasks.isEmpty)return const Center(child:Text('لا توجد واجبات ضمن بيانات الكتب الحالية.'));
 return ListView(padding:const EdgeInsets.all(12),children:[Text('المنجز '+done.length.toString()+' من '+tasks.length.toString(),style:const TextStyle(color:hg)),...tasks.map((t)=>Card(color:hp,child:CheckboxListTile(value:done.contains(t['id']),activeColor:hg,title:Text(t['q']!),subtitle:Text(t['book']!+' • '+t['lesson']!,style:const TextStyle(color:hm)),onChanged:(v)=>toggle(t['id']!,v??false))))]);
 }));
}
class ExamsPage extends StatelessWidget {
 const ExamsPage({super.key});
 @override Widget build(BuildContext c)=>Scaffold(appBar:AppBar(title:const Text('الاختبارات')),body:FutureBuilder<List<Map<String,dynamic>>>(future:loadBooks(),builder:(c,s){
 if(!s.hasData)return const Center(child:CircularProgressIndicator(color:hg));final items=<Map<String,dynamic>>[];
 for(final b in s.data!){for(final raw in b['lessons']){final l=Map<String,dynamic>.from(raw);final q=l['questions']??l['quiz']??l['practice'];if(q is List&&q.isNotEmpty)items.add({'title':val(l['title']),'questions':q});}}
 return ListView(padding:const EdgeInsets.all(12),children:[if(items.isEmpty)const Text('لا توجد اختبارات مستقلة في ملفات المناهج؛ راجع تدريبات كل درس من مكتبة الكتب.'),...items.map((x)=>Card(color:hp,child:ListTile(title:Text(x['title']),subtitle:Text((x['questions'] as List).length.toString()+' سؤال'),leading:const Icon(Icons.quiz,color:hg),onTap:()=>Navigator.push(c,MaterialPageRoute(builder:(_)=>QuizPage(title:x['title'],questions:List<dynamic>.from(x['questions']))))))]);
 }));
}
class QuizPage extends StatefulWidget {final String title;final List<dynamic> questions;const QuizPage({super.key,required this.title,required this.questions});@override State<QuizPage> createState()=>_QuizPageState();}
class _QuizPageState extends State<QuizPage>{final answers=<int,int>{};bool checked=false;
 @override Widget build(BuildContext c)=>Scaffold(appBar:AppBar(title:Text(widget.title)),body:ListView(padding:const EdgeInsets.all(12),children:[
 ...List.generate(widget.questions.length,(i){final q=widget.questions[i];final m=q is Map?Map<String,dynamic>.from(q):{'q':val(q)};final opts=m['options'] is List?List<dynamic>.from(m['options']):<dynamic>[];return Card(color:hp,child:Padding(padding:const EdgeInsets.all(10),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text((i+1).toString()+'. '+val(m['q']??m['question'])),...List.generate(opts.length,(j)=>RadioListTile<int>(value:j,groupValue:answers[i],onChanged:checked?null:(v)=>setState(()=>answers[i]=v!),title:Text(val(opts[j])))),if(checked)Text('الإجابة: '+val(m['answer']??m['correct']),style:const TextStyle(color:hg))])));}),
 FilledButton(onPressed:checked?null:()=>setState(()=>checked=true),child:const Text('تصحيح الإجابات')),
 if(checked)Text('تم تسليم الاختبار. راجع الإجابات النموذجية أعلاه.',style:const TextStyle(color:hg))
 ]));
}
class SchedulePage extends StatelessWidget {
 const SchedulePage({super.key});
 static const rows=[['الاثنين','Deutsch','Mathematik','مراجعة'],['الثلاثاء','Mathematik','English','تدريبات'],['الأربعاء','Deutsch','English','قراءة'],['الخميس','Mathematik','تطبيقات','اختبار قصير'],['الجمعة','مراجعة عامة','حل الواجبات','تقييم أسبوعي']];
 @override Widget build(BuildContext c)=>Scaffold(appBar:AppBar(title:const Text('جدول الحصص')),body:ListView(padding:const EdgeInsets.all(12),children:rows.map((r)=>Card(color:hp,child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(r[0],style:const TextStyle(color:hg,fontWeight:FontWeight.bold)),for(var i=1;i<r.length;i++)Text('الحصة '+i.toString()+': '+r[i])])))).toList()));
}
class ChatHistoryPage extends StatelessWidget {
 const ChatHistoryPage({super.key});
 @override Widget build(BuildContext c){final u=Supabase.instance.client.auth.currentUser;if(u==null)return Scaffold(appBar:AppBar(title:const Text('سجل المحادثات')),body:const Center(child:Text('سجّل الدخول أولاً.')));
 return Scaffold(appBar:AppBar(title:const Text('سجل المحادثات')),body:FutureBuilder<List<Map<String,dynamic>>>(future:Supabase.instance.client.from('free_chat_sessions').select('id,title,started_at').eq('user_id',u.id).order('started_at',ascending:false).limit(40),builder:(c,s){if(s.hasError)return const Center(child:Text('تعذر تحميل السجل أو لا تتوفر صلاحية الوصول.'));if(!s.hasData)return const Center(child:CircularProgressIndicator(color:hg));return ListView(children:s.data!.map((x)=>ListTile(title:Text(val(x['title'])),subtitle:Text(val(x['started_at'])),leading:const Icon(Icons.chat,color:hg),onTap:()=>Navigator.push(c,MaterialPageRoute(builder:(_)=>ChatSessionPage(session:x))))).toList());}));}
}
class ChatSessionPage extends StatelessWidget {final Map<String,dynamic> session;const ChatSessionPage({super.key,required this.session});
 @override Widget build(BuildContext c){final u=Supabase.instance.client.auth.currentUser!;return Scaffold(appBar:AppBar(title:Text(val(session['title']))),body:FutureBuilder<List<Map<String,dynamic>>>(future:Supabase.instance.client.from('free_chat_messages').select('role,content,created_at').eq('session_id',session['id']).eq('user_id',u.id).order('created_at'),builder:(c,s){if(!s.hasData)return const Center(child:CircularProgressIndicator(color:hg));return ListView(padding:const EdgeInsets.all(12),children:s.data!.map((m)=>Align(alignment:m['role']=='user'?Alignment.centerRight:Alignment.centerLeft,child:Card(color:hp,child:Padding(padding:const EdgeInsets.all(12),child:Text(val(m['content'])))))).toList());}));}
}
class StudentProgressPage extends StatelessWidget {
 const StudentProgressPage({super.key});
 @override Widget build(BuildContext c){final u=Supabase.instance.client.auth.currentUser;if(u==null)return Scaffold(appBar:AppBar(title:const Text('تقدّم الطالب')),body:const Center(child:Text('سجّل الدخول لمزامنة تقدّمك.')));
 return Scaffold(appBar:AppBar(title:const Text('تقدّم الطالب والمزامنة')),body:FutureBuilder<Map<String,dynamic>?>(future:Supabase.instance.client.from('student_progress').select('progress,updated_at').eq('student_id',u.id).maybeSingle(),builder:(c,s){if(s.hasError)return const Center(child:Text('تعذر جلب بيانات التقدّم.'));if(!s.hasData)return const Center(child:CircularProgressIndicator(color:hg));final p=Map<String,dynamic>.from(s.data?['progress']??{});final completed=List<dynamic>.from(p['completed']??[]);final scores=Map<String,dynamic>.from(p['scores']??{});final tasks=List<dynamic>.from(p['assignments_done']??[]);return ListView(padding:const EdgeInsets.all(14),children:[block('الدروس المكتملة',completed.length.toString()),block('الواجبات المنجزة',tasks.length.toString()),block('النتائج المسجلة',scores.length.toString()),block('آخر مزامنة',val(s.data?['updated_at']??'لا يوجد سجل'))]);}));}
}
