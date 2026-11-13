import { supabase } from "./supabase.js";
const $=id=>document.getElementById(id);
let userId=null,sessionId=null,gender="female",history=[],timer=null,expires=0,seconds=0;
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function persona(){ $("avatar").textContent=gender==="female"?"♀":"♂";$("persona").textContent=gender==="female"?"رفيقة الدردشة":"رفيق الدردشة"; }
function addMessage(role,content){const box=$("messages");if(box.querySelector(".chat-empty"))box.innerHTML="";const el=document.createElement("article");el.className="chat-bubble "+role;const h=document.createElement("small");h.textContent=role==="user"?"أنت":(gender==="female"?"رفيقة الدردشة":"رفيق الدردشة");const p=document.createElement("p");p.textContent=content;el.append(h,p);box.append(el);box.scrollTop=box.scrollHeight;return el;}
async function loadHistory(selected=""){const {data,error}=await supabase.from("free_chat_sessions").select("id,title,started_at").eq("user_id",userId).order("started_at",{ascending:false}).limit(40);if(error){$("history").textContent="تعذر تحميل السجل";return;}history=data||[];$("history").innerHTML=history.length?history.map(x=>'<button class="chat-history-item '+(x.id===selected?"active":"")+'" data-id="'+escapeHtml(x.id)+'"><strong>'+escapeHtml(x.title)+'</strong><small>'+new Date(x.started_at).toLocaleString()+'</small></button>').join(""):"لا توجد محادثات سابقة";$("history").querySelectorAll("[data-id]").forEach(b=>b.addEventListener("click",()=>openChat(b.dataset.id)));}
async function save(role,content){const {error}=await supabase.from("free_chat_messages").insert({session_id:sessionId,user_id:userId,role,content});if(error)throw error;}
function stopTimer(){if(timer)clearInterval(timer);timer=null;}
function runTimer(until){stopTimer();expires=new Date(until).getTime();const tick=async()=>{seconds=Math.max(0,Math.ceil((expires-Date.now())/1000));$("countdown").textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");if(!seconds){stopTimer();await supabase.from("free_chat_sessions").update({ended_at:new Date().toISOString()}).eq("id",sessionId).eq("user_id",userId);$("message").disabled=true;$("send").disabled=true;$("status").textContent="انتهى الوقت — المحادثة محفوظة";$("note").textContent="انتهى وقت المحادثة. جميع رسائلك محفوظة."}};tick();timer=setInterval(tick,1000);}
async function newChat(){
 const startButtons=[$("newChat"),$("startFirst")].filter(Boolean);
 if(!userId){$("note").textContent="سجّل الدخول أولاً لبدء المحادثة.";return;}
 if(startButtons.some(b=>b.dataset.busy==="1"))return;
 startButtons.forEach(b=>{b.dataset.busy="1";b.disabled=true;});
 $("note").textContent="جارٍ إنشاء المحادثة…";
 try{
  stopTimer();sessionId=null;
  const duration=Math.max(1,Number($("duration").value)||30),start=new Date(),end=new Date(start.getTime()+duration*60000);
  const title=gender==="female"?"دردشة جديدة · أنثى":"دردشة جديدة · ذكر";
  const {data,error}=await supabase.from("free_chat_sessions").insert({user_id:userId,title,persona_gender:gender,language:$("language").value,duration_minutes:duration,started_at:start.toISOString(),expires_at:end.toISOString()}).select("id,expires_at").single();
  if(error)throw error;
  if(!data?.id||!data?.expires_at)throw new Error("لم يتم إنشاء جلسة المحادثة.");
  sessionId=data.id;$("messages").innerHTML="";$("message").disabled=false;$("send").disabled=false;
  const greeting=gender==="female"?"أهلاً بك! أنا رفيقتك في الدردشة. يسعدني الحديث معك، ما الذي تحب أن نتحدث عنه؟":"أهلاً بك! أنا رفيقك في الدردشة. يسعدني الحديث معك، ما الذي تحب أن نتحدث عنه؟";
  addMessage("assistant",greeting);
  runTimer(data.expires_at);$("status").textContent="المحادثة نشطة";$("note").textContent="تم إنشاء محادثة جديدة. تُحفظ رسائلك تلقائياً.";
  try{await save("assistant",greeting);}catch(saveError){$("note").textContent="بدأت المحادثة، لكن تعذر حفظ رسالة الترحيب: "+(saveError.message||"");}
  await loadHistory(sessionId);
 }catch(err){
  console.error("new chat failed",err);
  $("note").textContent="تعذر بدء المحادثة: "+(err?.message||"تحقق من الاتصال والصلاحيات");
  $("status").textContent="لم تبدأ المحادثة";
 }finally{startButtons.forEach(b=>{b.dataset.busy="0";b.disabled=false;});}
}
async function openChat(id){stopTimer();const {data:s,error}=await supabase.from("free_chat_sessions").select("*").eq("id",id).eq("user_id",userId).single();if(error||!s)return;sessionId=id;gender=s.persona_gender;document.querySelectorAll("[data-gender]").forEach(b=>b.classList.toggle("active",b.dataset.gender===gender));persona();$("language").value=s.language||"auto";$("duration").value=String(s.duration_minutes||30);const {data:rows,error:e}=await supabase.from("free_chat_messages").select("role,content").eq("session_id",id).eq("user_id",userId).order("created_at");if(e)return;$("messages").innerHTML="";(rows||[]).forEach(m=>addMessage(m.role,m.content));if(new Date(s.expires_at)>new Date()&&!s.ended_at){$("message").disabled=false;$("send").disabled=false;runTimer(s.expires_at);$("status").textContent="المحادثة نشطة"}else{$("message").disabled=true;$("send").disabled=true;$("countdown").textContent="00:00";$("status").textContent="محادثة محفوظة ومنتهية"}await loadHistory(id);}
async function sendMessage(e){
 e.preventDefault();
 const text=$("message").value.trim();
 if(!text||!sessionId||seconds<=0)return;
 const btn=$("send");btn.disabled=true;$("message").disabled=true;
 addMessage("user",text);$("message").value="";
 const typing=addMessage("assistant","...");
 typing.classList.add("typing");
 $("note").textContent="وصلت رسالتك، جارٍ تجهيز الرد…";
 // Save the user's message in parallel with the AI request; never make the UI wait for the database first.
 const saveUserPromise=save("user",text).then(()=>({ok:true}),error=>({ok:false,error}));
 try{
  const payload={messages:Array.from($("messages").querySelectorAll(".chat-bubble:not(.typing)")).map(n=>({role:n.classList.contains("user")?"user":"assistant",content:n.querySelector("p").textContent})),personaGender:gender,preferredLanguage:$("language").value};
  const requestPromise=supabase.functions.invoke("free-chat",{body:payload});
  const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error("تأخر الرد أكثر من اللازم. حاول مجدداً؛ لم تُحذف رسالتك.")),26000));
  const {data,error}=await Promise.race([requestPromise,timeoutPromise]);
  if(error)throw error;
  if(!data?.reply)throw new Error(data?.error||"لم يصل الرد");
  typing.remove();
  addMessage("assistant",data.reply);
  $("note").textContent="وصل الرد. جارٍ حفظ الرسائل…";
  const saved=await Promise.allSettled([saveUserPromise,save("assistant",data.reply)]);
  if(saved.some(x=>x.status==="rejected")||saved.some(x=>x.value?.ok===false))$("note").textContent="وصل الرد، لكن تعذر حفظ إحدى الرسائل. تحقق من الاتصال.";
  else $("note").textContent="تم حفظ الرسائل تلقائياً.";
 }catch(err){
  typing.remove();
  const errorText=err.message||"تحقق من الاتصال";
  addMessage("assistant","تعذّر إكمال الرد: "+errorText);
  $("note").textContent="لم يصل الرد. يمكنك إعادة المحاولة الآن.";
  saveUserPromise.then(result=>{if(!result.ok)console.error("message save failed",result.error)});
 }finally{btn.disabled=seconds<=0;$("message").disabled=seconds<=0;$("message").focus();}
}
document.querySelectorAll("[data-gender]").forEach(b=>b.addEventListener("click",()=>{gender=b.dataset.gender;document.querySelectorAll("[data-gender]").forEach(x=>x.classList.toggle("active",x===b));persona();}));
$("newChat").addEventListener("click",newChat);$("startFirst").addEventListener("click",newChat);$("chatForm").addEventListener("submit",sendMessage);
const {data:{session}}=await supabase.auth.getSession();if(!session){$("messages").innerHTML='<div class="chat-empty"><h2>يلزم تسجيل الدخول</h2><p>سجّل الدخول إلى حساب الطالب لاستخدام الدردشة وحفظ محادثاتك.</p><a href="./index.html">العودة لتسجيل الدخول</a></div>';}else{userId=session.user.id;await loadHistory();}
persona();
