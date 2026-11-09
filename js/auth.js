import { supabase } from "./supabase.js";

const esc = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const friendlyError = error => {
  const message = error?.message || "حدث خطأ غير متوقع. حاول مرة أخرى.";
  if (/invalid login credentials/i.test(message)) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (/email not confirmed/i.test(message)) return "أكد بريدك الإلكتروني من الرسالة التي أرسلناها إليك أولاً.";
  if (/user already registered/i.test(message)) return "هذا البريد مسجل مسبقاً. سجّل الدخول بدلاً من إنشاء حساب جديد.";
  if (/password should be at least/i.test(message)) return "كلمة المرور قصيرة؛ استخدم 6 أحرف على الأقل.";
  if (/rate limit/i.test(message)) return "تم إرسال طلبات كثيرة. انتظر قليلاً ثم حاول مجدداً.";
  return message;
};

export async function requireStudentSession(host) {
  const { data:{session}, error } = await supabase.auth.getSession();
  if (error) throw error;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (hash.get("type") === "recovery") return await renderPasswordRecovery(host);
  if (session?.user) { mountAccount(session.user); return session.user; }
  renderAuth(host);
  return await new Promise(resolve => {
    const listener = supabase.auth.onAuthStateChange((_event, next) => {
      if (next?.user) {
        listener.data.subscription.unsubscribe();
        mountAccount(next.user);
        resolve(next.user);
      }
    });
    window.addEventListener("massnahme-auth-cancel", () => {
      listener.data.subscription.unsubscribe();
      resolve(null);
    }, {once:true});
  });
}

function mountAccount(user) {
  const area = document.querySelector(".top-actions");
  const displayName = user.user_metadata?.full_name || user.email || "طالب";
  if (area) area.innerHTML = '<span class="status-dot"></span><span class="student-email" title="' + esc(user.email) + '">' + esc(user.email) + '</span><button id="studentSignOut" class="auth-signout">تسجيل الخروج</button><span class="avatar">' + esc(displayName.slice(0,1)) + '</span>';
  document.getElementById("studentSignOut")?.addEventListener("click", async () => {
    const button = document.getElementById("studentSignOut");
    if (button) { button.disabled = true; button.textContent = "جارٍ الخروج…"; }
    const { error } = await supabase.auth.signOut();
    if (error) {
      if (button) { button.disabled = false; button.textContent = "تسجيل الخروج"; }
      window.alert(friendlyError(error));
      return;
    }
    location.reload();
  });
}

function renderPasswordRecovery(host) {
  host.innerHTML = `<section class="auth-shell"><div class="auth-card"><div class="auth-brand"><span class="brand-mark">M</span><div><strong>MAßNAHME LEARN</strong><small>التعليم للجميع</small></div></div><span class="eyebrow">ACCOUNT RECOVERY</span><h1>تعيين كلمة مرور جديدة</h1><p class="auth-subtitle">اختر كلمة مرور جديدة لحسابك، ثم أعد تسجيل الدخول.</p><form id="recoveryForm"><label>كلمة المرور الجديدة<input id="recoveryPassword" type="password" autocomplete="new-password" required minlength="6" placeholder="6 أحرف على الأقل"></label><label>تأكيد كلمة المرور<input id="recoveryConfirm" type="password" autocomplete="new-password" required minlength="6" placeholder="أعد كتابة كلمة المرور"></label><button class="primary-btn auth-submit" id="recoverySubmit">حفظ كلمة المرور</button></form><p class="auth-message" id="recoveryMessage" role="status"></p></div></section>`;
  const form = document.getElementById("recoveryForm");
  const button = document.getElementById("recoverySubmit");
  const message = document.getElementById("recoveryMessage");
  form.onsubmit = async event => {
    event.preventDefault();
    const password = document.getElementById("recoveryPassword").value;
    const confirm = document.getElementById("recoveryConfirm").value;
    if (password !== confirm) { message.textContent = "كلمتا المرور غير متطابقتين."; message.style.color = "#a34838"; return; }
    button.disabled = true;
    button.textContent = "جارٍ الحفظ…";
    const { error } = await supabase.auth.updateUser({password});
    if (error) {
      message.textContent = friendlyError(error);
      message.style.color = "#a34838";
      button.disabled = false;
      button.textContent = "حفظ كلمة المرور";
      return;
    }
    message.textContent = "تم تحديث كلمة المرور بنجاح. جارٍ فتح حسابك…";
    message.style.color = "#398365";
    history.replaceState(null, "", location.pathname + location.search);
    setTimeout(() => location.reload(), 900);
  };
  return new Promise(() => {});
}

