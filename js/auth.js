import { supabase } from "./supabase.js";

const esc = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function requireStudentSession(host) {
  const { data:{session} } = await supabase.auth.getSession();
  if (session?.user) { mountAccount(session.user); return session.user; }
  renderAuth(host);
  return await new Promise(resolve => {
    const listener = supabase.auth.onAuthStateChange((_event, next) => {
      if (next?.user) { listener.data.subscription.unsubscribe(); mountAccount(next.user); resolve(next.user); }
    });
    window.addEventListener("massnahme-auth-cancel", () => { listener.data.subscription.unsubscribe(); resolve(null); }, {once:true});
  });
}
function mountAccount(user) {
  const area=document.querySelector(".top-actions");
  if(area) area.innerHTML='<span class="status-dot"></span><span class="student-email">'+esc(user.email)+'</span><button id="studentSignOut" class="auth-signout">تسجيل الخروج</button><span class="avatar">'+esc((user.user_metadata?.full_name||user.email||"ط").slice(0,1))+'</span>';
  document.getElementById("studentSignOut")?.addEventListener("click",async()=>{await supabase.auth.signOut();location.reload();});
}
function renderAuth(host) {
  host.innerHTML=`<section class="auth-shell"><div class="auth-card"><div class="auth-brand"><span class="brand-mark">M</span><div><strong>MAßNAHME LEARN</strong><small>التعليم للجميع</small></div></div><span class="eyebrow">STUDENT ACCOUNT</span><h1 id="authTitle">أهلاً بك من جديد</h1><p class="auth-subtitle" id="authSubtitle">سجّل دخولك لمتابعة دروسك وحفظ تقدمك على جميع أجهزتك.</p><form id="studentAuthForm"><label id="nameWrap" hidden>الاسم الكامل<input id="studentName" autocomplete="name" placeholder="اسم الطالب"></label><label>البريد الإلكتروني<input id="studentEmail" type="email" autocomplete="email" required placeholder="name@example.com"></label><label>كلمة المرور<input id="studentPassword" type="password" autocomplete="current-password" required minlength="6" placeholder="6 أحرف على الأقل"></label><button class="primary-btn auth-submit" id="authSubmit">تسجيل الدخول</button></form><div class="auth-links"><button id="toggleAuth">إنشاء حساب طالب جديد</button><button id="forgotPassword">نسيت كلمة المرور؟</button></div><p class="auth-message" id="authMessage" role="status"></p><small class="auth-note">حسابك خاص بك، وتقدمك الدراسي محفوظ بشكل آمن.</small></div></section>`;
  let mode="login";
  const form=document.getElementById("studentAuthForm"), msg=document.getElementById("authMessage"), submit=document.getElementById("authSubmit");
  const setMessage=(t,err=false)=>{msg.textContent=t;msg.style.color=err?"#a34838":"#398365";};
  document.getElementById("toggleAuth").onclick=()=>{mode=mode==="login"?"signup":"login";document.getElementById("authTitle").textContent=mode==="login"?"أهلاً بك من جديد":"إنشاء حساب طالب";document.getElementById("authSubtitle").textContent=mode==="login"?"سجّل دخولك لمتابعة دروسك وحفظ تقدمك على جميع أجهزتك.":"أنشئ حسابك المجاني وابدأ رحلتك التعليمية.";document.getElementById("nameWrap").hidden=mode!=="signup";document.getElementById("studentPassword").autocomplete=mode==="login"?"current-password":"new-password";submit.textContent=mode==="login"?"تسجيل الدخول":"إنشاء الحساب";document.getElementById("toggleAuth").textContent=mode==="login"?"إنشاء حساب طالب جديد":"لديك حساب؟ سجّل الدخول";setMessage("");};
  document.getElementById("forgotPassword").onclick=async()=>{const email=document.getElementById("studentEmail").value.trim();if(!email)return setMessage("اكتب بريدك الإلكتروني أولاً.",true);const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});setMessage(error?error.message:"إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور.",!!error);};
  form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;submit.textContent="يرجى الانتظار…";setMessage("");const email=document.getElementById("studentEmail").value.trim(),password=document.getElementById("studentPassword").value;let result;
    if(mode==="signup"){const name=document.getElementById("studentName").value.trim();if(!name){setMessage("اكتب اسمك الكامل.",true);submit.disabled=false;submit.textContent="إنشاء الحساب";return;}result=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});}
    else result=await supabase.auth.signInWithPassword({email,password});
    submit.disabled=false;submit.textContent=mode==="login"?"تسجيل الدخول":"إنشاء الحساب";
    if(result.error){setMessage(result.error.message==="Invalid login credentials"?"البريد الإلكتروني أو كلمة المرور غير صحيحة.":result.error.message,true);return;}
    if(mode==="signup"&&!result.data.session){setMessage("تم إنشاء الحساب. افتح رسالة التأكيد التي أرسلناها إلى بريدك الإلكتروني، ثم ارجع وسجّل الدخول.");return;}
    if(result.data.session)location.reload();
  };
}