function renderAuth(host) {
  host.innerHTML = `<section class="auth-shell"><div class="auth-card"><div class="auth-brand"><span class="brand-mark">M</span><div><strong>MAßNAHME LEARN</strong><small>التعليم للجميع</small></div></div><span class="eyebrow">STUDENT ACCOUNT</span><h1 id="authTitle">أهلاً بك من جديد</h1><p class="auth-subtitle" id="authSubtitle">سجّل دخولك لمتابعة دروسك وحفظ تقدمك على جميع أجهزتك.</p><form id="studentAuthForm"><label id="nameWrap" hidden>الاسم الكامل<input id="studentName" autocomplete="name" placeholder="اسم الطالب"></label><label>البريد الإلكتروني<input id="studentEmail" type="email" autocomplete="email" required placeholder="name@example.com"></label><label>كلمة المرور<input id="studentPassword" type="password" autocomplete="current-password" required minlength="6" placeholder="6 أحرف على الأقل"></label><button class="primary-btn auth-submit" id="authSubmit">تسجيل الدخول</button></form><div class="auth-links"><button id="toggleAuth" type="button">إنشاء حساب طالب جديد</button><button id="forgotPassword" type="button">نسيت كلمة المرور؟</button></div><p class="auth-message" id="authMessage" role="status"></p><small class="auth-note">حسابك خاص بك، وتقدمك الدراسي محفوظ بشكل آمن.</small></div></section>`;
  let mode = "login";
  const form = document.getElementById("studentAuthForm");
  const msg = document.getElementById("authMessage");
  const submit = document.getElementById("authSubmit");
  const toggle = document.getElementById("toggleAuth");
  const setMessage = (text, isError = false) => { msg.textContent = text; msg.style.color = isError ? "#a34838" : "#398365"; };
  const refreshMode = () => {
    const signup = mode === "signup";
    document.getElementById("authTitle").textContent = signup ? "إنشاء حساب طالب" : "أهلاً بك من جديد";
    document.getElementById("authSubtitle").textContent = signup ? "أنشئ حسابك المجاني وابدأ رحلتك التعليمية." : "سجّل دخولك لمتابعة دروسك وحفظ تقدمك على جميع أجهزتك.";
    document.getElementById("nameWrap").hidden = !signup;
    document.getElementById("studentName").required = signup;
    document.getElementById("studentPassword").autocomplete = signup ? "new-password" : "current-password";
    submit.textContent = signup ? "إنشاء الحساب" : "تسجيل الدخول";
    toggle.textContent = signup ? "لديك حساب؟ سجّل الدخول" : "إنشاء حساب طالب جديد";
    setMessage("");
  };
  toggle.onclick = () => { mode = mode === "login" ? "signup" : "login"; refreshMode(); };
  document.getElementById("forgotPassword").onclick = async () => {
    const email = document.getElementById("studentEmail").value.trim();
    if (!email) { setMessage("اكتب بريدك الإلكتروني أولاً.", true); return; }
    const button = document.getElementById("forgotPassword");
    button.disabled = true;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
      setMessage(error ? friendlyError(error) : "إذا كان البريد مسجلاً، ستصلك رسالة تتضمن رابط إعادة تعيين كلمة المرور.", !!error);
    } catch (error) { setMessage(friendlyError(error), true); }
    finally { button.disabled = false; }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "يرجى الانتظار…";
    setMessage("");
    const email = document.getElementById("studentEmail").value.trim();
    const password = document.getElementById("studentPassword").value;
    try {
      let result;
      if (mode === "signup") {
        const name = document.getElementById("studentName").value.trim();
        if (!name) { setMessage("اكتب اسمك الكامل.", true); return; }
        result = await supabase.auth.signUp({email, password, options:{data:{full_name:name}, emailRedirectTo:location.origin + location.pathname}});
      } else {
        result = await supabase.auth.signInWithPassword({email, password});
      }
      if (result.error) { setMessage(friendlyError(result.error), true); return; }
      if (mode === "signup" && !result.data.session) {
        setMessage("تم إرسال طلب إنشاء الحساب. افتح رسالة تأكيد البريد الإلكتروني، ثم ارجع وسجّل الدخول.");
        return;
      }
      if (result.data.session) location.reload();
    } catch (error) {
      setMessage(friendlyError(error), true);
    } finally {
      submit.disabled = false;
      submit.textContent = mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول";
    }
  };
}
