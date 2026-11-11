import { loadCourses } from "./data.js?v=20261110-1";
import { supabase } from "./supabase.js";
import { connectEnglishSchoolSync } from "./english_school_sync.js?v=20261111-3";
import { requireStudentSession } from "./auth.js?v=20261109-2";
import { initializeStudentProgress, getProgress, isCompleted, markCompleted, saveScore, completionCount } from "./progress.js?v=20261111-4";

const content = document.querySelector("#appContent");
const pageTitle = document.querySelector("#pageTitle");
const toast = document.querySelector("#toast");
let courses = [];
let currentCourse = null;
let currentLesson = null;
let languageBank = null;
let videoLibrary = [];
let zfaSimulationIndex = 0;
let zfaSimulationScore = 0;
let zfaSimulationAnswered = false;
let studyTimerInterval = null;
let studyTimerRemaining = 25 * 60;
let studyTimerRunning = false;
let studyTimerEndsAt = null;
let studyChatMessages = [];
let currentStudentId = null;
let activeStudyChatId = null;
let studyChatTimer = null;
let studyChatExpiresAt = null;
let studyChatSecondsLeft = 0;

const labels = { videos:"مكتبة الفيديوهات", dashboard:"لوحة الطالب", library:"مكتبة الكتب", schedule:"جدول الحصص", assignments:"الواجبات", exams:"الاختبارات", phrases:"مختبر اللغات", "language-de":"اللغة الألمانية", "language-en":"اللغة الإنجليزية", "english-school":"المدرسة الإنجليزية · المنهج الأكاديمي", "intensive-b1":"الألمانية المكثفة B1", "intensive-b2":"الألمانية المكثفة B2", "zfa-preparation":"التحضير لتدريب مساعدة طبيب الأسنان", "zfa-application":"ملف التقديم والمقابلة ZFA", "zfa-simulation":"محاكاة يوم في عيادة الأسنان", "study-assistant":"المساعد الدراسي الذكي", "study-timer":"مؤقّت التركيز" };

const dailyPhrases = [
  ["Guten Morgen!","صباح الخير!"],["Wie geht es dir?","كيف حالك؟"],["Mir geht es gut, danke.","أنا بخير، شكراً."],
  ["Wie heißt du?","ما اسمك؟"],["Ich heiße Omar.","اسمي عمر."],["Woher kommst du?","من أين أنت؟"],
  ["Ich komme aus Syrien.","أنا من سوريا."],["Wo wohnst du?","أين تسكن؟"],["Ich wohne in Deutschland.","أسكن في ألمانيا."],
  ["Ich verstehe nicht.","أنا لا أفهم."],["Können Sie bitte langsamer sprechen?","هل يمكنك التحدث ببطء أكثر من فضلك؟"],
  ["Können Sie das bitte wiederholen?","هل يمكنك إعادة ذلك من فضلك؟"],["Was kostet das?","كم سعر هذا؟"],
  ["Ich hätte gern einen Kaffee.","أريد قهوة من فضلك."],["Wo ist die Haltestelle?","أين موقف الحافلة؟"],
  ["Ich brauche einen Termin.","أحتاج إلى موعد."],["Vielen Dank für Ihre Hilfe.","شكراً جزيلاً على مساعدتك."],
  ["Entschuldigung, ich habe eine Frage.","عذراً، لدي سؤال."],["Bis später!","أراك لاحقاً!"],["Auf Wiedersehen!","إلى اللقاء!"]
];

function detectSpeechLanguage(text) {
  const value = String(text || "");
  const arabicCount = (value.match(/[\u0600-\u06FF\u0750-\u077F]/g) || []).length;
  const latinCount = (value.match(/[A-Za-zÄÖÜäöüß]/g) || []).length;
  const germanWords = (value.match(/\b(der|die|das|und|ist|nicht|ich|du|Sie|ein|eine|mit|auf|für|weil|haben|sein|wird|sind|kann|bitte|danke)\b/gi) || []).length;
  const englishWords = (value.match(/\b(the|and|is|are|you|your|I|we|they|this|that|with|for|have|has|what|how|because|please|thank|hello|good|morning)\b/gi) || []).length;

  if (arabicCount > latinCount) return "ar";
  if (germanWords > englishWords || /[ÄÖÜäöüß]/.test(value)) return "de";
  if (englishWords > 0 || latinCount > 0) return "en";
  return "ar";
}

function waitForSpeechVoices(timeoutMs = 5000) {
  return new Promise(resolve => {
    const synth = window.speechSynthesis;
    let finished = false;
    const finish = () => {
      if (finished) return;
      const voices = synth.getVoices() || [];
      if (voices.length || Date.now() >= deadline) {
        finished = true;
        clearInterval(poll);
        clearTimeout(timeout);
        synth.removeEventListener?.("voiceschanged", check);
        resolve(voices);
      }
    };
    const deadline = Date.now() + timeoutMs;
    const check = () => finish();
    const poll = setInterval(finish, 200);
    const timeout = setTimeout(finish, timeoutMs + 50);
    synth.addEventListener?.("voiceschanged", check);
    finish();
  });
}

function findSpeechVoice(voices, languagePrefix, voiceGender = "female") {
  const matches = voices.filter(v => {
    const lang = String(v.lang || "").toLowerCase().replace("_", "-");
    return lang === languagePrefix || lang.startsWith(languagePrefix + "-");
  });
  if (matches.length) {
    const genderPattern = voiceGender === "male"
      ? /(?:^|[^a-z])male(?:$|[^a-z])|mascul|david|mark|george|daniel|james|thomas|hans|stefan|yousef|mehdi|guy|ryan/i
      : /female|fem|zira|susan|samantha|victoria|karen|anna|hedda|petra|sara|laila|aria|jenny|ava|emma/i;
    return matches.find(v => genderPattern.test(v.name || "")) || matches.find(v => v.default) || matches.find(v => v.localService) || matches[0];
  }
  if (languagePrefix === "ar") {
    // Some Windows/browser voice lists expose Arabic in the voice name
    // even when the language tag is incomplete.
    return voices.find(v => /arabic|العربية|العربي/i.test(v.name || ""));
  }
  return null;
}

let activeSpeechUtterance = null;
let activeSpeechText = "";
let activeSpeechLanguage = "auto";
function getStudySpeechLanguage(text) {
  const selected = document.getElementById("studySpeechLanguage")?.value || "auto";
  return selected === "auto" ? detectSpeechLanguage(text) : selected;
}

async function speakText(text, lang, voiceGender = "female") {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    notify("ميزة النطق غير مدعومة في هذا المتصفح.");
    return;
  }
  const value = String(text || "").trim();
  if (!value) return;
  const languagePrefix = String(lang || detectSpeechLanguage(value)).split("-")[0].toLowerCase();
  const synth = window.speechSynthesis;
  activeSpeechText = value;
  activeSpeechLanguage = languagePrefix;
  const voices = synth.getVoices().length ? synth.getVoices() : await waitForSpeechVoices(3000);
  const voice = findSpeechVoice(voices, languagePrefix, voiceGender);
  if (!voice) {
    const languageName = languagePrefix === "ar" ? "العربية" : languagePrefix === "de" ? "الألمانية" : "الإنجليزية";
    notify("لا يوجد صوت " + languageName + " مثبت على الجهاز. أضف صوتاً لهذه اللغة من إعدادات النظام.");
    return;
  }
  synth.cancel();
  activeSpeechUtterance = null;
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.voice = voice;
  utterance.lang = voice.lang || (languagePrefix === "ar" ? "ar-SA" : languagePrefix === "de" ? "de-DE" : "en-GB");
  const rateControl = Number(document.getElementById("studyVoiceRate")?.value || 0.9);
  utterance.rate = Math.max(0.75, Math.min(1.15, rateControl));
  utterance.pitch = 1;
  utterance.onstart = () => {
  };
  utterance.onend = () => {
    if (activeSpeechUtterance === utterance) activeSpeechUtterance = null;
  };
  utterance.onerror = event => {
    if (activeSpeechUtterance === utterance) activeSpeechUtterance = null;
    if (event.error !== "canceled" && event.error !== "interrupted") {
      notify("تعذر تشغيل الصوت. جرّب اختيار صوت آخر أو أعد المحاولة.");
    }
  };
  activeSpeechUtterance = utterance;
  // Defer slightly after cancel; this helps Safari/Chromium restart speech reliably.
  setTimeout(() => {
    if (activeSpeechUtterance === utterance) synth.speak(utterance);
  }, 180);
}

function stopStudySpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  activeSpeechUtterance = null;
}

const allLessons = () => courses.flatMap(c => c.lessons.map(l => ({...l, courseId:c.id, courseName:c.name, courseGerman:c.german})));
const escapeHtml = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function notify(message) { toast.textContent = message; toast.classList.add("show"); setTimeout(()=>toast.classList.remove("show"),2400); }
function setActive(view) {
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.querySelectorAll(".bottom-nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  pageTitle.textContent = labels[view] || "الدرس";
  closeSidebar();
}
function courseProgress(course) {
  const done = course.lessons.filter(l=>isCompleted(l.id)).length;
  return Math.round(done/course.lessons.length*100);
}
function subjectCard(c, cls="subject-card") {
  const pct = courseProgress(c);
  return `<article class="${cls}" data-course="${c.id}">
    <div class="subject-top"><span class="subject-symbol">${escapeHtml(c.icon)}</span><span class="subject-code">${escapeHtml(c.code)}</span></div>
    <h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.german)} · ${c.lessons.length} دروس</p>
    <div class="progress-meta"><span>التقدم</span><strong>${pct}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
  </article>`;
}
async function renderVideoLibrary(){
  if(!videoLibrary.length){
    const response=await fetch("./data/video-library.json?v=20",{cache:"no-store"});
    if(!response.ok)throw new Error("تعذر تحميل مكتبة الفيديوهات");
    const data=await response.json();videoLibrary=data.items||[];
  }
  const subjects=[...new Set(videoLibrary.map(v=>v.subject))].map(id=>({id,label:({mathematics:"الرياضيات",german:"الألمانية",english:"الإنجليزية",biology:"الأحياء",politics:"السياسة",history:"التاريخ",zfa:"طب الأسنان ZFA",worklife:"العمل والحياة المهنية", "german-b1":"الألمانية B1", "german-b2":"الألمانية B2",all:"مواد متعددة"})[id]||id}));
  content.innerHTML=`<div class="page-intro"><span class="eyebrow">VIDEO CAMPUS · مكتبة المشاهدة</span><h1>مكتبة الفيديوهات التعليمية</h1><p>محتوى تعليمي مرئي منتقى من جهات تعليمية ألمانية، مع مساحة مشاهدة داخل المنصة.</p></div>
  <div class="video-library-toolbar"><input id="videoSearch" class="language-search" type="search" autocomplete="off" placeholder="ابحث عن مادة أو موضوع أو جهة تعليمية..." aria-label="البحث في مكتبة الفيديوهات"><select id="videoSubjectFilter" aria-label="تصفية حسب المادة"><option value="all">كل المواد</option>${subjects.map(x=>`<option value="${x.id}">${x.label}</option>`).join("")}</select></div><p class="video-results-status" id="videoResultsStatus" aria-live="polite"></p>
  <div class="video-campus-layout"><section><div class="video-grid" id="videoGrid">${videoLibrary.map(videoCard).join("")}</div><div class="video-no-results" id="videoNoResults" hidden><span>⌕</span><h3>ما لقينا نتائج</h3><p>جرّب كلمة بحث ثانية أو اختر كل المواد.</p></div></section><aside class="video-player-panel" id="videoPlayerPanel"><div class="video-player-empty"><span>▶</span><h3>مساحة مشاهدة الدروس</h3><p>اختر محتوى من المكتبة لعرضه هنا دون مغادرة MAßNAHME LEARN.</p></div></aside></div>
  <p class="video-note">بعض الجهات تسمح بتضمين الفيديو، وبعضها تمنع عرض صفحاتها داخل مواقع أخرى. نضيف الفيديوهات الفردية إلى المكتبة بعد التحقق من رابط التضمين وحقوق عرضه.</p>`;
  document.querySelector("#videoSearch").addEventListener("input",filterVideos);
  document.querySelector("#videoSubjectFilter").addEventListener("change",filterVideos);
  filterVideos();
}
function videoCard(v){
 const thumbnail=v.type==="youtube"&&v.videoId?`<img class="video-card-thumbnail" src="https://i.ytimg.com/vi/${encodeURIComponent(v.videoId)}/hqdefault.jpg" alt="" loading="lazy" onerror="this.hidden=true">`:"";
 return `<article class="video-resource-card" data-video-card="${escapeHtml(v.id)}" data-subject="${escapeHtml(v.subject)}" data-search="${escapeHtml((v.title+" "+v.provider+" "+v.subjectName+" "+v.description).toLowerCase())}">
 <div class="video-card-art">${thumbnail}<span>▶</span><small>MAßNAHME VIDEO CAMPUS</small></div><div class="video-card-body"><span class="video-chip">${escapeHtml(v.subjectName)}</span><h3>${escapeHtml(v.title)}</h3><p>${escapeHtml(v.description)}</p><div class="video-card-meta"><span>${escapeHtml(v.provider)}</span><small>${escapeHtml(v.level)}</small></div><button class="primary-btn" data-play-video="${escapeHtml(v.id)}">${v.type==="external"?"↗ مشاهدة من المصدر الرسمي":"▶ تشغيل الدرس هنا"}</button></div></article>`;
}
function filterVideos(){
 const q=document.querySelector("#videoSearch").value.trim().toLowerCase(),subject=document.querySelector("#videoSubjectFilter").value;
 const cards=[...document.querySelectorAll("[data-video-card]")];let visible=0;
 cards.forEach(card=>{const match=card.dataset.search.includes(q)&&(subject==="all"||card.dataset.subject===subject);card.hidden=!match;if(match)visible++;});
 const status=document.querySelector("#videoResultsStatus"),empty=document.querySelector("#videoNoResults");
 if(status)status.textContent=`عرض ${visible} من أصل ${cards.length} فيديو`;
 if(empty)empty.hidden=visible!==0;
}
function playVideo(id){
 const v=videoLibrary.find(x=>x.id===id);if(!v)return;
 const panel=document.querySelector("#videoPlayerPanel");
 let player="";
 if(v.type==="mp4" && v.src && !/^https?:\/\//i.test(v.src)){
   player=`<video controls playsinline preload="metadata" src="${escapeHtml(v.src)}"></video>`;
 }else if(v.type==="youtube"||v.type==="vimeo"){
   const src=v.type==="vimeo"?`https://player.vimeo.com/video/${encodeURIComponent(v.videoId)}`:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.videoId)}?rel=0`;
   player=`<iframe src="${src}" title="${escapeHtml(v.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
 }else if(v.type==="external" && v.url){
   const ardId=v.url.split("/").filter(Boolean).pop();
   const ardEmbed=ardId?"https://www.ardmediathek.de/player/"+encodeURIComponent(ardId):"";
   player=ardEmbed?`<iframe class="ard-embedded-player" src="${ardEmbed}" title="${escapeHtml(v.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`:`<div class="video-player-empty"><span>!</span><h3>تعذر تجهيز مشغل هذا الفيديو</h3><p>رابط المصدر غير مكتمل.</p></div>`;
 }else{
   player=`<div class="video-player-empty"><span>!</span><h3>رابط الفيديو غير مكتمل</h3><p>هذا العنصر لا يحتوي على ملف أو رابط تشغيل صالح حتى الآن.</p></div>`;
 }
 const sourceUrl=v.type==="youtube"?"https://www.youtube.com/watch?v="+encodeURIComponent(v.videoId):v.type==="vimeo"?"https://vimeo.com/"+encodeURIComponent(v.videoId):"";
 const sourceLabel=v.type==="youtube"?"فتح الفيديو على YouTube":v.type==="vimeo"?"فتح الفيديو على Vimeo":"مشاهدة الفيديو من المصدر الرسمي";
 panel.innerHTML=`<div class="video-player-heading"><span class="eyebrow">MAßNAHME · VIDEO PLAYER</span><h2>${escapeHtml(v.title)}</h2><p>${escapeHtml(v.subjectName)} · ${escapeHtml(v.level)}</p></div><div class="embedded-video-frame">${player}</div>${sourceUrl?`<a class="video-open-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">↗ ${sourceLabel}</a>`:""}<div class="video-player-description"><h3>عن الدرس</h3><p>${escapeHtml(v.description)}</p><p class="video-note">إذا لم يعمل العرض داخل الصفحة بسبب قيود المصدر، استخدم رابط المشاهدة الرسمية أعلاه.</p></div>`;
 panel.scrollIntoView({behavior:"smooth",block:"start"});
}

function renderDashboard() {
  const completed = completionCount();
  const total = allLessons().length;
  const progress = Math.round(completed / Math.max(1,total) * 100);
  const quickLinks = [
    {id:"library",icon:"▤",title:"المواد الدراسية",desc:"كتب ودروس منظمة لجميع المواد",meta: courses.length+" مواد"},
    {id:"videos",icon:"▶",title:"مكتبة الفيديوهات",desc:"شروحات مرئية تساعدك على الفهم",meta:"شاهد وتعلّم"},
    {id:"study-assistant",icon:"✦",title:"المساعد الذكي",desc:"اسأل، ناقش، واحصل على شرح مبسّط",meta:"مساعدك الدراسي"},
    {id:"phrases",icon:"◉",title:"مختبر اللغات",desc:"تدرّب على الكلمات والاستماع والنطق",meta:"لغات ومحادثة"},
    {id:"exams",icon:"✎",title:"الاختبارات",desc:"اختبر معلوماتك وتابع مستواك",meta:"تقييم ذاتي"},
    {id:"zfa-preparation",icon:"＋",title:"المسار المهني ZFA",desc:"ابدأ التحضير لمجال مساعدة طبيب الأسنان",meta:"تطوير مهني"}
  ];
  const recommended = allLessons().slice(0,3);
  content.innerHTML = `
  <section class="home-hero">
    <div class="home-hero-copy">
      <span class="home-kicker"><i></i> MAßNAHME LEARN · BILDUNG FÜR ALLE</span>
      <h1>كل خطوة تعليم، <em>تقربك من هدفك.</em></h1>
      <p>مساحتك التعليمية المتكاملة للتعلّم، والتدريب، وتطوير مهاراتك خطوة بخطوة.</p>
      <div class="home-hero-actions">
        <button class="home-primary-action" data-action="open-library">ابدأ التعلّم <span>←</span></button>
        <button class="home-secondary-action" data-view="study-assistant">اسأل المساعد الذكي <span>✦</span></button>
      </div>
    </div>
    <div class="home-hero-art" aria-hidden="true">
      <div class="home-orbit orbit-one"></div><div class="home-orbit orbit-two"></div>
      <div class="home-emblem"><span>M</span><small>LEARN</small></div>
      <div class="home-floating-tag tag-esa">ESA <b>2026</b></div>
      <div class="home-floating-tag tag-cap">✦ <b>تعليم للجميع</b></div>
    </div>
    <div class="home-hero-foot"><span>تعلم على طريقتك</span><b>•</b><span>تقدّم في كل يوم</span><b>•</b><span>اصنع مستقبلك</span></div>
  </section>

  <section class="home-progress-row" aria-label="ملخص تقدمك">
    <article class="home-stat-card"><span class="home-stat-icon stat-gold">▤</span><div><small>المواد الدراسية</small><strong>${courses.length}</strong><em>مسارات متاحة</em></div></article>
    <article class="home-stat-card"><span class="home-stat-icon stat-blue">▣</span><div><small>الدروس المتاحة</small><strong>${total}</strong><em>محتوى تعليمي</em></div></article>
    <article class="home-stat-card"><span class="home-stat-icon stat-green">✓</span><div><small>الدروس المكتملة</small><strong>${completed}</strong><em>إنجازاتك حتى الآن</em></div></article>
    <article class="home-stat-card home-progress-stat"><span class="home-stat-icon stat-purple">◷</span><div class="home-progress-copy"><small>نسبة الإنجاز</small><strong>${progress}%</strong><div class="home-progress-track"><i style="width:${progress}%"></i></div></div></article>
  </section>

  <section class="home-section">
    <div class="home-section-heading"><div><span class="home-section-kicker">EXPLORE YOUR LEARNING</span><h2>اكتشف أقسام المنصة</h2><p>كل ما تحتاجه للتعلّم والتدريب في مكان واحد.</p></div></div>
    <div class="home-quick-grid">${quickLinks.map((item,index)=>`<button class="home-quick-card quick-${index+1}" data-view="${item.id}"><span class="home-quick-icon">${item.icon}</span><span class="home-quick-meta">${item.meta}</span><strong>${item.title}</strong><small>${item.desc}</small><span class="home-quick-arrow">←</span></button>`).join("")}</div>
  </section>

  <section class="home-lower-grid">
    <div class="home-subject-panel">
      <div class="home-section-heading compact"><div><span class="home-section-kicker">YOUR LEARNING PATH</span><h2>المواد الدراسية</h2></div><button class="home-text-link" data-action="open-library">عرض الكل ←</button></div>
      <div class="subject-grid">${courses.slice(0,6).map(c=>subjectCard(c)).join("")}</div>
    </div>
    <aside class="home-start-panel">
      <span class="home-start-symbol">✦</span><span class="home-section-kicker">KEEP MOVING FORWARD</span>
      <h2>ابدأ بخطوتك القادمة</h2><p>اختر درساً وتابع رحلتك التعليمية اليوم.</p>
      <div class="home-recommended-list">${recommended.map(l=>`<div class="home-recommended-item"><span>▹</span><div><strong>${escapeHtml(l.title)}</strong><small>${escapeHtml(l.courseName)} · ${escapeHtml(l.duration)}</small></div><button data-lesson="${l.id}" aria-label="فتح الدرس">←</button></div>`).join("")}</div>
      <button class="home-start-link" data-view="schedule">عرض جدول الحصص <span>←</span></button>
    </aside>
  </section>
  <footer class="home-footer"><strong>MAßNAHME LEARN</strong><span>Bildung für alle · التعليم للجميع</span><span>كل خطوة تعليم تقرّبك من مستقبل أفضل.</span></footer>`;
}
function renderLibrary() {
  content.innerHTML = `<div class="page-intro"><span class="eyebrow">SCHULBIBLIOTHEK · مكتبة المدرسة</span><h1>مكتبة الكتب الدراسية</h1><p>كل مادة أصبحت كتاباً منظماً بغلاف ووحدات وفصول وفهرس محتويات.</p></div><div class="library-grid">${courses.map(c=>`
    <article class="book-card" data-course="${c.id}">
      <div class="book-cover ${c.id}">
        <span class="book-brand">MAßNAHME LEARN</span>
        <span class="book-code">${escapeHtml(c.code)}</span>
        <div class="book-cover-title">${escapeHtml(c.bookTitle || c.name)}</div>
        <span class="book-cover-sub">${escapeHtml(c.bookSubtitle || "Arbeitsbuch")}</span>
        <span class="book-cover-foot">BILDUNG FÜR ALLE · ESA</span>
      </div>
      <div class="book-info"><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.bookDescription || c.description)}</p><div class="book-meta"><span>${c.lessons.length} فصول</span><span>${Math.round(c.lessons.filter(l=>isCompleted(l.id)).length/Math.max(1,c.lessons.length)*100)}% مكتمل</span></div><button class="primary-btn book-open">فتح الكتاب والفهرس ←</button></div>
    </article>`).join("")}</div>`;
}
function openCourse(id) {
  currentCourse = courses.find(c=>c.id===id);
  if (!currentCourse) return;
  setActive("library");
  pageTitle.textContent = currentCourse.name;
  renderCourseLessons();
}
function renderCourseLessons() {
  const grouped = [];
  currentCourse.lessons.forEach((lesson, index) => {
    const unitName = lesson.unitArabic || lesson.unit || "وحدات الكتاب";
    let group = grouped.find(g => g.name === unitName);
    if (!group) { group = {name:unitName, items:[]}; grouped.push(group); }
    group.items.push({...lesson, chapterNumber:index+1});
  });
  content.innerHTML = `
    <div class="book-detail-head">
      <div class="book-cover large ${currentCourse.id}">
        <span class="book-brand">MAßNAHME LEARN</span><span class="book-code">${escapeHtml(currentCourse.code)}</span>
        <div class="book-cover-title">${escapeHtml(currentCourse.bookTitle || currentCourse.name)}</div>
        <span class="book-cover-sub">${escapeHtml(currentCourse.bookSubtitle || "Arbeitsbuch")}</span>
        <span class="book-cover-foot">BILDUNG FÜR ALLE · ESA</span>
      </div>
      <div class="book-overview"><span class="eyebrow">LEHRBUCH · الكتاب الدراسي</span><h1>${escapeHtml(currentCourse.name)}</h1><div class="book-german-title">${escapeHtml(currentCourse.bookTitle || currentCourse.german)}</div><p>${escapeHtml(currentCourse.bookDescription || currentCourse.description)}</p><h3>أهداف الكتاب</h3><ul>${(currentCourse.learningGoals||[]).map(g=>`<li>${escapeHtml(g)}</li>`).join("")}</ul><div class="book-progress"><div class="progress-meta"><span>إنجاز الكتاب</span><strong>${courseProgress(currentCourse)}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${courseProgress(currentCourse)}%"></div></div></div></div>
    </div>
    <div class="book-toc-head"><div><span class="eyebrow">INHALTSVERZEICHNIS</span><h2>فهرس الكتاب والوحدات</h2></div><span class="subtle-tag">${currentCourse.lessons.length} فصول تعليمية</span></div>
    <div class="book-units">${grouped.map((group, gi)=>`<section class="book-unit"><div class="unit-heading"><span class="unit-number">${String(gi+1).padStart(2,"0")}</span><div><small>LEKTIONSEINHEIT ${gi+1}</small><h3>${escapeHtml(group.name)}</h3></div><span class="unit-count">${group.items.length} ${group.items.length===1?"درس":"دروس"}</span></div><div class="unit-chapters">${group.items.map(l=>`<button class="chapter-row" data-lesson="${l.id}"><span class="chapter-no">${String(l.chapterNumber).padStart(2,"0")}</span><span class="chapter-title"><strong>${escapeHtml(l.title)}</strong><small>${escapeHtml(l.germanTitle)} · ${escapeHtml(l.duration)}</small></span><span class="chapter-status">${isCompleted(l.id)?"✓ مكتمل":"فتح الفصل ←"}</span></button>`).join("")}</div></section>`).join("")}</div>`;
}
function openLesson(id) {
  const found = allLessons().find(l=>l.id===id);
  if (!found) return;
  currentCourse = courses.find(c=>c.id===found.courseId);
  currentLesson = currentCourse.lessons.find(l=>l.id===id);
  pageTitle.textContent = currentLesson.title;
  let main = document.querySelector(".lesson-main");
  if (!main) {
    content.innerHTML = `<div class="lesson-main"></div>`;
    main = content.querySelector(".lesson-main");
  }
  document.querySelectorAll(".lesson-item").forEach(b=>b.classList.toggle("active",b.dataset.lesson===id));
  const l=currentLesson;
  const renderTasks = (items, title) => items?.length ? `<section class="lesson-section"><h3>${title}</h3>${items.map((item,i)=>`<div class="task-card"><p><strong>${i+1}.</strong> ${escapeHtml(item.q || item.prompt || "")}</p>${item.hint?`<p class="task-hint">تلميح: ${escapeHtml(item.hint)}</p>`:""}<details><summary>اعرض الحل النموذجي</summary><p>${escapeHtml(item.a || item.solution || "").replaceAll("\n","<br>")}</p></details></div>`).join("")}</section>` : "";
  const renderWorked = items => items?.length ? `<section class="lesson-section"><h3>🧩 أمثلة محلولة خطوة بخطوة</h3>${items.map(item=>`<div class="worked-card"><h4>${escapeHtml(item.title)}</h4><div class="german-box">${escapeHtml(item.prompt).replaceAll("\n","<br>")}</div><ol>${item.steps.map(step=>`<li>${escapeHtml(step)}</li>`).join("")}</ol><strong>النتيجة:</strong><p>${escapeHtml(item.answer).replaceAll("\n","<br>")}</p></div>`).join("")}</section>` : "";
  main.innerHTML = `<div class="german-title">${escapeHtml(l.unit || currentCourse.german)} · ${escapeHtml(l.germanTitle)} · ${escapeHtml(l.level)} · ${escapeHtml(l.duration)}</div><h1>${escapeHtml(l.title)}</h1><p>${escapeHtml(l.intro)}</p>
  <section class="lesson-section"><h3>🎯 أهداف التعلم</h3><ul>${l.objectives.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>
  <section class="lesson-section"><h3>📘 Erklärung / Lesson explanation</h3><div class="german-box">${escapeHtml(l.german).replaceAll("\n","<br>")}</div><button class="listen-btn" data-speak="${escapeHtml(l.german)}" data-lang="${currentCourse.id==="english"?"en-GB":"de-DE"}">▶ استمع إلى شرح الفصل</button></section>
  <section class="lesson-section"><h3>📝 الدرس المشروح بالعربية</h3><p>${escapeHtml(l.lessonText || l.explanation).replaceAll("\n","<br>")}</p><p>${escapeHtml(l.explanation || "")}</p></section>
  <section class="lesson-section"><h3>📖 المفردات المهمة</h3><table class="vocab-table">${l.vocab.map(v=>`<tr><td>${escapeHtml(v[0])}</td><td>${escapeHtml(v[1])}</td><td><button class="listen-small" data-speak="${escapeHtml(v[0])}" data-lang="${currentCourse.id==="english"?"en-GB":"de-DE"}" aria-label="استمع للكلمة">🔊</button></td></tr>`).join("")}</table></section>
  ${renderWorked(l.worked)}
  ${renderTasks(l.practice,"📝 تدريب موجه أثناء الدرس")}
  <section class="lesson-section"><h3>💡 المثال الأساسي</h3><div class="german-box">${escapeHtml(l.example).replaceAll("\n","<br>")}</div><button class="listen-btn" data-speak="${escapeHtml(l.example)}" data-lang="${currentCourse.id==="english"?"en-GB":"de-DE"}">▶ استمع إلى المثال</button></section>
  <section class="lesson-section"><h3>✍️ اختبار فهم الدرس</h3>${l.questions.map((q,i)=>`<div class="question" data-question="${i}"><p>${i+1}. ${escapeHtml(q.q)}</p>${q.options.map((o,j)=>`<label class="answer-option"><input type="radio" name="q${i}" value="${j}"> ${escapeHtml(o)}</label>`).join("")}<div class="feedback" id="feedback-${i}"></div></div>`).join("")}<button class="primary-btn" data-action="check-quiz">تصحيح الإجابات</button></section>
  ${renderTasks(l.homework,"🏠 الواجب المنزلي")}
  <section class="lesson-section chapter-navigation"><h3>التنقل بين فصول الكتاب</h3><p>الفصل ${currentCourse.lessons.findIndex(x=>x.id===l.id)+1} من ${currentCourse.lessons.length}</p><div class="action-row"><button class="secondary-btn" data-action="previous-lesson">الفصل السابق</button><button class="secondary-btn" data-action="next-lesson">الفصل التالي</button></div></section>
  <div class="action-row"><button class="primary-btn" data-action="complete-lesson">${isCompleted(l.id)?"✓ تم إكمال الدرس":"إنهاء الدرس وتسجيله"}</button><button class="secondary-btn" data-action="back-course">العودة إلى فهرس المادة</button></div>`;
}
async function ensureLanguageBank(){
 if(!languageBank){const r=await fetch('./data/language_bank.json');if(!r.ok)throw new Error('تعذر تحميل مكتبة اللغات');languageBank=await r.json();}
 return languageBank;
}
async function renderPhrases(){
 const bank=await ensureLanguageBank();
 content.innerHTML=`<div class="page-intro"><span class="eyebrow">LANGUAGE LAB · SPRACHLABOR</span><h1>مختبر اللغات</h1><p>مفردات وجمل ونصوص قراءة واستماع بالألمانية والإنجليزية مع ترجمة عربية ونطق صوتي.</p></div>
 <div class="language-choice"><button class="primary-btn" data-action="language-de">🇩🇪 تعلم الألمانية</button><button class="secondary-btn" data-action="language-en">🇬🇧 تعلم الإنجليزية</button></div>
 <div class="language-summary"><article><strong>${bank.de.vocabulary.length}</strong><span>مفردة ألمانية</span></article><article><strong>${bank.en.vocabulary.length}</strong><span>مفردة إنجليزية</span></article><article><strong>${bank.de.sentences.length}</strong><span>جملة ألمانية</span></article><article><strong>${bank.en.sentences.length}</strong><span>جملة إنجليزية</span></article></div>
 <div class="language-panels"><button class="language-panel" data-action="language-de"><b>Deutsch</b><span>Wortschatz · Sätze · Hören</span><small>المفردات والجمل والاستماع الألماني</small></button><button class="language-panel" data-action="language-en"><b>English</b><span>Vocabulary · Sentences · Listening</span><small>المفردات والجمل والاستماع الإنجليزي</small></button></div>`;
}
async function renderEnglishCourse(){
 setActive("english-school");
 content.innerHTML='<div class="empty-state"><h2>جارٍ تحميل منهج الإنجليزية</h2><p>نجهز المستويات والوحدات التعليمية…</p></div>';
 try{
  const response=await fetch("./data/english_course.json?v=1",{cache:"no-store"});
  if(!response.ok)throw new Error("HTTP "+response.status);
  const course=await response.json();
  let schoolCurriculum={levels:[]};
  try{const planResponse=await fetch("./data/english_school_curriculum.json?v=1",{cache:"no-store"});if(planResponse.ok)schoolCurriculum=await planResponse.json();}catch(error){console.warn("Extended English school plan unavailable:",error);}
  let activeLevel=course.levels[0].code;
  const draw=()=>{
   const level=course.levels.find(x=>x.code===activeLevel);
   const total=course.levels.reduce((n,x)=>n+x.units.length,0);
   content.innerHTML=`<section class="english-hero"><div class="english-hero-copy"><span class="english-kicker">ACADEMIC ENGLISH · CEFR A1–C2</span><h1>رحلتك الأكاديمية لإتقان الإنجليزية</h1><p>من أول كلمة إلى الاستخدام المتقدم بثقة. منهج متدرّج يجمع القواعد والمفردات والاستماع والقراءة والكتابة والمحادثة ضمن مسار تعلّم واضح.</p><div class="english-hero-meta"><span>6 مستويات معيارية</span><span>30 وحدة دراسية</span><span>4 مهارات لغوية</span></div></div><div class="english-hero-mark" aria-hidden="true"><b>EN</b><span>LEARN · GROW · MASTER</span></div></section>
   <section class="english-academic-panel"><span class="eyebrow">ACADEMIC PROGRAMME · CEFR</span><h2>${escapeHtml(course.academicProgram?.title||"البرنامج الأكاديمي")}</h2><p>${escapeHtml(course.academicProgram?.mission||"")}</p><div class="english-academic-grid"><article><b>1,100</b><span>ساعة تعلم تقديرية</span></article><article><b>6</b><span>مستويات متدرجة</span></article><article><b>30</b><span>مقرراً تعليمياً</span></article><article><b>4</b><span>مهارات لغوية</span></article></div><details class="english-exercise"><summary>سياسة القبول والتقييم والنجاح</summary><p><b>القبول:</b> ${escapeHtml(course.academicProgram?.admission||"")}</p><ul class="english-vocab-list">${(course.academicProgram?.assessmentPolicy||[]).map(x=>`<li>${escapeHtml(x.component)}: ${x.weight}%</li>`).join("")}</ul><ul class="english-vocab-list">${(course.academicProgram?.passRules||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></details><details class="english-exercise"><summary>المنهجية الأكاديمية والمراجع</summary><ul class="english-vocab-list">${(course.academicProgram?.methodology||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}${(course.academicProgram?.bibliography||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></details><p class="english-academic-note">${escapeHtml(course.academicProgram?.disclaimer||"")}</p></section>
   <div class="english-course-stats"><article><strong>${course.levels.length}</strong><span>مستويات CEFR</span></article><article><strong>${total}</strong><span>وحدة تعليمية</span></article><article><strong>${course.levels.reduce((n,x)=>n+(x.academic?.estimatedHours||0),0).toLocaleString("en-GB")}</strong><span>ساعة تعلم تقديرية</span></article><article><strong>4</strong><span>مهارات أساسية</span></article></div>
   <div class="english-level-navigation"><div class="english-navigation-heading"><span>مسار التدرّج الأكاديمي</span><small>اختر المستوى لعرض خطته ووحداته</small></div><div class="english-level-tabs">${course.levels.map(x=>`<button type="button" class="english-level-tab ${x.code===activeLevel?"active":""}" data-english-level="${x.code}"><b>${x.code}</b><small>${escapeHtml(x.name)}</small></button>`).join("")}</div></div>
   <section class="english-level-intro"><div><span class="eyebrow">CURRENT LEVEL · ${level.code}</span><h2>${level.code} · ${escapeHtml(level.name)}</h2><p>${escapeHtml(level.goal)}</p></div><span class="english-level-badge">${level.units.length} وحدات</span></section>
   <section class="english-academic-panel"><span class="eyebrow">LEVEL STUDY PLAN · ${level.code}</span><h3>الخطة الدراسية الأكاديمية للمستوى</h3><div class="english-academic-grid"><article><b>${level.academic?.estimatedHours||0}</b><span>ساعة تعلم تقديرية</span></article><article><b>${level.academic?.contactHoursPerWeek||0}</b><span>ساعات أسبوعية بإشراف</span></article><article><b>${level.academic?.independentStudyHoursPerWeek||0}</b><span>ساعات تعلم ذاتي أسبوعياً</span></article><article><b>70%</b><span>درجة النجاح المطلوبة</span></article></div><div class="english-semesters">${(level.academic?.semesters||[]).map(term=>`<article class="english-example"><b>${escapeHtml(term.name)}</b><p>المقررات: ${term.units.map(id=>{const u=level.units.find(x=>x.id===id);return u?escapeHtml(u.title):"";}).join(" · ")}</p><small>المشروع الفصلي: ${escapeHtml(term.capstone)}</small></article>`).join("")}</div><h4>مخرجات التعلم للمستوى</h4><ul class="english-vocab-list">${(level.academic?.learningOutcomes||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>
   <section class="english-level-intro"><div><span class="eyebrow">CEFR CAN-DO · ${level.code}</span><h3>ماذا ستتقن في نهاية المستوى؟</h3><p>${escapeHtml(level.cefrCanDo||"")}</p></div></section>
   ${(()=>{const plan=schoolCurriculum.levels?.find(x=>x.code===level.code);if(!plan)return "";return `<section class="english-school-calendar"><div class="english-school-calendar-head"><div><span class="english-kicker">12-WEEK SCHOOL TERM · ${level.code}</span><h3>الخطة المدرسية الموسعة — 12 أسبوعاً</h3><p>خطة فصلية منظمة بأهداف أسبوعية وحصص ومهام منزلية ونقاط تحقق وتقييمات.</p></div><div class="english-school-calendar-badge"><b>12</b><small>أسبوعاً</small></div></div><div class="english-school-assessment"><b>نظام التقييم:</b> أعمال فصلية ${plan.assessment.coursework}% · منتصف الفصل ${plan.assessment.midterm}% · ملف المهارات ${plan.assessment.skillsPortfolio}% · المشروع ${plan.assessment.project}% · النهائي ${plan.assessment.finalExam}% · النجاح ${plan.assessment.passMark}%</div><div class="english-school-weeks">${plan.weeklyPlan.map(w=>`<details class="english-school-week"><summary><span class="english-school-week-no">${String(w.week).padStart(2,"0")}</span><span><b>الأسبوع ${w.week}: ${escapeHtml(w.title)}</b><small>${w.lessons.length} حصص · ${w.checkpoint?escapeHtml(w.checkpoint):""}</small></span><i>＋</i></summary><div class="english-school-week-body"><h4>الأهداف التعليمية</h4><ul>${w.objectives.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul><div class="english-school-lesson-grid">${w.lessons.map(l=>`<article><small>${escapeHtml(l.day)} · ${escapeHtml(l.subject)}</small><b>${escapeHtml(l.focus)}</b><p>${escapeHtml(l.activity)}</p><span><strong>واجب:</strong> ${escapeHtml(l.homework)}</span></article>`).join("")}</div></div></details>`).join("")}</div><div class="english-school-projects"><h4>المشاريع الفصلية</h4><div>${plan.projects.map(p=>`<article><b>${escapeHtml(p.title)}</b><p>${escapeHtml(p.description)}</p></article>`).join("")}</div><h4>شروط الانتقال للمستوى التالي</h4><ul>${plan.promotionCriteria.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div></section>`;})()}

   <section class="english-lesson-block"><h4>اختبار الانتقال إلى المستوى التالي · Exit assessment</h4><ul class="english-vocab-list">${Object.entries(level.exitAssessment||{}).map(([k,v])=>`<li><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</li>`).join("")}</ul></section>
   <section class="english-placement-card" id="englishPlacement"><div class="english-placement-heading"><div><span class="english-kicker">ACADEMIC ENTRY ASSESSMENT</span><h3>اختبار تحديد المستوى الأكاديمي</h3><p>اختبار تشخيصي من 24 سؤالاً يغطي المستويات A1 إلى C2. يساعدك على اختيار نقطة البداية المناسبة قبل متابعة المنهج.</p></div><div class="english-placement-count"><b>24</b><span>سؤالاً</span></div></div><div class="english-placement-actions"><button type="button" class="english-placement-start" id="englishPlacementStart">ابدأ اختبار تحديد المستوى</button><span>الوقت المقترح: 20–30 دقيقة · اختر إجابة واحدة لكل سؤال</span></div><div id="englishPlacementBody" hidden></div><div id="englishPlacementResult" aria-live="polite"></div></section>
   <section class="english-school-books"><div class="english-school-books-heading"><span class="english-kicker">EXTENDED B1 / B2 WORKBOOKS</span><h3>كتب التمارين الموسّعة B1 وB2</h3><p>الكتب مدمجة هنا داخل الأكاديمية؛ اختر المستوى وانتقل بين الدروس دون مغادرة صفحة المدرسة.</p></div><iframe class="english-school-workbook-frame" title="كتب التمارين الموسعة B1 وB2" src="./levels.html?embed=1&amp;level=B1" loading="lazy"></iframe></section>
   <div class="english-learning-guide"><h3>كيف تدرس هذا المستوى؟</h3><p>ابدأ بالشرح، اقرأ الأمثلة الإنجليزية وترجمتها، استمع إلى الجمل باستخدام زر النطق، ثم نفّذ التدريب الكتابي والشفهي. افتح الحل بعد أن تحاول بنفسك.</p></div>
   <div class="english-unit-tools"><label for="englishUnitSearch">ابحث داخل وحدات ${level.code}</label><input id="englishUnitSearch" type="search" placeholder="اكتب اسم الوحدة أو موضوعها..." autocomplete="off"><span id="englishUnitCount">${level.units.length} وحدات دراسية</span></div><div class="english-units">${level.units.map((u,i)=>`<details class="english-unit" data-unit-search="${escapeHtml((u.title+" "+u.englishTitle+" "+u.overview).toLowerCase())}" ${i===0?"open":""}><summary><span class="english-unit-number">${String(i+1).padStart(2,"0")}</span><span class="english-unit-heading"><b>${escapeHtml(u.title)}</b><small>${escapeHtml(u.englishTitle)}</small></span><span class="english-unit-chevron">＋</span></summary>
   <div class="english-unit-content"><div class="english-academic-module"><b>${escapeHtml(u.academicModule?.moduleCode||"")}</b><span>مقرر أكاديمي · ${u.academicModule?.contactHours||0} ساعة بإشراف · ${u.academicModule?.independentHours||0} ساعة تعلم ذاتي</span><p>المتطلبات السابقة: ${escapeHtml(u.academicModule?.prerequisites||"")}</p><h4>مخرجات المقرر</h4><ul class="english-vocab-list">${(u.academicModule?.outcomes||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul><h4>التقييم التكويني والختامي</h4><ul class="english-vocab-list">${(u.academicModule?.formativeAssessment||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}<li>${escapeHtml(u.academicModule?.summativeAssessment||"")}</li></ul><p><b>التكليف المستقل:</b> ${escapeHtml(u.academicModule?.independentAssignment||"")}</p></div><p class="english-overview">${escapeHtml(u.overview)}</p>
   <section class="english-lesson-block"><h4>1. القاعدة والشرح · Grammar</h4><p>${escapeHtml(u.grammar)}</p><p class="english-grammar-note">${escapeHtml(u.grammarNote)}</p></section>
   <section class="english-lesson-block"><h4>التفصيل الكامل للقواعد · Grammar syllabus</h4><div class="english-grammar-topics">${(u.grammarSyllabus||[]).map(g=>`<article class="english-example"><b>${escapeHtml(g.lesson)}</b><p>${escapeHtml(g.focus)}</p><small>${escapeHtml(g.practice)}</small></article>`).join("")}</div></section>
   <section class="english-lesson-block"><h4>مفردات إضافية موسعة · Extended vocabulary</h4><div class="english-vocab-list">${(u.expandedVocabulary||[]).map(w=>`<li><b lang="en">${escapeHtml(w.term)}</b> — ${escapeHtml(w.meaning)} <button type="button" class="listen-btn" data-speak="${escapeHtml(w.term)}" data-lang="en-GB">🔊</button></li>`).join("")}</div></section>
   <section class="english-lesson-block"><h4>خطة الدراسة الأسبوعية · Weekly lesson plan</h4><ol class="english-lesson-sequence">${(u.weeklyLessons||[]).map(x=>`<li><b>${escapeHtml(x.day)} · ${escapeHtml(x.focus)}:</b> ${escapeHtml(x.work)}</li>`).join("")}</ol></section>
   <section class="english-lesson-block"><h4>الحصص المدرسية التفصيلية · Classroom lesson plans</h4><div class="english-grammar-topics">${(u.schoolLessons||[]).map(x=>`<article class="english-example"><b>الأسبوع ${x.week} · الحصة ${x.lesson}: ${escapeHtml(x.title)}</b><p><b>المهارة:</b> ${escapeHtml(x.skill)}</p><ul class="english-vocab-list">${x.objectives.map(o=>`<li>${escapeHtml(o)}</li>`).join("")}</ul><p>${escapeHtml(x.teaching)}</p><b>أنشطة الصف</b><ol class="english-lesson-sequence">${x.activities.map(a=>`<li>${escapeHtml(a)}</li>`).join("")}</ol><p><b>الواجب المنزلي:</b> ${escapeHtml(x.homework)}</p><small><b>تذكرة الخروج:</b> ${escapeHtml(x.exitTicket)}</small></article>`).join("")}</div></section>
   <section class="english-lesson-block"><h4>تدريب الاستماع والفهم · Listening comprehension</h4><p>${escapeHtml(u.listeningPractice?.instruction||"")}</p><ol class="english-lesson-sequence">${(u.listeningPractice?.questions||[]).map(q=>`<li><b>${escapeHtml(q.q)}</b><p>${escapeHtml(q.a)}</p></li>`).join("")}</ol></section>
   <section class="english-lesson-block"><h4>أهداف التعلم · Learning objectives</h4><ul class="english-vocab-list">${(u.learningObjectives||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>
   <section class="english-lesson-block"><h4>خطة تنفيذ الدرس · Lesson sequence</h4><ol class="english-lesson-sequence">${(u.lessonSequence||[]).map(x=>`<li><b>${escapeHtml(x.step)}:</b> ${escapeHtml(x.task)}</li>`).join("")}</ol></section>
   <section class="english-lesson-block"><h4>أخطاء شائعة يجب تجنبها · Common mistakes</h4><ul class="english-vocab-list">${(u.commonMistakes||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>
   <section class="english-lesson-block"><h4>2. أمثلة مترجمة · Examples</h4>${u.examples.map(ex=>`<div class="english-example"><p lang="en">${escapeHtml(ex.en)}</p><span>${escapeHtml(ex.ar)}</span><button type="button" class="listen-btn" data-speak="${escapeHtml(ex.en)}" data-lang="en-GB">🔊 استمع</button></div>`).join("")}</section>
   <section class="english-lesson-block"><h4>3. المفردات الأساسية · Vocabulary</h4><ul class="english-vocab-list">${u.vocabulary.map(w=>`<li>${escapeHtml(w)}</li>`).join("")}</ul></section>
   <section class="english-lesson-block"><h4>4. القراءة والفهم · Reading</h4><div class="english-reading"><p lang="en">${escapeHtml(u.reading)}</p><button type="button" class="listen-btn" data-speak="${escapeHtml(u.reading)}" data-lang="en-GB">▶ استمع إلى النص</button><details><summary>عرض الترجمة العربية</summary><p>${escapeHtml(u.translation)}</p></details></div></section>
   <section class="english-lesson-block"><h4>5. المحادثة · Speaking</h4><p>${escapeHtml(u.speaking)}</p><div class="english-task-tip">سجّل إجابتك بصوتك، ثم أعد الاستماع وصحح النطق وترتيب الجمل.</div></section>
   <section class="english-lesson-block"><h4>6. الكتابة · Writing</h4><p>${escapeHtml(u.writing)}</p></section>
   <section class="english-lesson-block"><h4>7. تمارين تطبيقية · Practice</h4>${u.practice.map((p,j)=>`<details class="english-exercise"><summary>تمرين ${j+1}: ${escapeHtml(p.question)}</summary><p>${escapeHtml(p.answer)}</p></details>`).join("")}</section>
   <section class="english-lesson-block"><h4>اختبار الوحدة الشامل · Unit examination</h4>${(u.unitExam||[]).map((q,j)=>`<details class="english-exercise"><summary>${j+1}. ${escapeHtml(q.type)} — ${escapeHtml(q.q)}</summary><p>${escapeHtml(q.a)}</p></details>`).join("")}</section>
   <section class="english-lesson-block"><h4>سلم تقييم الإتقان · Mastery rubric</h4><ul class="english-vocab-list">${(u.masteryRubric||[]).map(r=>`<li><b>${escapeHtml(r.criterion)} (${r.weight}%)</b> — ${escapeHtml(r.description)}</li>`).join("")}</ul></section>
   <div class="english-assessment"><b>معيار إتقان الوحدة</b><p>${escapeHtml(u.assessment)}</p></div></div></details>`).join("")}</div>
   <section class="english-study-plan"><h3>خطة مذاكرة مقترحة</h3><ol><li>اليوم الأول: فهم القاعدة وكتابة أمثلة من عندك.</li><li>اليوم الثاني: حفظ المفردات ضمن جمل، لا كقائمة منفصلة.</li><li>اليوم الثالث: قراءة النص والاستماع إليه وتلخيصه.</li><li>اليوم الرابع: محادثة قصيرة وتسجيل صوتي.</li><li>اليوم الخامس: كتابة المهمة ومراجعة الأخطاء.</li><li>اليوم السادس: حل التدريبات دون فتح الحلول.</li><li>اليوم السابع: مراجعة شاملة واختبار ذاتي قبل الانتقال.</li></ol></section>`;
   content.querySelectorAll("[data-english-level]").forEach(button=>button.addEventListener("click",()=>{activeLevel=button.dataset.englishLevel;draw();window.scrollTo({top:0,behavior:"smooth"});}));
   const placementQuestions=[
    {level:"A1",q:"Choose the correct sentence.",o:["She are a teacher.","She is a teacher.","She be a teacher."],a:1,e:"نستخدم is مع she."},
    {level:"A1",q:"I ___ from Syria.",o:["am","is","are"],a:0,e:"مع I نستخدم am."},
    {level:"A1",q:"What is the plural of “book”?",o:["bookes","books","bookies"],a:1,e:"غالباً نضيف s لجمع الاسم."},
    {level:"A1",q:"Choose the correct question.",o:["Where you live?","Where does you live?","Where do you live?"],a:2,e:"مع you نستخدم do في السؤال بالمضارع البسيط."},
    {level:"A2",q:"Yesterday, we ___ to the cinema.",o:["go","went","gone"],a:1,e:"الماضي من go هو went."},
    {level:"A2",q:"There isn't ___ milk in the fridge.",o:["some","many","any"],a:2,e:"تستخدم any غالباً في النفي."},
    {level:"A2",q:"This book is ___ than that one.",o:["interesting","more interesting","most interesting"],a:1,e:"المقارنة للصفة الطويلة تكون more + adjective."},
    {level:"A2",q:"I've lived here ___ 2022.",o:["for","since","during"],a:1,e:"since تأتي مع نقطة بداية زمنية."},
    {level:"B1",q:"If it rains, we ___ at home.",o:["stay","will stay","would stayed"],a:1,e:"الشرط الأول: If + present, will + base verb."},
    {level:"B1",q:"The email ___ yesterday.",o:["sent","was sent","has send"],a:1,e:"المبني للمجهول بالماضي: was/were + past participle."},
    {level:"B1",q:"She asked me where I ___.",o:["live","lived","do live"],a:1,e:"في الكلام المنقول نرجع الزمن عادة خطوة إلى الوراء."},
    {level:"B1",q:"I look forward to ___ from you.",o:["hear","hearing","heard"],a:1,e:"بعد look forward to نستخدم gerund."},
    {level:"B2",q:"By the time we arrived, the film ___.",o:["started","has started","had started"],a:2,e:"الماضي التام يصف حدثاً سبق حدثاً آخر في الماضي."},
    {level:"B2",q:"Were I you, I ___ the offer.",o:["would accept","will accept","accepted"],a:0,e:"هذا قلب في الشرط الثاني: Were I you = If I were you."},
    {level:"B2",q:"The report, ___ was published last week, caused debate.",o:["who","which","where"],a:1,e:"which يعود على الأشياء في الجملة الوصفية."},
    {level:"B2",q:"You ___ have told me; I already knew.",o:["mustn't","needn't","couldn't"],a:1,e:"needn't have + past participle تعني أن الفعل لم يكن ضرورياً."},
    {level:"C1",q:"Hardly ___ the meeting begun when the power failed.",o:["had","has","did"],a:0,e:"بعد Hardly في بداية الجملة يحدث قلب: Hardly had..." },
    {level:"C1",q:"The proposal was rejected, ___ its apparent merits.",o:["although","despite","whereas"],a:1,e:"despite يتبعها اسم أو gerund."},
    {level:"C1",q:"Her argument is persuasive, but it rests on a ___ assumption.",o:["flimsy","flimsily","flimsiness"],a:0,e:"نحتاج صفة قبل assumption؛ flimsy تعني ضعيفاً أو واهياً."},
    {level:"C1",q:"No sooner ___ the announcement made than markets reacted.",o:["was","had","has"],a:0,e:"No sooner was the announcement made than... صيغة المبني للمجهول مع القلب."},
    {level:"C2",q:"Choose the most precise meaning of “to obviate”.",o:["To make unnecessary","To exaggerate","To postpone indefinitely"],a:0,e:"obviate تعني إزالة الحاجة إلى شيء أو تجنبه."},
    {level:"C2",q:"Were it not for her intervention, the deal ___ through.",o:["would not have gone","will not go","had not gone"],a:0,e:"شرط مختلط/افتراضي للماضي: would not have + past participle."},
    {level:"C2",q:"His account was so ___ that even experts struggled to follow it.",o:["opaque","transparent","unequivocal"],a:0,e:"opaque مجازياً تعني غامضاً أو صعب الفهم."},
    {level:"C2",q:"The findings are compelling; ___, they do not establish causation.",o:["moreover","nevertheless","consequently"],a:1,e:"nevertheless تقدم تناقضاً أو تحفظاً مع الفكرة السابقة."}
   ];
   const placementBody=content.querySelector("#englishPlacementBody");
   const placementResult=content.querySelector("#englishPlacementResult");
   content.querySelector("#englishPlacementStart")?.addEventListener("click",()=>{
    placementResult.innerHTML="";
    placementBody.hidden=false;
    placementBody.innerHTML=`<form id="englishPlacementForm"><div class="english-placement-progress"><span>أجب عن جميع الأسئلة ثم أرسل الاختبار</span><b>24 سؤالاً · 6 مستويات</b></div>${placementQuestions.map((q,i)=>`<fieldset class="english-placement-question"><legend><span>${q.level} · ${i+1}/24</span>${q.q}</legend><div>${q.o.map((option,j)=>`<label><input type="radio" name="placement-${i}" value="${j}"><span>${option}</span></label>`).join("")}</div><small class="english-placement-feedback" id="placement-feedback-${i}" hidden></small></fieldset>`).join("")}<button class="english-placement-submit" type="submit">تصحيح الاختبار وإظهار النتيجة</button></form>`;
    placementBody.scrollIntoView({behavior:"smooth",block:"start"});
    content.querySelector("#englishPlacementForm").addEventListener("submit",event=>{
     event.preventDefault();
     const form=event.currentTarget;
     const missing=placementQuestions.findIndex((q,i)=>!form.querySelector(`input[name="placement-${i}"]:checked`));
     if(missing!==-1){const target=form.querySelectorAll(".english-placement-question")[missing];target.scrollIntoView({behavior:"smooth",block:"center"});target.classList.add("needs-answer");return;}
     const scores={A1:0,A2:0,B1:0,B2:0,C1:0,C2:0};
     placementQuestions.forEach((q,i)=>{const selected=Number(form.querySelector(`input[name="placement-${i}"]:checked`).value);const correct=selected===q.a;if(correct)scores[q.level]++;const feedback=form.querySelector(`#placement-feedback-${i}`);feedback.hidden=false;feedback.textContent=(correct?"صحيح ✓ ":"الإجابة الصحيحة: "+q.o[q.a]+" — ")+q.e;feedback.classList.toggle("is-correct",correct);});
     Object.entries(scores).forEach(([level,score])=>saveScore("english-placement-"+level,score));
     const order=["A1","A2","B1","B2","C1","C2"];let placed="A1",passed=true;
     for(const level of order){if(passed&&scores[level]>=3)placed=level;else if(scores[level]<3)passed=false;}
     const total=Object.values(scores).reduce((n,v)=>n+v,0);
     const percentage=Math.round(total/24*100);
     const advice=placed==="A1"?"ابدأ من A1 لبناء الأساس خطوة بخطوة.":`ابدأ من ${placed}، وراجع موضوعات المستوى السابق عند الحاجة.`;
     placementResult.innerHTML=`<div class="english-placement-result"><span class="english-kicker">YOUR DIAGNOSTIC RESULT</span><h4>مستوى البداية المقترح</h4><strong>${placed}</strong><p>${advice}</p><div class="english-placement-total">${total} من 24 إجابة صحيحة · ${percentage}%</div><div class="english-placement-breakdown">${order.map(level=>`<div><span>${level}</span><b>${scores[level]}/4</b><i><em style="width:${scores[level]*25}%"></em></i></div>`).join("")}</div><small>هذا اختبار تشخيصي داخلي لتوجيه نقطة البداية، وليس اختبار CEFR رسمياً أو شهادة معتمدة. احفظت درجات المستويات في سجل تقدم حسابك.</small><button type="button" id="englishPlacementReview">مراجعة الإجابات</button></div>`;
     form.querySelectorAll("input").forEach(input=>input.disabled=true);
     form.querySelector(".english-placement-submit").disabled=true;
     content.querySelector("#englishPlacementReview")?.addEventListener("click",()=>{placementBody.scrollIntoView({behavior:"smooth",block:"start"});});
     placementResult.scrollIntoView({behavior:"smooth",block:"center"});
    });
   });
   const savedPlacement=Object.fromEntries(["A1","A2","B1","B2","C1","C2"].map(level=>[level,getProgress().scores["english-placement-"+level]]).filter(([,score])=>Number.isFinite(score)));
   if(Object.keys(savedPlacement).length===6){const total=Object.values(savedPlacement).reduce((n,v)=>n+v,0);placementResult.innerHTML=`<div class="english-placement-saved">آخر نتيجة محفوظة: ${total}/24 · ${Math.round(total/24*100)}% <span>يمكنك إعادة الاختبار في أي وقت.</span></div>`;}
   const unitSearch=content.querySelector("#englishUnitSearch");
   unitSearch?.addEventListener("input",()=>{const query=unitSearch.value.trim().toLocaleLowerCase();let visible=0;content.querySelectorAll(".english-unit").forEach(unit=>{const match=unit.dataset.unitSearch.includes(query);unit.hidden=!match;if(match)visible++;});const count=content.querySelector("#englishUnitCount");if(count)count.textContent=`${visible} من ${level.units.length} وحدات`;});
  };
  draw();
  // Student services layer for the English school programme.
  let ss={};
  const schoolSync=await connectEnglishSchoolSync(currentStudentId,remote=>{ss=remote;const active=hub.querySelector("[data-st].active")?.dataset.st||"profile";renderSchool(active);notify("تمت مزامنة بياناتك من جهاز آخر.");});
  ss=schoolSync.state;
  const saveSchool=()=>{schoolSync.save(ss).catch(error=>{console.error("English school sync failed:",error);notify("تعذر الحفظ السحابي. تحقق من الاتصال.");});};
  window.addEventListener("english-school-sync-error",event=>notify("فشل الحفظ في قاعدة البيانات: "+event.detail));
  const hub=document.createElement("section");hub.className="english-school-hub";
  hub.innerHTML='<span class="english-kicker">ENGLISH SCHOOL · STUDENT SERVICES</span><h2>النظام المدرسي وإدارة الدراسة</h2><p>ملف الطالب والجدول والواجبات والامتحانات والعلامات والحضور والتقرير الدراسي.</p><nav class="english-school-tabs"><button data-st="profile">ملف الطالب</button><button data-st="timetable">الجدول</button><button data-st="tasks">الواجبات</button><button data-st="grades">العلامات</button><button data-st="attendance">الحضور</button><button data-st="report">التقرير</button></nav><div id="englishSchoolPanel"></div>';
  const placement=content.querySelector("#englishPlacement");if(placement)placement.insertAdjacentElement("beforebegin",hub);else content.prepend(hub);
  const panel=hub.querySelector("#englishSchoolPanel");
  const renderSchool=tab=>{
   const tasks=ss.tasks||[],grades=ss.grades||[],att=ss.att||[];
   if(tab==="profile")panel.innerHTML='<form id="schoolProfile" class="english-school-form"><label>اسم الطالب<input name="name" value="'+escapeHtml(ss.name||"")+'" required></label><label>الرقم الدراسي<input name="number" value="'+escapeHtml(ss.number||"")+'"></label><label>الشعبة<input name="className" value="'+escapeHtml(ss.className||"English A1")+'"></label><label>العام الدراسي<input name="year" value="'+escapeHtml(ss.year||"2026–2027")+'"></label><button class="primary-btn">حفظ الملف</button></form>';
   if(tab==="timetable")panel.innerHTML='<table class="english-school-table"><thead><tr><th>اليوم</th><th>الوقت</th><th>المادة</th></tr></thead><tbody>'+[["الأحد","09:00","القواعد"],["الأحد","10:00","المفردات"],["الاثنين","09:00","القراءة"],["الاثنين","10:00","الاستماع"],["الثلاثاء","09:00","المحادثة"],["الثلاثاء","10:00","الكتابة"],["الأربعاء","09:00","المشروع"],["الخميس","09:00","المراجعة والاختبار"]].map(r=>"<tr>"+r.map(x=>"<td>"+x+"</td>").join("")+"</tr>").join("")+'</tbody></table><p class="english-school-note">جدول أسبوعي مقترح للتعلم الذاتي.</p>';
   if(tab==="tasks")panel.innerHTML='<form id="schoolTask" class="english-school-form"><label>الواجب أو المشروع<input name="title" required placeholder="عنوان الواجب"></label><label>موعد التسليم<input name="due" type="date"></label><button class="primary-btn">إضافة</button></form><div class="english-school-records">'+tasks.map((t,n)=>'<label><input type="checkbox" data-task="'+n+'" '+(t.done?"checked":"")+'><span>'+escapeHtml(t.title)+' <small>'+escapeHtml(t.due||"بلا موعد")+'</small></span></label>').join("")+'</div>';
   if(tab==="grades")panel.innerHTML='<form id="schoolGrade" class="english-school-form"><label>اسم الاختبار<input name="title" required placeholder="اختبار الوحدة"></label><label>العلامة من 100<input name="score" type="number" min="0" max="100" required></label><button class="primary-btn">حفظ النتيجة</button></form><div class="english-school-records">'+grades.map(g=>'<div><b>'+escapeHtml(g.title)+'</b><strong>'+g.score+'%</strong></div>').join("")+'</div>';
   if(tab==="attendance")panel.innerHTML='<form id="schoolAtt" class="english-school-form"><label>التاريخ<input name="date" type="date" required></label><label>الحالة<select name="status"><option>حاضر</option><option>غائب</option><option>متأخر</option><option>غياب بعذر</option></select></label><button class="primary-btn">تسجيل الحضور</button></form><div class="english-school-records">'+att.map(x=>'<div>'+escapeHtml(x.date)+' — '+escapeHtml(x.status)+'</div>').join("")+'</div>';
   if(tab==="report"){const avg=grades.length?Math.round(grades.reduce((n,x)=>n+Number(x.score),0)/grades.length):0;panel.innerHTML='<div class="english-school-report"><h3>كشف متابعة الطالب</h3><p>الاسم: <b>'+escapeHtml(ss.name||"غير محدد")+'</b> · الشعبة: '+escapeHtml(ss.className||"—")+'</p><strong>'+avg+'%</strong><p>متوسط العلامات · '+tasks.filter(x=>x.done).length+' واجب مكتمل من '+tasks.length+' · '+att.length+' سجلات حضور</p><button id="schoolPrint" class="secondary-btn">طباعة التقرير</button><small>تقرير ذاتي وليس شهادة رسمية معتمدة.</small></div>';}
   let profileAutoSaveTimer=null;panel.querySelector("#schoolProfile")?.addEventListener("input",e=>{const field=e.target;if(!field.name)return;ss[field.name]=field.value;clearTimeout(profileAutoSaveTimer);profileAutoSaveTimer=setTimeout(()=>saveSchool(),850);});panel.querySelector("#schoolProfile")?.addEventListener("submit",e=>{e.preventDefault();Object.assign(ss,Object.fromEntries(new FormData(e.currentTarget)));saveSchool();notify("تم حفظ ملف الطالب ومزامنته.");});
   panel.querySelector("#schoolTask")?.addEventListener("submit",e=>{e.preventDefault();const d=new FormData(e.currentTarget);ss.tasks=[...tasks,{title:d.get("title"),due:d.get("due"),done:false}];saveSchool();renderSchool("tasks");});
   panel.querySelectorAll("[data-task]").forEach(c=>c.addEventListener("change",()=>{ss.tasks[Number(c.dataset.task)].done=c.checked;saveSchool();renderSchool("tasks");}));
   panel.querySelector("#schoolGrade")?.addEventListener("submit",e=>{e.preventDefault();const d=new FormData(e.currentTarget);ss.grades=[...grades,{title:d.get("title"),score:Number(d.get("score"))}];saveSchool();renderSchool("grades");});
   panel.querySelector("#schoolAtt")?.addEventListener("submit",e=>{e.preventDefault();const d=new FormData(e.currentTarget);ss.att=[...att,{date:d.get("date"),status:d.get("status")}];saveSchool();renderSchool("attendance");});
   panel.querySelector("#schoolPrint")?.addEventListener("click",()=>window.print());
  };
  hub.querySelectorAll("[data-st]").forEach(b=>b.addEventListener("click",()=>{hub.querySelectorAll("[data-st]").forEach(x=>x.classList.toggle("active",x===b));renderSchool(b.dataset.st)}));
  hub.querySelector("[data-st=profile]").classList.add("active");renderSchool("profile");
 }catch(error){content.innerHTML='<div class="empty-state"><h2>تعذر تحميل منهج الإنجليزية</h2><p>'+escapeHtml(error.message)+'</p></div>';}
}
async function renderLanguage(lang){
 setActive(lang==="de" ? "language-de" : "language-en");
 const bank=await ensureLanguageBank(), d=bank[lang], code=lang==='de'?'de-DE':'en-GB', title=lang==='de'?'الألمانية':'الإنجليزية';
 content.innerHTML=`<div class="page-intro"><span class="eyebrow">${lang==='de'?'DEUTSCH':'ENGLISH'} · LANGUAGE WORKBOOK</span><h1>كتاب ${title} التفاعلي</h1><p>مفردات وجمل يومية بمستويات A1 إلى B2، ونصوص قراءة واستماع متدرجة مع ترجمة عربية. تظهر درجة كل كلمة وجملة، ويمكنك الاستماع إليها ومراجعة معناها.</p></div>
 <div class="language-toolbar"><button class="secondary-btn" data-action="phrases">العودة إلى مختبر اللغات</button><button class="secondary-btn" data-action="stop-audio">■ إيقاف الاستماع</button><span>${d.vocabulary.length} كلمة · ${d.sentences.length} جملة · ${d.texts.length} نصوص استماع</span></div>

 <section class="language-section"><div class="section-heading"><div><span class="eyebrow">TOPICS / THEMEN</span><h2>مواضيع اللغة (${(d.topics||[]).length})</h2></div></div><div class="topic-grid">${(d.topics||[]).map((t,i)=>`<article class="topic-card"><small>TOPIC ${i+1}</small><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.description)}</p><ul>${t.items.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></article>`).join("")}</div></section>
 ${lang==="de" ? `<section class="language-section"><h2>الجمع في اللغة الألمانية · Plural</h2><p>أداة التعريف في الجمع هي غالباً die. لا توجد قاعدة واحدة؛ احفظ صيغة الجمع مع الاسم.</p><table class="plural-table"><tr><th>المفرد</th><th>الجمع</th><th>المعنى</th></tr><tr><td>der Tisch</td><td>die Tische</td><td>طاولة / طاولات</td></tr><tr><td>das Kind</td><td>die Kinder</td><td>طفل / أطفال</td></tr><tr><td>die Frau</td><td>die Frauen</td><td>امرأة / نساء</td></tr><tr><td>das Auto</td><td>die Autos</td><td>سيارة / سيارات</td></tr><tr><td>der Apfel</td><td>die Äpfel</td><td>تفاحة / تفاح</td></tr></table><button class="listen-btn" data-speak="Der Tisch, die Tische. Das Kind, die Kinder. Die Frau, die Frauen. Das Auto, die Autos. Der Apfel, die Äpfel." data-lang="de-DE">▶ استمع إلى أمثلة الجمع</button></section>` : `<section class="language-section"><h2>الجمع في اللغة الإنجليزية · Plurals</h2><p>غالباً نضيف s، ونضيف es لبعض النهايات مثل s وsh وch وx. توجد جموع شاذة يجب حفظها.</p><table class="plural-table"><tr><th>Singular</th><th>Plural</th><th>المعنى</th></tr><tr><td>book</td><td>books</td><td>كتاب / كتب</td></tr><tr><td>bus</td><td>buses</td><td>حافلة / حافلات</td></tr><tr><td>city</td><td>cities</td><td>مدينة / مدن</td></tr><tr><td>child</td><td>children</td><td>طفل / أطفال</td></tr><tr><td>man</td><td>men</td><td>رجل / رجال</td></tr><tr><td>woman</td><td>women</td><td>امرأة / نساء</td></tr><tr><td>person</td><td>people</td><td>شخص / أشخاص</td></tr></table><button class="listen-btn" data-speak="One book, two books. One bus, two buses. One city, two cities. One child, two children. One person, many people." data-lang="en-GB">▶ Listen to plural examples</button></section>`}
 <section class="language-section"><div class="section-heading"><div><span class="eyebrow">WORTSCHATZ / VOCABULARY</span><h2>المفردات (${d.vocabulary.length})</h2></div></div><input class="language-search" id="vocabSearch" placeholder="ابحث عن كلمة أو معناها بالعربية..."/><div class="vocab-grid" id="vocabGrid">${d.vocabulary.map((v,i)=>`<article class="vocab-card" data-search="${escapeHtml((v[0]+' '+v[1]).toLowerCase())}"><small>${String(i+1).padStart(3,'0')} · ${escapeHtml(v[2]||"Grundwortschatz")}</small><strong lang="${lang}">${escapeHtml(v[0])}</strong><span>${escapeHtml(v[1])}</span><button class="listen-small" data-speak="${escapeHtml(v[0])}" data-lang="${code}">🔊</button></article>`).join('')}</div></section>
 <section class="language-section"><div class="section-heading"><div><span class="eyebrow">PRAKTISCHE SÄTZE / USEFUL SENTENCES</span><h2>الجمل العملية (${d.sentences.length})</h2></div></div><div class="sentence-grid">${d.sentences.map((v,i)=>`<article class="sentence-card"><small>${String(i+1).padStart(2,'0')} · ${escapeHtml(v[2]||"Alltag")}</small><p lang="${lang}">${escapeHtml(v[0])}</p><span>${escapeHtml(v[1])}</span><button class="listen-btn" data-speak="${escapeHtml(v[0])}" data-lang="${code}">🔊 استمع للجملة</button></article>`).join('')}</div></section>
 <section class="language-section"><div class="section-heading"><div><span class="eyebrow">HÖRVERSTEHEN / LISTENING</span><h2>نصوص القراءة والاستماع</h2></div></div><div class="listening-grid">${d.texts.map((t,i)=>`<article class="listening-card"><div class="listening-head"><small>TEXT ${i+1}</small><h3>${escapeHtml(t.title)}</h3></div><p class="listening-text" lang="${lang}">${escapeHtml(t.text)}</p><div class="action-row"><button class="listen-btn" data-speak="${escapeHtml(t.text)}" data-lang="${code}">▶ استمع للنص كاملاً</button><button class="secondary-btn" data-action="toggle-translation" data-target="translation-${lang}-${i}">إظهار الترجمة</button></div><p class="translation" id="translation-${lang}-${i}" hidden>${escapeHtml(t.translation)}</p></article>`).join('')}</div></section>`;
 const search=document.querySelector('#vocabSearch');search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();document.querySelectorAll('.vocab-card').forEach(card=>card.hidden=!card.dataset.search.includes(q));});
}


let intensiveGermanCache = null;
async function renderIntensiveLevel(level) {
  setActive("intensive-" + level.toLowerCase());
  pageTitle.textContent = "الألمانية المكثفة " + level;
  content.innerHTML = '<div class="empty-state"><h2>جارٍ تحميل دروس ' + level + '</h2><p>نجهز النصوص والمفردات والتدريبات...</p></div>';
  try {
    if (!intensiveGermanCache) {
      const response = await fetch("./data/intensive_german.json?v=20261109-1");
      if (!response.ok) throw new Error("HTTP " + response.status);
      intensiveGermanCache = await response.json();
    }
    const units = intensiveGermanCache[level] || [];
    const wordCount = units.reduce((n,u)=>n+u.v.length,0);
    const sentenceCount = units.reduce((n,u)=>n+u.s.length,0);
    content.innerHTML = `
      <div class="page-intro"><span class="eyebrow">DEUTSCH INTENSIV · ${level}</span><h1>الألمانية المكثفة ${level}</h1><p>مسار مستقل ومتدرج لتطوير القراءة والاستماع والمفردات والقواعد والكتابة والمحادثة.</p></div>
      <section class="stats-grid">
        <article class="stat-card"><span class="stat-icon gold">▤</span><div><small>الوحدات المكثفة</small><strong>${units.length}</strong></div></article>
        <article class="stat-card"><span class="stat-icon blue">A</span><div><small>المفردات</small><strong>${wordCount}</strong></div></article>
        <article class="stat-card"><span class="stat-icon green">“</span><div><small>الجمل العملية</small><strong>${sentenceCount}</strong></div></article>
        <article class="stat-card"><span class="stat-icon purple">▶</span><div><small>نصوص القراءة</small><strong>${units.length}</strong></div></article>
      </section>
      <div class="language-toolbar"><button class="secondary-btn" data-action="intensive-switch" data-level="${level==="B1"?"B2":"B1"}">الانتقال إلى مستوى ${level==="B1"?"B2":"B1"} ←</button><button class="secondary-btn" data-action="stop-audio">■ إيقاف الاستماع</button></div>
      <div class="topic-grid">${units.map((u,i)=>`<article class="topic-card"><small>${level} · EINHEIT ${String(i+1).padStart(2,"0")}</small><h3>${escapeHtml(u.title)}</h3><p>${escapeHtml(u.de)}</p><button class="mini-btn" data-action="intensive-open" data-unit="${i}">افتح الوحدة ↓</button></article>`).join("")}</div>
      ${units.map((u,i)=>`
        <section class="language-section" id="intensive-unit-${i}">
          <div class="section-heading"><div><span class="eyebrow">${level} · LEKTION ${i+1}</span><h2>${escapeHtml(u.title)}</h2><p>${escapeHtml(u.de)}</p></div></div>
          <article class="panel" style="padding:20px">
            <h3>Lesetext · نص القراءة</h3>
            <p lang="de" style="direction:ltr;text-align:left;line-height:2;font-size:1.05rem">${escapeHtml(u.text)}</p>
            <div class="action-row"><button class="listen-btn" data-speak="${escapeHtml(u.text)}" data-lang="de-DE">▶ استمع إلى النص الألماني</button><button class="secondary-btn" data-action="intensive-translation" data-unit="${i}">إظهار الترجمة العربية</button></div>
            <p id="intensive-translation-${i}" class="translation" hidden>${escapeHtml(u.translation)}</p>
            <h3>Grammatik · قاعدة لغوية</h3><p>${escapeHtml(u.g)}</p>
            <h3>Wortschatz · مفردات الوحدة (${u.v.length})</h3>
            <div class="vocab-grid">${u.v.map((w,j)=>`<article class="vocab-card"><small>${String(j+1).padStart(2,"0")}</small><strong lang="de">${escapeHtml(w[0])}</strong><span>${escapeHtml(w[1])}</span><button class="listen-small" data-speak="${escapeHtml(w[0])}" data-lang="de-DE">🔊</button></article>`).join("")}</div>
            <h3>Praktische Sätze · جمل عملية</h3>
            <div class="sentence-grid">${u.s.map(s=>`<article class="sentence-card"><p lang="de" style="direction:ltr;text-align:left">${escapeHtml(s[0])}</p><span>${escapeHtml(s[1])}</span><button class="listen-btn" data-speak="${escapeHtml(s[0])}" data-lang="de-DE">🔊 استمع للجملة</button></article>`).join("")}</div>
            <h3>Intensivtraining · تدريب مكثف</h3>
            <ol><li>لخّص النص بالألمانية في 4 إلى 6 جمل.</li><li>اكتب خمس جمل جديدة باستخدام مفردات الوحدة.</li><li>تحدث لمدة دقيقة إلى دقيقتين عن الموضوع وسجّل صوتك للمراجعة.</li><li>اكتب رسالة أو فقرة قصيرة مرتبطة بموضوع الوحدة.</li></ol>
            <details><summary>نموذج بداية للإجابة الكتابية</summary><p lang="de" style="direction:ltr;text-align:left">Meiner Meinung nach ist dieses Thema wichtig. Ein Grund dafür ist, dass ... Außerdem sollte man berücksichtigen, dass ... Zusammenfassend lässt sich sagen, dass ...</p></details>
          </article>
        </section>`).join("")}
      <div class="panel" style="padding:20px"><h3>خطة مذاكرة مقترحة للمستوى ${level}</h3><p>كل يوم: اقرأ نصاً بصوت مرتفع، احفظ 10 مفردات، كرر الجمل مع الاستماع، واكتب فقرة قصيرة. في نهاية الأسبوع أعد تلخيص الوحدات دون النظر إلى النصوص.</p></div>`;
  } catch (error) {
    content.innerHTML = '<div class="empty-state"><h2>تعذر تحميل المنهاج المكثف</h2><p>' + escapeHtml(error.message) + '</p></div>';
  }
}


async function renderZfaPreparation() {
  setActive("zfa-preparation");
  content.innerHTML='<div class="empty-state">جارٍ تحميل مسار ZFA…</div>';
  try {
    if(!window.zfaCourse) {
      const response=await fetch("./data/zfa_preparation.json?v=20261109-1");
      if(!response.ok) throw new Error("HTTP "+response.status);
      window.zfaCourse=await response.json();
    }
    const course=window.zfaCourse;
    if(!window.zfaOfficialCurriculum) {
      const officialResponse=await fetch("./data/zfa_official_curriculum.json?v=20261109-1");
      if(!officialResponse.ok) throw new Error("Official curriculum HTTP "+officialResponse.status);
      window.zfaOfficialCurriculum=await officialResponse.json();
    }
    const official=window.zfaOfficialCurriculum;
    if(!window.zfaLernfeld1) {
      const lfResponse=await fetch("./data/zfa_lernfeld1_lessons.json?v=20261109-1");
      if(!lfResponse.ok) throw new Error("Lernfeld 1 lessons HTTP "+lfResponse.status);
      window.zfaLernfeld1=await lfResponse.json();
    }
    const lf1=window.zfaLernfeld1;
    if(!window.zfaLernfelderRest) {
      const restResponse=await fetch("./data/zfa_lernfelder_02_13.json?v=20261109-2");
      if(!restResponse.ok) throw new Error("Lernfelder 2–13 HTTP "+restResponse.status);
      window.zfaLernfelderRest=await restResponse.json();
    }
    const restFields=window.zfaLernfelderRest.fields;
    const units=course.units;
    const words=units.reduce((n,u)=>n+u.vocab.length,0);
    content.innerHTML=`
      <section class="zfa-hero">
        <div><span class="eyebrow">BERUFSVORBEREITUNG · ZFA</span><h1>ZFA – التحضير لتدريب مساعدة طبيب الأسنان</h1><p>${escapeHtml(course.subtitle)}</p><div class="zfa-hero-tags"><span>لغة ألمانية B1–B2</span><span>مصطلحات طبية</span><span>تقديم ومقابلات</span></div></div>
        <div class="zfa-tooth">✚<small>ZFA</small></div>
      </section>
      <div class="zfa-notice">ⓘ ${escapeHtml(course.disclaimer)}</div>
      <section class="zfa-official panel">
        <div class="zfa-official-heading">
          <div><span class="eyebrow">STAATLICHER KMK-RAHMENLEHRPLAN · ZFA</span><h2>المنهاج الألماني الرسمي – 13 Lernfelder</h2>
          <p>القرار الرسمي KMK بتاريخ 17.12.2021، ومتوافق مع لائحة التدريب الاتحادية ZahnmedAusbV لعام 2022.</p></div>
          <div class="zfa-official-total"><strong>840</strong><span>Unterrichtsstunden</span></div>
        </div>
        <div class="zfa-official-years">
          <div><b>1. Ausbildungsjahr</b><strong>280 ساعة</strong><small>Lernfelder 1–4</small></div>
          <div><b>2. Ausbildungsjahr</b><strong>280 ساعة</strong><small>Lernfelder 5–9</small></div>
          <div><b>3. Ausbildungsjahr</b><strong>280 ساعة</strong><small>Lernfelder 10–13</small></div>
        </div>
        <p class="zfa-official-note">كل مجال يتضمن الكفاءة المطلوبة، المحاور الدراسية، مهام تطبيقية، وتقييماً تدريبياً. الشروحات العربية والتمارين من إعداد المنصة وليست نسخاً من كتب تجارية.</p>
        <div class="zfa-official-list">
          ${official.fields.map(f=>`<details class="zfa-official-field">
            <summary><span class="zfa-official-number">${String(f.n).padStart(2,"0")}</span><span class="zfa-official-title"><b>${escapeHtml(f.title)}</b><small>${escapeHtml(f.ar)}</small></span><span class="zfa-official-meta">${f.year}. Ausbildungsjahr · ${f.hours} Std.</span></summary>
            <div class="zfa-official-body">
              <h4>Kompetenzziel · الكفاءة المطلوبة</h4><p>${escapeHtml(f.competence)}</p>
              <h4>Inhalte · المحاور الدراسية</h4><ul>${f.topics.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
              <h4>Lernsituationen · تطبيقات عملية</h4><ul>${f.tasks.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
              <div class="zfa-official-assessment"><b>Leistungsnachweis / Prüfung:</b> ${escapeHtml(f.assessment)}</div>
            </div>
          </details>`).join("")}
        </div>
        <div class="zfa-official-sources"><b>المراجع المعتمدة في بناء الهيكل:</b><span>KMK – Rahmenlehrplan ZFA (17.12.2021)</span><span>ZahnmedAusbV – Ausbildungsordnung (2022)</span><span>Bundeszahnärztekammer – Ausbildungsrahmenplan</span></div>
      </section>
      <section class="zfa-course-module panel">
        <div class="zfa-official-heading"><div><span class="eyebrow">MAßNAHME ORIGINALKURS · LERNFELD 01</span><h2>${escapeHtml(lf1.titleAr)}</h2><p>${escapeHtml(lf1.title)} · 15 درساً أصلياً بالألمانية والعربية</p></div><div class="zfa-official-total"><strong>${lf1.lessons.length}</strong><span>دروس داخل الموقع</span></div></div>
        <p class="zfa-official-note">${escapeHtml(lf1.sourceNote)}</p>
        <div class="zfa-internal-lessons">
          ${lf1.lessons.map((l,i)=>`
            <details class="zfa-internal-lesson">
              <summary><span class="zfa-official-number">${String(l.number).padStart(2,'0')}</span><span class="zfa-official-title"><b>${escapeHtml(l.titleAr)}</b><small lang="de">${escapeHtml(l.title)}</small></span><span class="zfa-official-meta">درس ${l.number}</span></summary>
              <div class="zfa-official-body">
                <h4>Deutsch · الشرح بالألمانية</h4><p class="zfa-german-text" lang="de">${escapeHtml(l.german)}</p>
                <div class="action-row"><button class="listen-btn" data-speak="${escapeHtml(l.german)}" data-lang="de-DE">🔊 استمع للشرح الألماني</button></div>
                <h4>الشرح بالعربية</h4><p>${escapeHtml(l.arabic)}</p>
                <h4>Wortschatz · مفردات الدرس</h4><div class="zfa-vocab-grid">${l.vocabulary.map((w,j)=>`<article class="zfa-vocab"><small>${j+1}</small><strong lang="de">${escapeHtml(w[0])}</strong><span>${escapeHtml(w[1])}</span><button data-speak="${escapeHtml(w[0])}" data-lang="de-DE" aria-label="استمع للكلمة">🔊</button></article>`).join('')}</div>
                <h4>Praxisaufgabe · تطبيق عملي</h4><p>${escapeHtml(l.practice)}</p>
                <div class="zfa-question"><strong>${escapeHtml(l.question)}</strong>${l.options.map((o,k)=>`<label><input type="radio" name="${l.id}" value="${k}"> ${escapeHtml(o)}</label>`).join('')}
                  <details class="zfa-answer"><summary>إظهار الإجابة والتفسير</summary><p><b>${escapeHtml(l.options[l.correct])}</b></p><p>${escapeHtml(l.explanation)}</p></details>
                </div>
              </div>
            </details>
          `).join('')}
        </div>
      </section>
      <section class="zfa-course-module panel">
        <div class="zfa-official-heading"><div><span class="eyebrow">VOLLSTÄNDIGER LERNPFAD · LERNFELDER 02–13</span><h2>بقية مجالات المنهاج – دروس تفصيلية</h2><p>12 مجالاً تعليمياً إضافياً، 15 درساً في كل مجال، بالألمانية والعربية.</p></div><div class="zfa-official-total"><strong>${restFields.reduce((n,f)=>n+f.lessons.length,0)}</strong><span>دروس أصلية</span></div></div>
        <p class="zfa-official-note">${escapeHtml(window.zfaLernfelderRest.sourceNote)}</p>
        <div class="zfa-internal-lessons">
          ${restFields.map(f=>`
            <details class="zfa-internal-lesson zfa-field-group">
              <summary><span class="zfa-official-number">${String(f.field).padStart(2,"0")}</span><span class="zfa-official-title"><b>${escapeHtml(f.titleAr)}</b><small lang="de">${escapeHtml(f.title)}</small></span><span class="zfa-official-meta">${f.hours} Std. · ${f.lessons.length} درساً</span></summary>
              <div class="zfa-official-body">
                <p><b>الكفاءة المهنية:</b> ${escapeHtml(f.competence)}</p>
                <div class="zfa-internal-lessons">
                  ${f.lessons.map(l=>`
                    <details class="zfa-internal-lesson">
                      <summary><span class="zfa-official-number">${String(l.number).padStart(2,"0")}</span><span class="zfa-official-title"><b>${escapeHtml(l.titleAr)}</b><small lang="de">${escapeHtml(l.title)}</small></span><span class="zfa-official-meta">درس ${l.number}</span></summary>
                      <div class="zfa-official-body">
                        <h4>Deutsch · الشرح بالألمانية</h4><p class="zfa-german-text" lang="de">${escapeHtml(l.german)}</p>
                        <div class="action-row"><button class="listen-btn" data-speak="${escapeHtml(l.german)}" data-lang="de-DE">🔊 استمع للشرح</button></div>
                        <h4>الشرح بالعربية</h4><p>${escapeHtml(l.arabic)}</p>
                        <h4>Wortschatz · مفردات الدرس</h4><div class="zfa-vocab-grid">${l.vocabulary.map((w,j)=>`<article class="zfa-vocab"><small>${j+1}</small><strong lang="de">${escapeHtml(w[0])}</strong><span>${escapeHtml(w[1])}</span><button data-speak="${escapeHtml(w[0])}" data-lang="de-DE" aria-label="استمع للكلمة">🔊</button></article>`).join("")}</div>
                        <h4>Praxisaufgabe · تطبيق عملي</h4><p>${escapeHtml(l.practice)}</p>
                        <div class="zfa-question"><strong>${escapeHtml(l.question)}</strong>${l.options.map((o,k)=>`<label><input type="radio" name="${l.id}" value="${k}"> ${escapeHtml(o)}</label>`).join("")}
                          <details class="zfa-answer"><summary>إظهار الإجابة والتفسير</summary><p><b>${escapeHtml(l.options[l.correct])}</b></p><p>${escapeHtml(l.explanation)}</p></details>
                        </div>
                      </div>
                    </details>
                  `).join("")}
                </div>
              </div>
            </details>
          `).join("")}
        </div>
      </section>
      <section class="stats-grid">
        <article class="stat-card"><span class="stat-icon gold">▤</span><div><small>الوحدات التعليمية</small><strong>${units.length}</strong></div></article>
        <article class="stat-card"><span class="stat-icon blue">Aa</span><div><small>المفردات الألمانية</small><strong>${words}</strong></div></article>
        <article class="stat-card"><span class="stat-icon green">🔊</span><div><small>الجمل العملية</small><strong>${units.reduce((n,u)=>n+u.sentences.length,0)}</strong></div></article>
        <article class="stat-card"><span class="stat-icon purple">✓</span><div><small>اختبارات قصيرة</small><strong>${units.reduce((n,u)=>n+u.quiz.length,0)}</strong></div></article>
      </section>
      <div class="page-intro"><span class="eyebrow">DEIN BERUFSWEG</span><h2>من اللغة إلى الاستعداد للمهنة</h2><p>ابدئي بالوحدة الأولى، واقرئي النص، استمعي للجمل، ثم اختبري فهمك.</p></div>
      <div class="zfa-unit-grid">${units.map((u,i)=>`<button class="zfa-unit-link" data-action="zfa-open" data-unit="${i}"><span class="zfa-unit-number">${String(i+1).padStart(2,"0")}</span><span><small>${escapeHtml(u.de)} · ${u.level}</small><strong>${escapeHtml(u.title)}</strong></span><b>←</b></button>`).join("")}</div>
      ${units.map((u,i)=>`
        <section class="zfa-unit" id="zfa-unit-${i}">
          <div class="zfa-unit-head"><span class="zfa-unit-number">${String(i+1).padStart(2,"0")}</span><div><span class="eyebrow">EINHEIT ${i+1} · ${u.level}</span><h2>${escapeHtml(u.title)}</h2><p>${escapeHtml(u.goal)}</p></div></div>
          <div class="zfa-content-card">
            <h3>📖 Lesetext · نص القراءة</h3><p class="zfa-german-text" lang="de">${escapeHtml(u.text)}</p>
            <div class="action-row"><button class="listen-btn" data-speak="${escapeHtml(u.text)}" data-lang="de-DE">▶ استمعي للنص</button><button class="secondary-btn" data-action="zfa-translation" data-unit="${i}">إظهار الترجمة</button></div>
            <p class="zfa-translation" id="zfa-translation-${i}" hidden>${escapeHtml(u.translation)}</p>
            <h3>🧠 Wortschatz · مفردات الوحدة (${u.vocab.length})</h3>
            <div class="zfa-vocab-grid">${u.vocab.map((w,j)=>`<article class="zfa-vocab"><small>${j+1}</small><strong lang="de">${escapeHtml(w[0])}</strong><span>${escapeHtml(w[1])}</span><button data-speak="${escapeHtml(w[0])}" data-lang="de-DE" aria-label="استمع للكلمة">🔊</button></article>`).join("")}</div>
            <h3>💬 Sätze im Praxisalltag · جمل من الحياة العملية</h3>
            <div class="zfa-sentences">${u.sentences.map(s=>`<article><p lang="de">${escapeHtml(s[0])}</p><span>${escapeHtml(s[1])}</span><button class="listen-btn" data-speak="${escapeHtml(s[0])}" data-lang="de-DE">🔊 استمعي للجملة</button></article>`).join("")}</div>
            <h3>✍️ Grammatik · القاعدة اللغوية</h3><p>${escapeHtml(u.grammar)}</p>
            <h3>📝 Wissenstest · اختبري فهمك</h3>
            <div class="zfa-quiz" id="zfa-quiz-${i}">${u.quiz.map((q,j)=>`<div class="zfa-question" data-correct="${q.correct}"><strong>${j+1}. ${escapeHtml(q.q)}</strong>${q.options.map((o,k)=>`<label><input type="radio" name="zfaq-${i}-${j}" value="${k}"> ${escapeHtml(o)}</label>`).join("")}<p class="zfa-feedback" hidden>${escapeHtml(q.why)}</p></div>`).join("")}<button class="primary-btn" data-action="zfa-check" data-unit="${i}">تصحيح الإجابات</button><strong class="zfa-score" id="zfa-score-${i}"></strong></div>
          </div>
        </section>`).join("")}
      <section class="panel zfa-next-step"><h3>🎯 هدفك بعد إنهاء المسار</h3><p>تكونين قد تعرّفتِ إلى مفردات العيادة الأساسية، وتدرّبتِ على محادثات الاستقبال، وفهمتِ طبيعة المهنة، وأصبحتِ أقدر على التحضير لطلب Ausbildung ومقابلة العيادة.</p></section>`;
  } catch(error) {
    content.innerHTML='<div class="empty-state"><h2>تعذر تحميل مسار ZFA</h2><p>'+escapeHtml(error.message)+'</p></div>';
  }
}


function zfaField(id,label,placeholder="") {
 return '<label class="zfa-form-field">'+label+'<input id="'+id+'" type="text" placeholder="'+placeholder+'"></label>';
}
function renderZfaApplication() {
 setActive("zfa-application");
 const questions=[
 ["Warum möchten Sie eine Ausbildung zur ZFA machen?","Ich interessiere mich für Zahnmedizin und arbeite gern mit Menschen. Ich möchte einen medizinischen Beruf erlernen und mich fachlich weiterentwickeln.","لماذا تريدين تدريب ZFA؟"],
 ["Was sind Ihre Stärken?","Ich bin freundlich, zuverlässig und lernbereit. Außerdem arbeite ich sorgfältig und gern im Team.","ما نقاط قوتك؟"],
 ["Wie reagieren Sie, wenn Sie etwas nicht verstehen?","Ich frage höflich nach und lasse mir die Aufgabe erklären. Mir ist wichtig, korrekt und sicher zu arbeiten.","ماذا تفعلين إذا لم تفهمي شيئاً؟"],
 ["Wie gehen Sie mit nervösen Patientinnen und Patienten um?","Ich bleibe ruhig, höre aufmerksam zu und spreche freundlich. Medizinische Fragen leite ich an die zuständige Fachperson weiter.","كيف تتعاملين مع مريض متوتر؟"],
 ["Warum sollten wir Sie auswählen?","Ich bin motiviert, pünktlich und bereit, Neues zu lernen. Ich möchte mich engagiert in Ihr Praxisteam einbringen.","لماذا نختارك؟"],
 ["Was bedeutet Teamarbeit für Sie?","Teamarbeit bedeutet für mich, respektvoll zu kommunizieren, Verantwortung zu übernehmen und Kolleginnen und Kollegen zu unterstützen.","ماذا يعني لك العمل الجماعي؟"],
 ["Wie gut sind Ihre Deutschkenntnisse?","Meine Deutschkenntnisse liegen derzeit bei [Niveau]. Ich lerne regelmäßig weiter und übe besonders die Kommunikation im beruflichen Alltag.","ما مستوى الألمانية لديك؟"],
 ["Haben Sie schon praktische Erfahrungen?","[Hier eigene Erfahrungen ehrlich beschreiben. Wenn keine vorhanden sind: Ich habe noch keine Praxiserfahrung, bin aber sehr motiviert, alles Schritt für Schritt zu lernen.]","هل لديك خبرة عملية؟"]
 ];
 content.innerHTML=`
 <div class="page-intro"><span class="eyebrow">BEWERBUNG & VORSTELLUNGSGESPRÄCH</span><h1>ملف التقديم والمقابلة – ZFA</h1><p>جهّزي بياناتك، أنشئي مسودة رسالة التقديم والسيرة الذاتية، وتدرّبي على أسئلة المقابلة.</p></div>
 <div class="zfa-notice">مهم: هذه نماذج أولية. املئي البيانات الحقيقية فقط، ولا تضيفي خبرة أو مستوى لغة أو شهادة غير موجودة لديك. راجعي كل شيء قبل إرساله إلى العيادة.</div>
 <div class="zfa-application-grid">
  <section class="zfa-content-card"><h2>1. بياناتك الشخصية</h2><p class="zfa-help">املئي الحقول لتظهر بياناتك داخل النماذج مباشرة.</p>
   ${zfaField("zfa-name","الاسم الكامل","Vorname Nachname")}
   ${zfaField("zfa-address","العنوان","Straße, PLZ, Ort")}
   ${zfaField("zfa-phone","رقم الهاتف","+49 …")}
   ${zfaField("zfa-email","البريد الإلكتروني","name@email.de")}
   ${zfaField("zfa-clinic","اسم العيادة","Zahnarztpraxis …")}
   ${zfaField("zfa-city","المدينة والتاريخ","Oberhausen, 09.11.2026")}
   ${zfaField("zfa-school","الشهادة المدرسية","Schulabschluss / voraussichtlicher Abschluss")}
   ${zfaField("zfa-language","مستوى الألمانية","B1 / B2 – ehrlich angeben")}
   ${zfaField("zfa-experience","الخبرة أو التدريب العملي","Praktikum / Erfahrung / noch keine")}
   ${zfaField("zfa-strengths","نقاط قوتك","freundlich, zuverlässig, sorgfältig")}
   <label class="zfa-form-field">لماذا اخترتِ هذه المهنة؟<textarea id="zfa-motivation" rows="3" placeholder="اكتبي السبب الحقيقي باختصار"></textarea></label>
   <button class="primary-btn" data-action="zfa-refresh-draft">تحديث النماذج</button>
  </section>
  <section class="zfa-content-card"><h2>2. Anschreiben · رسالة التقديم</h2><pre class="zfa-draft" id="zfa-cover-preview"></pre><button class="primary-btn" data-action="zfa-copy-cover">نسخ رسالة التقديم</button>
   <div class="zfa-divider"></div><h2>3. Lebenslauf · السيرة الذاتية</h2><pre class="zfa-draft" id="zfa-cv-preview"></pre><button class="primary-btn" data-action="zfa-copy-cv">نسخ السيرة الذاتية</button>
  </section>
 </div>
 <section class="zfa-content-card zfa-interview"><span class="eyebrow">VORSTELLUNGSGESPRÄCH</span><h2>4. أسئلة مقابلة العمل مع إجابات نموذجية</h2><p class="zfa-help">اقرئي السؤال، حاولي الإجابة بصوتك، ثم قارني إجابتك بالنموذج. عدّلي الإجابة لتناسب تجربتك الحقيقية.</p>
  ${questions.map((q,i)=>`<details class="zfa-interview-q"><summary><span>${i+1}. ${escapeHtml(q[0])}</span><small>${escapeHtml(q[2])}</small></summary><p lang="de">${escapeHtml(q[1])}</p><button class="listen-btn" data-speak="${escapeHtml(q[1])}" data-lang="de-DE">🔊 استمعي للإجابة</button></details>`).join("")}
 </section>
 <section class="zfa-content-card zfa-checklist"><h2>5. قائمة تجهيز ملف التقديم</h2>
  ${["سيرة ذاتية ألمانية محدثة","رسالة تقديم مخصصة للعيادة","آخر شهادة مدرسية أو إثبات دراسي","شهادات اللغة إن توفرت","شهادات التدريب أو الخبرة إن وجدت","مراجعة البريد الإلكتروني ورقم الهاتف","التأكد من اسم العيادة والشخص المسؤول","حفظ نسخة PDF من المستندات"].map((x,i)=>`<label><input type="checkbox"> ${x}</label>`).join("")}
 </section>`;
 const update=()=>{
  const val=id=>document.getElementById(id)?.value.trim()||"";
  const name=val("zfa-name")||"[Vorname Nachname]",address=val("zfa-address")||"[Adresse]",phone=val("zfa-phone")||"[Telefon]",email=val("zfa-email")||"[E-Mail]",clinic=val("zfa-clinic")||"[Name der Zahnarztpraxis]",city=val("zfa-city")||"[Ort, Datum]",school=val("zfa-school")||"[Schulabschluss]",language=val("zfa-language")||"[Deutschkenntnisse]",experience=val("zfa-experience")||"[Praktische Erfahrung]",strengths=val("zfa-strengths")||"[Persönliche Stärken]",motivation=val("zfa-motivation")||"Ich interessiere mich für Zahnmedizin und möchte einen medizinischen Beruf erlernen.";
  const cover=name+"\n"+address+"\n"+phone+" · "+email+"\n\n"+clinic+"\n\n"+city+"\n\nBewerbung um einen Ausbildungsplatz als Zahnmedizinische Fachangestellte (ZFA)\n\nSehr geehrte Damen und Herren,\n\nhiermit bewerbe ich mich um einen Ausbildungsplatz als Zahnmedizinische Fachangestellte in Ihrer Praxis. "+motivation+"\n\nIch bin "+strengths+" und möchte meine Deutschkenntnisse ("+language+") weiter verbessern. Mein bisheriger schulischer Abschluss: "+school+". Praktische Erfahrungen: "+experience+".\n\nÜber die Möglichkeit, mich persönlich vorzustellen oder ein Praktikum zum gegenseitigen Kennenlernen zu absolvieren, würde ich mich sehr freuen.\n\nMit freundlichen Grüßen\n"+name;
  const cv="LEBENSLAUF\n\nPersönliche Daten\nName: "+name+"\nAdresse: "+address+"\nTelefon: "+phone+"\nE-Mail: "+email+"\n\nSchulbildung\n"+school+"\n\nSprachkenntnisse\nDeutsch: "+language+"\n\nPraktische Erfahrungen\n"+experience+"\n\nPersönliche Stärken\n"+strengths+"\n\nBerufliches Ziel\nAusbildung zur Zahnmedizinischen Fachangestellten (ZFA)";
  document.getElementById("zfa-cover-preview").textContent=cover;
  document.getElementById("zfa-cv-preview").textContent=cv;
 };
 content.querySelectorAll("input[type=text],textarea").forEach(el=>el.addEventListener("input",update));
 update();
}

function renderZfaSimulation() {
 setActive("zfa-simulation");
 const scenes=[
 ["الوصول إلى العيادة","08:00 · Vorbereitung","Du kommst morgens in der Zahnarztpraxis an. Was machst du zuerst?","وصلتِ إلى العيادة صباحاً. ما أول خطوة مناسبة؟",["Ich überprüfe den Tagesplan und bereite meinen Arbeitsplatz nach Anweisung vor.","Ich beginne sofort allein mit einer Behandlung.","Ich öffne die Patientenakten für Freunde."],0,"راجعي جدول المواعيد وجهزي مكان العمل وفق تعليمات الفريق، مع احترام الخصوصية.","Guten Morgen! Was steht heute im Terminplan?","صباح الخير! ما الموجود في جدول المواعيد اليوم؟"],
 ["استقبال المريض","08:30 · Empfang","Ein Patient kommt zur Anmeldung. Wie begrüßt du ihn professionell?","دخل مريض إلى الاستقبال. كيف ترحب به بطريقة مهنية؟",["Was willst du?","Guten Morgen. Herzlich willkommen. Haben Sie einen Termin?","Warten Sie draußen."],1,"التحية المهذبة والسؤال عن الموعد أسلوب استقبال مهني.","Haben Sie bitte Ihre Versichertenkarte dabei?","هل بطاقة التأمين معك من فضلك؟"],
 ["ألم الأسنان","09:00 · Patientengespräch","Eine Patientin sagt: Ich habe starke Zahnschmerzen. Was ist deine passende Reaktion?","مريضة تقول إن لديها ألماً شديداً في الأسنان. كيف تتصرفين؟",["Ich sage ihr, welche Krankheit sie hat.","Ich verspreche, dass nichts Schlimmes ist.","Ich höre aufmerksam zu und informiere die Zahnärztin."],2,"استمعي للمريض وانقلي المعلومات للطبيب/الطبيبة. لا تشخّصي الحالة ولا تقدمي وعوداً طبية.","Seit wann haben Sie die Schmerzen?","منذ متى تشعرين بالألم؟"],
 ["العمل مع الفريق","09:30 · Teamarbeit","Du bist bei einer Aufgabe unsicher. Was machst du?","لست متأكدة من طريقة تنفيذ مهمة. ماذا تفعلين؟",["Ich frage eine erfahrene Kollegin und lasse es mir zeigen.","Ich rate und mache einfach weiter.","Ich verschweige das Problem."],0,"السؤال عند عدم التأكد يحافظ على سلامة العمل ويساعدك على التعلم.","Könnten Sie mir das bitte noch einmal zeigen?","هل يمكنك أن تريني ذلك مرة أخرى من فضلك؟"],
 ["مريض متوتر","10:15 · Einfühlsamkeit","Ein Patient hat Angst vor der Behandlung. Wie reagierst du?","مريض خائف من العلاج. كيف تتعاملين معه؟",["Ich lache über seine Angst.","Ich bleibe ruhig, höre zu und informiere das Behandlungsteam.","Ich sage ihm, dass er sich nicht so anstellen soll."],1,"التعاطف والهدوء والاستماع، ثم إبلاغ الفريق، تساعد المريض على الشعور بالأمان.","Ich verstehe, dass Sie nervös sind. Wir sind für Sie da.","أتفهم أنك متوتر. نحن هنا لمساعدتك."],
 ["مكالمة هاتفية","11:00 · Telefon","Eine Patientin möchte ihren Termin verschieben. Was sagst du?","مريضة تريد تغيير موعدها عبر الهاتف. ما العبارة المناسبة؟",["Nennen Sie mir bitte Ihren Namen und den gewünschten Termin.","Das geht nicht. Auf Wiederhören.","Schicken Sie irgendjemanden."],0,"تحققي من بيانات المريضة وفق إجراءات العيادة، ثم راجعي المواعيد المتاحة.","Gern. Welcher Tag würde Ihnen passen?","بكل سرور. أي يوم يناسبك؟"],
 ["حماية البيانات","12:00 · Datenschutz","Eine Person fragt dich nach den Daten eines anderen Patienten. Was machst du?","شخص يسألك عن معلومات مريض آخر. ما التصرف الصحيح؟",["Ich gebe die Informationen weiter.","Ich zeige kurz den Bildschirm.","Ich gebe keine Auskunft und beachte die Datenschutzregeln."],2,"معلومات المرضى سرية. لا تكشفيها إلا وفق الصلاحيات والإجراءات المعتمدة.","Aus Datenschutzgründen darf ich dazu keine Auskunft geben.","لأسباب تتعلق بحماية البيانات لا يمكنني إعطاء معلومات بهذا الشأن."],
 ["نهاية الدوام","16:00 · Tagesabschluss","Der Arbeitstag ist fast vorbei. Was gehört zu einem verantwortungsvollen Abschluss?","انتهى يوم العمل تقريباً. ما الذي يجب فعله؟",["أترك كل شيء دون إبلاغ أحد.","أوثق المهام حسب التعليمات، وأسلم الملاحظات للفريق وأرتب المكان.","أصور ملفات المرضى بهاتفي."],1,"التوثيق والتسليم وفق تعليمات العيادة وترتيب المكان جزء من العمل المسؤول.","Ich habe die Aufgaben dokumentiert und alles übergeben.","وثّقت المهام وسلمت كل شيء."]
 ];
 if(zfaSimulationIndex>=scenes.length){content.innerHTML='<section class="zfa-hero"><div><span class="eyebrow">SIMULATION · AUSWERTUNG</span><h1>أحسنتِ! أنهيتِ يوم التدريب.</h1><p>نتيجتك '+zfaSimulationScore+' من '+scenes.length+'. '+(zfaSimulationScore>=7?"ممتاز! لديك فهم جيد للمواقف الأساسية.":"تابعي التدريب وراجعي المواقف التي أخطأتِ فيها.")+'</p><button class="primary-btn" data-action="zfa-sim-restart">إعادة المحاكاة</button></div><div class="zfa-tooth">✓</div></section>';return;}
 const s=scenes[zfaSimulationIndex];
 content.innerHTML='<section class="zfa-hero"><div><span class="eyebrow">PRAXISSIMULATION · ZFA</span><h1>يوم عملي داخل عيادة الأسنان</h1><p>تدرّبي على 8 مواقف واقعية باللغة الألمانية مع شرح عربي وتصحيح فوري.</p><div class="zfa-hero-tags"><span>8 مواقف</span><span>اختيارات تفاعلية</span><span>مفردات ونطق</span></div></div><div class="zfa-tooth">🦷</div></section><div class="zfa-sim-progress"><div><strong>الموقف '+(zfaSimulationIndex+1)+' من '+scenes.length+'</strong><span>النتيجة الحالية: '+zfaSimulationScore+'</span></div><div class="progress-track"><div class="progress-fill" style="width:'+(zfaSimulationIndex/scenes.length*100)+'%"></div></div></div><section class="zfa-content-card zfa-scene"><span class="eyebrow">'+s[1]+'</span><h2>'+s[0]+'</h2><p class="zfa-german-text">'+s[2]+'</p><p class="zfa-sim-ar">'+s[3]+'</p><h3>Wie reagierst du?</h3><div class="zfa-sim-choices">'+s[4].map((x,i)=>'<button class="zfa-sim-choice" data-sim-choice="'+i+'">'+String.fromCharCode(65+i)+'. '+escapeHtml(x)+'</button>').join("")+'</div><div id="zfa-sim-feedback" class="zfa-sim-feedback" hidden></div><div class="zfa-sim-phrase"><div><small>عبارة مفيدة في هذا الموقف</small><strong>'+escapeHtml(s[6])+'</strong><span>'+escapeHtml(s[7])+'</span></div><button class="listen-btn" data-speak="'+escapeHtml(s[6])+'" data-lang="de-DE">🔊 استمع</button></div><div class="action-row"><button class="secondary-btn" data-action="zfa-sim-restart">إعادة من البداية</button><button class="primary-btn" data-action="zfa-sim-next" disabled>'+(zfaSimulationIndex===scenes.length-1?"عرض النتيجة":"الموقف التالي ←")+'</button></div></section>';
}
function renderSchedule() {
 content.innerHTML=`<div class="page-intro"><span class="eyebrow">WOCHENPLAN</span><h1>جدول الحصص الأسبوعي</h1><p>جدول مقترح قابل للتعديل لاحقاً حسب برنامج Maßnahme الخاص بك.</p></div><table class="schedule-table"><thead><tr><th>اليوم</th><th>الحصة الأولى</th><th>الحصة الثانية</th><th>الحصة الثالثة</th></tr></thead><tbody>${[["الاثنين","Deutsch","Mathematik","مراجعة"],["الثلاثاء","Mathematik","English","تدريبات"],["الأربعاء","Deutsch","English","قراءة"],["الخميس","Mathematik","تطبيقات","اختبار قصير"],["الجمعة","مراجعة عامة","حل الواجبات","تقييم أسبوعي"]].map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function renderAssignments() {
 const lessons=allLessons();
 content.innerHTML=`<div class="page-intro"><span class="eyebrow">AUFGABEN</span><h1>دفتر الواجبات</h1><p>أنجز اختبار كل درس ثم علّم الدرس كمكتمل.</p></div><div class="panel"><div class="continue-list">${lessons.map(l=>`<div class="continue-item"><div><strong>${escapeHtml(l.title)}</strong><small>${escapeHtml(l.courseName)}</small></div><span>${isCompleted(l.id)?"<span style='color:#3b9875'>مكتمل ✓</span>":"<span style='color:#9a793e'>بانتظار الإنجاز</span>"}</span></div>`).join("")}</div></div>`;
}
function renderExams() {
 const qs=allLessons().flatMap(l=>l.questions.map(q=>({...q,lesson:l.title,lessonId:l.id})));
 content.innerHTML=`<div class="page-intro"><span class="eyebrow">PRÜFUNGSTRAINING</span><h1>اختبار مراجعة سريع</h1><p>أسئلة مختارة من الدروس المتاحة. هذا تدريب تعليمي وليس امتحان ESA رسمياً.</p></div><div class="lesson-main"><form id="examForm">${qs.map((q,i)=>`<div class="question"><p>${i+1}. ${escapeHtml(q.q)} <small style="color:#9aa3b1">(${escapeHtml(q.lesson)})</small></p>${q.options.map((o,j)=>`<label class="answer-option"><input type="radio" name="exam${i}" value="${j}"> ${escapeHtml(o)}</label>`).join("")}</div>`).join("")}<button class="primary-btn" type="submit">إنهاء الاختبار</button><div id="examResult" class="feedback"></div></form></div>`;
 document.querySelector("#examForm").addEventListener("submit",e=>{e.preventDefault();let score=0;qs.forEach((q,i)=>{const v=document.querySelector(`input[name="exam${i}"]:checked`);if(v&&Number(v.value)===q.correct)score++;});document.querySelector("#examResult").textContent=`نتيجتك: ${score} من ${qs.length} (${Math.round(score/qs.length*100)}%)`;});
}

function renderStandaloneTimer(){
 content.innerHTML="<div class=\"page-intro\"><span class=\"eyebrow\">FOCUS TIMER · مؤقّت التركيز</span><h1>مؤقّت التركيز</h1><p>نظّم وقتك بجلسات تركيز واستراحات، واضبط المدة المناسبة لك.</p></div>\n<section class=\"study-timer-card study-timer-pro timer-standalone\">\n <div class=\"study-timer-top\"><div class=\"study-card-heading\"><span class=\"study-tool-icon\">◷</span><div><h2>جلسة التركيز</h2><p>وقتك للدراسة والإنجاز</p></div></div><span class=\"timer-live-pill\"><i></i> وضع التركيز</span></div>\n <div class=\"timer-ring\" id=\"studyTimerRing\" style=\"--timer-progress:100%\"><div class=\"timer-ring-inner\"><span class=\"timer-mode-label\" id=\"studyTimerMode\">وقت الدراسة</span><strong class=\"study-timer-display\" id=\"studyTimerDisplay\">25:00</strong><small id=\"studyTimerSub\">استعد وابدأ إنجازك</small></div></div>\n <div class=\"timer-presets\"><button type=\"button\" data-timer-preset=\"25\" class=\"active\">25 دقيقة</button><button type=\"button\" data-timer-preset=\"50\">50 دقيقة</button><button type=\"button\" data-timer-preset=\"90\">90 دقيقة</button></div>\n <div class=\"timer-custom\"><label class=\"study-timer-label\" for=\"studyTimerMinutes\">مدة مخصصة</label><div><input id=\"studyTimerMinutes\" type=\"number\" min=\"1\" max=\"180\" value=\"25\"><span>دقيقة</span></div></div>\n <div class=\"study-timer-actions\"><button class=\"primary-btn timer-start-btn\" id=\"studyTimerStart\">▶ ابدأ التركيز</button><button class=\"secondary-btn\" id=\"studyTimerPause\" disabled>Ⅱ إيقاف مؤقت</button><button class=\"secondary-btn timer-reset-btn\" id=\"studyTimerReset\" aria-label=\"إعادة ضبط المؤقت\">↻</button></div>\n <p class=\"study-timer-status\" id=\"studyTimerStatus\" aria-live=\"polite\">جاهز؟ اختر المدة وابدأ جلستك.</p><div class=\"timer-footer-note\"><span>✦</span> جلسة واحدة مركّزة تصنع فرقاً</div>\n</section>";
 bindStudyTimerControls();
 renderStudyTimer();
}
function bindStudyTimerControls(){
 document.getElementById("studyTimerStart")?.addEventListener("click",startStudyTimer);
 document.getElementById("studyTimerPause")?.addEventListener("click",pauseStudyTimer);
 document.getElementById("studyTimerReset")?.addEventListener("click",resetStudyTimer);
 document.getElementById("studyTimerMinutes")?.addEventListener("change",resetStudyTimer);
 document.querySelectorAll("[data-timer-preset]").forEach(button=>button.addEventListener("click",()=>{
  document.querySelectorAll("[data-timer-preset]").forEach(item=>item.classList.toggle("active",item===button));
  const field=document.getElementById("studyTimerMinutes");if(field)field.value=button.dataset.timerPreset;
  resetStudyTimer();
 }));
}
\nfunction renderStudyAssistant(){
  content.innerHTML=`<div class="page-intro"><span class="eyebrow">YOUR STUDY COMPANION · رفيق دراستك</span><h1>المساعد الدراسي التفاعلي</h1><p>نظّم وقتك، اكتب سؤالك أو تحدث عبر الميكروفون، وناقش الدرس خطوة بخطوة.</p></div>
  <section class="study-tools-grid">
   <article class="study-chat-card">
      <div class="study-card-heading"><span class="study-tool-icon">✦</span><div><h2>اسأل وناقش</h2><p>مساعد يشرح ويصحح ويعطيك أمثلة</p></div></div>
      <div class="study-audio-setting-wrap">
        <label class="study-audio-setting" for="studyVoiceReply"><input type="checkbox" id="studyVoiceReply"> <span><b>تشغيل الردود الصوتية</b><small>اختياري — يمكنك إيقافه بأي وقت</small></span></label>
        <label class="study-setting-field study-speech-language"><span>لغة القراءة</span><select id="studySpeechLanguage"><option value="auto">تلقائي</option><option value="ar">العربية</option><option value="en">English</option><option value="de">Deutsch</option></select></label>
      </div>
      <div class="study-chat-messages" id="studyChatMessages" aria-live="polite"><div class="study-message assistant"><b>المساعد الدراسي</b><p>أهلاً بك! اكتب سؤالك أو جملة تريد تصحيحها. فيك تطلب مني أشرح بطريقة أبسط أو أعطيك تمريناً.</p></div></div>
      <form id="studyChatForm" class="study-chat-form"><textarea id="studyChatInput" rows="2" maxlength="3000" placeholder="اكتب سؤالك أو الجملة التي تريد مناقشتها..." required></textarea><div class="study-chat-controls"><button type="button" class="secondary-btn" id="studyMicButton">🎙️ تحدث</button><button type="button" class="secondary-btn study-stop-audio" id="studyStopVoice">■ إيقاف الصوت</button><span id="studySpeechStatus" aria-live="polite">الصوت متوقف</span><button class="primary-btn" id="studySendButton" type="submit">إرسال السؤال ←</button></div></form>
      <p class="study-tutor-note" id="studyTutorStatus">تُحفظ محادثاتك تلقائياً في حسابك ويمكنك الرجوع إليها من أي جهاز.</p>
    </article>
  </section>
  <div class="study-tips"><b>أمثلة لما يمكنك سؤاله:</b><span>اشرح لي الكسور بطريقة سهلة.</span><span>صحّح هذه الجملة الألمانية وناقشني بالسبب.</span><span>اختبرني بخمسة أسئلة عن الخلية.</span></div>`;
  document.getElementById("studyChatForm").addEventListener("submit",sendStudyMessage);
  document.getElementById("studyMicButton").addEventListener("click",startStudyDictation);
  document.getElementById("studyStopVoice").addEventListener("click",stopStudySpeech);

  renderStudyTimer();
}
function renderStudyTimer(){
  const display=document.getElementById("studyTimerDisplay");if(!display)return;
  const remaining=Math.max(0,studyTimerRemaining);
  const m=Math.floor(remaining/60),s=remaining%60;
  display.textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  const total=Math.max(60,(Number(document.getElementById("studyTimerMinutes")?.value)||25)*60);
  const ratio=Math.max(0,Math.min(1,remaining/total));
  const ring=document.getElementById("studyTimerRing");if(ring)ring.style.setProperty("--timer-progress",(ratio*100)+"%");
  const sub=document.getElementById("studyTimerSub");if(sub)sub.textContent=studyTimerRunning?"أنت في وضع التركيز":remaining===0?"أحسنت! اكتملت الجلسة":"استعد وابدأ إنجازك";
  const mode=document.getElementById("studyTimerMode");if(mode)mode.textContent=studyTimerRunning?"التركيز مستمر":"وقت الدراسة";
  const startButton=document.getElementById("studyTimerStart");if(startButton)startButton.textContent=studyTimerRunning?"● يعمل الآن":"▶ ابدأ التركيز";
  if(startButton)startButton.disabled=studyTimerRunning;
  const pauseButton=document.getElementById("studyTimerPause");if(pauseButton)pauseButton.disabled=!studyTimerRunning;
}
function finishStudyTimer(){
  if(studyTimerInterval)clearInterval(studyTimerInterval);
  studyTimerInterval=null;studyTimerEndsAt=null;studyTimerRemaining=0;studyTimerRunning=false;
  renderStudyTimer();
  const status=document.getElementById("studyTimerStatus");if(status)status.textContent="انتهت الجلسة! خذ استراحة قصيرة ثم تابع.";
  notify("انتهى وقت جلسة الدراسة");
  if("speechSynthesis" in window)speakText("انتهى وقت الدراسة. أحسنت!","ar-SA");
}
function updateStudyTimer(){
  if(!studyTimerRunning||!studyTimerEndsAt)return;
  studyTimerRemaining=Math.max(0,Math.ceil((studyTimerEndsAt-Date.now())/1000));
  if(studyTimerRemaining===0){finishStudyTimer();return;}
  renderStudyTimer();
}
function startStudyTimer(){
  if(studyTimerRunning)return;
  const input=document.getElementById("studyTimerMinutes");
  if(studyTimerRemaining<=0)studyTimerRemaining=Math.max(1,Math.min(180,Number(input?.value)||25))*60;
  studyTimerRunning=true;studyTimerEndsAt=Date.now()+studyTimerRemaining*1000;
  if(studyTimerInterval)clearInterval(studyTimerInterval);
  renderStudyTimer();
  const status=document.getElementById("studyTimerStatus");if(status)status.textContent="أحسنت! ركّز على دراستك، المؤقّت يعمل الآن.";
  studyTimerInterval=setInterval(updateStudyTimer,250);
}
function pauseStudyTimer(){
  if(studyTimerRunning&&studyTimerEndsAt){
    studyTimerRemaining=Math.max(0,Math.ceil((studyTimerEndsAt-Date.now())/1000));
  }
  if(studyTimerInterval)clearInterval(studyTimerInterval);
  studyTimerInterval=null;studyTimerEndsAt=null;studyTimerRunning=false;renderStudyTimer();
  const status=document.getElementById("studyTimerStatus");if(status)status.textContent="تم إيقاف المؤقّت مؤقتاً.";
}
function resetStudyTimer(){
  pauseStudyTimer();
  const minutes=Math.max(1,Math.min(180,Number(document.getElementById("studyTimerMinutes")?.value)||25));
  document.querySelectorAll("[data-timer-preset]").forEach(button=>button.classList.toggle("active",Number(button.dataset.timerPreset)===minutes));
  studyTimerRemaining=minutes*60;renderStudyTimer();
  const status=document.getElementById("studyTimerStatus");if(status)status.textContent="تم ضبط جلسة جديدة لمدة "+minutes+" دقيقة.";
}
function appendStudyMessage(role,text){
  const box=document.getElementById("studyChatMessages");if(!box)return;
  const item=document.createElement("div");item.className="study-message "+role;
  const heading=document.createElement("b");heading.textContent=role==="user"?"أنت":"المساعد الدراسي";
  const paragraph=document.createElement("p");paragraph.textContent=text;
  item.append(heading,paragraph);
  if(role==="assistant"){
    const actions=document.createElement("div");actions.className="study-message-audio-actions";
    const play=document.createElement("button");play.type="button";play.className="secondary-btn";play.textContent="▶ استمع مجدداً";play.dataset.studySpeak=text;
    const stop=document.createElement("button");stop.type="button";stop.className="secondary-btn";stop.textContent="■ إيقاف";stop.dataset.studyStop="1";
    actions.append(play,stop);item.append(actions);
  }
  box.append(item);box.scrollTop=box.scrollHeight;
}
async function sendStudyMessage(event){
  event.preventDefault();
  const input=document.getElementById("studyChatInput"),button=document.getElementById("studySendButton");
  const message=input.value.trim();if(!message)return;
  const status=document.getElementById("studyTutorStatus");
  appendStudyMessage("user",message);studyChatMessages.push({role:"user",content:message});input.value="";
  button.disabled=true;button.textContent="يفكر...";
  if(status)status.textContent="جارٍ تجهيز الإجابة...";
  try{
    const {data,error}=await supabase.functions.invoke("study-tutor",{body:{messages:studyChatMessages,subject:document.getElementById("studySubject").value,answerStyle:document.getElementById("studyAnswerStyle")?.value||"balanced"}});
    if(error)throw error;
    if(!data?.reply)throw new Error(data?.error||"لم يصل رد من المساعد.");
    appendStudyMessage("assistant",data.reply);studyChatMessages.push({role:"assistant",content:data.reply});
    if(document.getElementById("studyVoiceReply").checked)speakText(data.reply,getStudySpeechLanguage(data.reply));
    if(status)status.textContent="تقدر تتابع النقاش بسؤال آخر.";
  }catch(error){
    const reason=String(error?.message||"");
    const friendly= /Failed to fetch|FunctionsFetchError|404|not found/i.test(reason)
      ?"خدمة المساعد لم تُفعّل بعد على Supabase. يلزم نشر study-tutor وإضافة GEMINI_API_KEY ضمن Secrets."
      :"تعذر الاتصال بالمساعد حالياً. تأكد من إعداد الخدمة ثم حاول مرة أخرى.";
    appendStudyMessage("assistant",friendly);
    if(status)status.textContent=friendly;
  }finally{button.disabled=false;button.textContent="إرسال السؤال ←";}
}
async function loadStudyChatHistory(selectedId=""){
  const select=document.getElementById("studyChatHistory");if(!select||!currentStudentId)return;
  const {data,error}=await supabase.from("study_chat_sessions").select("id,title,assistant_gender,language,duration_minutes,started_at,ended_at").eq("user_id",currentStudentId).order("started_at",{ascending:false}).limit(30);
  if(error){select.innerHTML='<option value="">تعذر تحميل السجل</option>';return;}
  select.innerHTML='<option value="">اختر محادثة سابقة</option>'+((data||[]).map(item=>'<option value="'+escapeHtml(item.id)+'">'+escapeHtml((item.title||"محادثة جديدة").slice(0,48))+' · '+new Date(item.started_at).toLocaleDateString()+'</option>').join(""));
  if(selectedId)select.value=selectedId;
}
async function saveStudyChatMessage(role,body){
  const {error}=await supabase.from("study_chat_messages").insert({session_id:activeStudyChatId,user_id:currentStudentId,role,content:body});
  if(error)throw error;
}
function stopStudyChatTimer(){
  if(studyChatTimer)clearInterval(studyChatTimer);
  studyChatTimer=null;
}
function renderStudyChatCountdown(){
  const clock=document.getElementById("studyChatCountdown");if(!clock)return;
  const mins=Math.floor(Math.max(0,studyChatSecondsLeft)/60),secs=Math.max(0,studyChatSecondsLeft)%60;
  clock.textContent=String(mins).padStart(2,"0")+":"+String(secs).padStart(2,"0");
}
function startStudyChatTimer(expiresAt){
  stopStudyChatTimer();studyChatExpiresAt=new Date(expiresAt).getTime();
  studyChatSecondsLeft=Math.max(0,Math.ceil((studyChatExpiresAt-Date.now())/1000));renderStudyChatCountdown();
  studyChatTimer=setInterval(async()=>{
    studyChatSecondsLeft=Math.max(0,Math.ceil((studyChatExpiresAt-Date.now())/1000));renderStudyChatCountdown();
    if(studyChatSecondsLeft<=0){
      stopStudyChatTimer();
      if(activeStudyChatId)await supabase.from("study_chat_sessions").update({ended_at:new Date().toISOString()}).eq("id",activeStudyChatId).eq("user_id",currentStudentId);
      const status=document.getElementById("studyTutorStatus");if(status)status.textContent="انتهى وقت المحادثة. محادثتك محفوظة بالكامل؛ ابدأ جلسة جديدة للمتابعة.";
      const input=document.getElementById("studyChatInput");if(input)input.disabled=true;
      const send=document.getElementById("studySendButton");if(send)send.disabled=true;
      notify("انتهى وقت جلسة الدردشة. تم حفظ المحادثة.");
    }
  },1000);
}
async function startNewStudyChat(){
  stopStudyChatTimer();activeStudyChatId=null;studyChatMessages=[];
  const gender=document.querySelector("[data-assistant-gender].active")?.dataset.assistantGender||"female";
  const language=document.getElementById("studyChatLanguage")?.value||"auto";
  const duration=Math.max(1,Math.min(180,Number(document.getElementById("studyChatDuration")?.value)||30));
  const title=gender==="female"?"محادثة مع المساعدة الذكية":"محادثة مع المساعد الذكي";
  const startedAt=new Date(),expiresAt=new Date(startedAt.getTime()+duration*60000);
  const {data,error}=await supabase.from("study_chat_sessions").insert({user_id:currentStudentId,title,assistant_gender:gender,language,duration_minutes:duration,started_at:startedAt.toISOString(),expires_at:expiresAt.toISOString()}).select("id,expires_at").single();
  if(error){notify("تعذر إنشاء المحادثة. تأكد من تفعيل جداول الدردشة في قاعدة البيانات.");return null;}
  activeStudyChatId=data.id;
  const input=document.getElementById("studyChatInput"),send=document.getElementById("studySendButton"),box=document.getElementById("studyChatMessages");
  if(input)input.disabled=false;if(send)send.disabled=false;
  if(box)box.innerHTML="";
  const greeting=gender==="female"?"مرحباً! أنا مساعدتك الدراسية. كيف يمكنني مساعدتك اليوم؟":"مرحباً! أنا مساعدك الدراسي. ما الموضوع الذي تريد أن نتعلمه اليوم؟";
  studyChatMessages.push({role:"assistant",content:greeting});appendStudyMessage("assistant",greeting);
  await saveStudyChatMessage("assistant",greeting);
  startStudyChatTimer(data.expires_at);
  await loadStudyChatHistory(activeStudyChatId);
  const status=document.getElementById("studyTutorStatus");if(status)status.textContent="بدأت الجلسة لمدة "+duration+" دقيقة. تُحفظ الرسائل تلقائياً.";
  return data.id;
}
async function openStudyChat(sessionId){
  stopStudyChatTimer();activeStudyChatId=sessionId;studyChatMessages=[];
  const {data:session,error}=await supabase.from("study_chat_sessions").select("*").eq("id",sessionId).eq("user_id",currentStudentId).single();
  if(error||!session)return;
  const gender=session.assistant_gender||"female";
  document.querySelectorAll("[data-assistant-gender]").forEach(button=>button.classList.toggle("active",button.dataset.assistantGender===gender));
  const lang=document.getElementById("studyChatLanguage");if(lang)lang.value=session.language||"auto";
  const duration=document.getElementById("studyChatDuration");if(duration)duration.value=session.duration_minutes||30;
  const {data:messages,error:messagesError}=await supabase.from("study_chat_messages").select("role,content,created_at").eq("session_id",sessionId).eq("user_id",currentStudentId).order("created_at",{ascending:true});
  if(messagesError)return;
  const box=document.getElementById("studyChatMessages");if(box)box.innerHTML="";
  (messages||[]).forEach(message=>{studyChatMessages.push({role:message.role,content:message.content});appendStudyMessage(message.role,message.content);});
  const ended=!!session.ended_at||new Date(session.expires_at).getTime()<=Date.now();
  const input=document.getElementById("studyChatInput"),send=document.getElementById("studySendButton");
  if(input)input.disabled=ended;if(send)send.disabled=ended;
  if(!ended)startStudyChatTimer(session.expires_at);else{studyChatSecondsLeft=0;renderStudyChatCountdown();}
  const status=document.getElementById("studyTutorStatus");if(status)status.textContent=ended?"هذه محادثة سابقة انتهى وقتها. ابدأ محادثة جديدة للمتابعة.":"تم استرجاع المحادثة. يمكنك المتابعة ضمن الوقت المتبقي.";
}

function startStudyDictation(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){notify("الإملاء الصوتي غير مدعوم في هذا المتصفح. استخدم الكتابة.");return;}
  const recognition=new Recognition();
  const selectedLanguage=document.getElementById("studyChatLanguage")?.value||"auto";
  const speechLanguages={ar:"ar-SA",de:"de-DE",en:"en-GB",fr:"fr-FR",tr:"tr-TR",es:"es-ES",it:"it-IT",ur:"ur-PK",ru:"ru-RU",pt:"pt-PT",pl:"pl-PL",nl:"nl-NL",ja:"ja-JP",zh:"zh-CN",hi:"hi-IN"};
  recognition.lang=speechLanguages[selectedLanguage]||(navigator.language||"ar-SA");recognition.interimResults=false;recognition.maxAlternatives=1;
  const button=document.getElementById("studyMicButton");button.disabled=true;button.textContent="🎙️ أستمع...";
  recognition.onresult=event=>{const value=event.results?.[0]?.[0]?.transcript||"";const input=document.getElementById("studyChatInput");if(input)input.value=(input.value+" "+value).trim();};
  recognition.onerror=()=>notify("لم أتمكن من التقاط الصوت. تحقق من إذن الميكروفون.");
  recognition.onend=()=>{button.disabled=false;button.textContent="🎙️ تحدث";};
  try{recognition.start();}catch{button.disabled=false;button.textContent="🎙️ تحدث";notify("تعذر تشغيل الميكروفون");}
}

let restoringAppHistory = false;

function getAppRoute() {
  const lessonId = currentLesson?.id || null;
  const courseId = currentCourse?.id || null;
  const activeView = document.querySelector(".nav-link.active[data-view], .bottom-nav-item.active[data-view]")?.dataset.view || "dashboard";
  return {view: activeView, courseId, lessonId, page: lessonId ? "lesson" : courseId ? "course" : "view"};
}

function saveAppHistory() {
  if (restoringAppHistory) return;
  const route = getAppRoute();
  history.pushState({maqamLearnRoute: route}, "", location.href);
}

function restoreAppRoute(route) {
  if (!route || !route.view) { navigate("dashboard"); return; }
  restoringAppHistory = true;
  try {
    currentCourse = null;
    currentLesson = null;
    if (route.page === "lesson" && route.lessonId) {
      if (route.courseId) {
        currentCourse = courses.find(c => c.id === route.courseId) || null;
        if (currentCourse) renderCourseLessons();
      }
      openLesson(route.lessonId);
    } else if (route.page === "course" && route.courseId) {
      openCourse(route.courseId);
    } else {
      navigate(route.view);
    }
  } finally {
    restoringAppHistory = false;
  }
}

function goAppBack() {
  if (history.state?.maqamLearnRoute) history.back();
  else navigate("dashboard");
}

window.addEventListener("popstate", event => {
  const route = event.state?.maqamLearnRoute;
  if (route) restoreAppRoute(route);
  else navigate("dashboard");
});

function navigate(view) {
 if(!restoringAppHistory) saveAppHistory();
 if(view==="study-assistant"){setActive(view);renderStudyAssistant();window.scrollTo({top:0,behavior:"smooth"});return;}\n if(view==="study-timer"){setActive(view);renderStandaloneTimer();window.scrollTo({top:0,behavior:"smooth"});return;}
 if(view==="intensive-b1"){ renderIntensiveLevel("B1"); return; }
 if(view==="intensive-b2"){ renderIntensiveLevel("B2"); return; }
 if(view==="zfa-preparation"){ renderZfaPreparation(); return; }
 if(view==="zfa-application"){ renderZfaApplication(); return; }
 if(view==="zfa-simulation"){ zfaSimulationIndex=0; zfaSimulationScore=0; zfaSimulationAnswered=false; renderZfaSimulation(); return; }
 if(view==="language-de"){ renderLanguage("de"); return; }
 if(view==="language-en"){ renderLanguage("en"); return; }
 if(view==="english-school"){ renderEnglishCourse(); return; }
 setActive(view);
 const pages={dashboard:renderDashboard,videos:renderVideoLibrary,library:renderLibrary,schedule:renderSchedule,assignments:renderAssignments,exams:renderExams,phrases:renderPhrases};
 if(pages[view]) pages[view]();
 else { setActive("dashboard"); renderDashboard(); }
 window.scrollTo({top:0,behavior:"smooth"});
}
document.addEventListener("click",e=>{
 const back=e.target.closest("[data-app-back]");
 if(back){goAppBack();return;}
 const nav=e.target.closest("[data-view]"); if(nav){navigate(nav.dataset.view);return;}
 const play=e.target.closest("[data-play-video]"); if(play){playVideo(play.dataset.playVideo);return;}
 const course=e.target.closest("[data-course]"); if(course){saveAppHistory();openCourse(course.dataset.course);return;}
 const lesson=e.target.closest("[data-lesson]"); if(lesson){const l=allLessons().find(x=>x.id===lesson.dataset.lesson);if(l){saveAppHistory();currentCourse=courses.find(c=>c.id===l.courseId);setActive("library");openLesson(l.id);}return;}
 const speakButton=e.target.closest("[data-speak]");
 if(speakButton){speakText(speakButton.dataset.speak,speakButton.dataset.lang||"de-DE");return;}
 const simChoice=e.target.closest("[data-sim-choice]");
 if(simChoice&&!zfaSimulationAnswered){const answers=[0,1,2,0,1,0,2,1];const explanations=["راجعي جدول المواعيد وجهزي مكان العمل وفق تعليمات الفريق.","التحية المهذبة والسؤال عن الموعد أسلوب استقبال مهني.","استمعي للمريض وانقلي المعلومات للطبيب ولا تشخّصي الحالة.","السؤال عند عدم التأكد يحافظ على سلامة العمل.","التعاطف والهدوء يساعدان المريض.","تحققي من البيانات وفق إجراءات العيادة.","معلومات المرضى سرية.","التوثيق والتسليم وترتيب المكان جزء من العمل المسؤول."];const choice=Number(simChoice.dataset.simChoice),correct=answers[zfaSimulationIndex],ok=choice===correct;if(ok)zfaSimulationScore++;zfaSimulationAnswered=true;document.querySelectorAll("[data-sim-choice]").forEach((b,i)=>{b.disabled=true;b.classList.toggle("selected-correct",i===correct);b.classList.toggle("selected-wrong",i===choice&&!ok);});const f=document.getElementById("zfa-sim-feedback");f.hidden=false;f.className="zfa-sim-feedback "+(ok?"correct":"incorrect");f.textContent=(ok?"إجابة صحيحة ✓ ":"ليست الإجابة الأفضل. ")+explanations[zfaSimulationIndex];document.querySelector('[data-action="zfa-sim-next"]').disabled=false;return;}
 const action=e.target.closest("[data-action]")?.dataset.action;
 if(action==="zfa-sim-next"){zfaSimulationIndex++;zfaSimulationAnswered=false;renderZfaSimulation();return;}
 if(action==="zfa-sim-restart"){zfaSimulationIndex=0;zfaSimulationScore=0;zfaSimulationAnswered=false;renderZfaSimulation();return;}
 if(action==="zfa-refresh-draft"){notify("تم تحديث مسودات التقديم");}
 if(action==="zfa-copy-cover"||action==="zfa-copy-cv"){const id=action==="zfa-copy-cover"?"zfa-cover-preview":"zfa-cv-preview";const textToCopy=document.getElementById(id)?.textContent||"";if(navigator.clipboard?.writeText){navigator.clipboard.writeText(textToCopy).then(()=>notify("تم نسخ النص")).catch(()=>notify("تعذر النسخ؛ حددي النص وانسخيه"));}else{notify("حددي النص وانسخيه يدوياً");}}
 if(action==="zfa-open"){document.getElementById("zfa-unit-"+e.target.closest("[data-unit]").dataset.unit)?.scrollIntoView({behavior:"smooth"});}
 if(action==="zfa-translation"){const i=e.target.closest("[data-unit]").dataset.unit;const el=document.getElementById("zfa-translation-"+i);if(el)el.hidden=!el.hidden;}
 if(action==="zfa-check"){const i=e.target.closest("[data-unit]").dataset.unit;const panel=document.getElementById("zfa-quiz-"+i);let score=0;panel.querySelectorAll(".zfa-question").forEach(q=>{const selected=q.querySelector("input:checked");const feedback=q.querySelector(".zfa-feedback");feedback.hidden=false;if(selected&&Number(selected.value)===Number(q.dataset.correct)){score++;feedback.textContent="إجابة صحيحة ✓";feedback.classList.add("correct");}else{feedback.classList.remove("correct");feedback.textContent="راجعي الإجابة الصحيحة ثم أعيدي المحاولة. "+feedback.textContent;}});document.getElementById("zfa-score-"+i).textContent="النتيجة: "+score+" / "+panel.querySelectorAll(".zfa-question").length;}
 if(action==="intensive-switch")navigate("intensive-"+e.target.closest("[data-level]").dataset.level.toLowerCase());
 if(action==="intensive-open"){document.getElementById("intensive-unit-"+e.target.closest("[data-unit]").dataset.unit)?.scrollIntoView({behavior:"smooth"});}
 if(action==="intensive-translation"){const i=e.target.closest("[data-unit]").dataset.unit;const el=document.getElementById("intensive-translation-"+i);if(el)el.hidden=!el.hidden;}
 if(action==="open-library")navigate("library");
 if(action==="phrases")navigate("phrases");
 if(action==="language-de")navigate("language-de");
 if(action==="language-en")navigate("language-en");
 if(action==="toggle-translation"){const el=document.getElementById(e.target.closest("[data-target]").dataset.target);if(el)el.hidden=!el.hidden;}
 if(action==="stop-audio")stopStudySpeech();
 const studyStop=e.target.closest("[data-study-stop]");
 if(studyStop){stopStudySpeech();return;}
 if(action==="complete-lesson"&&currentLesson){markCompleted(currentLesson.id);notify("تم تسجيل إكمال الدرس بنجاح");openLesson(currentLesson.id);}
 if(action==="back-course"&&currentCourse)renderCourseLessons();
 if((action==="previous-lesson"||action==="next-lesson")&&currentCourse&&currentLesson){
   const idx=currentCourse.lessons.findIndex(x=>x.id===currentLesson.id);
   const nextIdx=action==="next-lesson"?Math.min(idx+1,currentCourse.lessons.length-1):Math.max(idx-1,0);
   openLesson(currentCourse.lessons[nextIdx].id);
 }
 if(action==="check-quiz"&&currentLesson){let score=0;currentLesson.questions.forEach((q,i)=>{const selected=document.querySelector(`input[name="q${i}"]:checked`);const feedback=document.querySelector(`#feedback-${i}`);if(selected&&Number(selected.value)===q.correct){score++;feedback.textContent="إجابة صحيحة ✓";feedback.style.color="#27835f";}else{feedback.textContent=`الإجابة الصحيحة: ${q.options[q.correct]} — ${q.why}`;feedback.style.color="#a45c45";}});saveScore(currentLesson.id,score);notify(`نتيجتك ${score} من ${currentLesson.questions.length}`);}
});
document.querySelectorAll(".nav-link").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
const sidebar=document.querySelector("#sidebar");
const menuToggle=document.querySelector("#menuToggle");
const sidebarBackdrop=document.querySelector("#sidebarBackdrop");
function openSidebar(){
  sidebar.classList.add("open");
  sidebarBackdrop?.classList.add("visible");
  menuToggle?.setAttribute("aria-expanded","true");
  document.body.classList.add("menu-open");
}
function closeSidebar(){
  sidebar.classList.remove("open");
  sidebarBackdrop?.classList.remove("visible");
  menuToggle?.setAttribute("aria-expanded","false");
  document.body.classList.remove("menu-open");
}
function toggleSidebar(){
  if(sidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
}
menuToggle?.addEventListener("click",event=>{
  event.preventDefault();
  event.stopPropagation();
  toggleSidebar();
});
sidebarBackdrop?.addEventListener("click",closeSidebar);
document.addEventListener("keydown",event=>{
  if(event.key==="Escape") closeSidebar();
});
history.replaceState({maqamLearnRoute:{view:"dashboard",courseId:null,lessonId:null,page:"view"}}, "", location.href);
try {
  const student = await requireStudentSession(content);
  if (!student) throw new Error("يلزم تسجيل الدخول للمتابعة");
  currentStudentId = student.id;
  await initializeStudentProgress(student.id);
  courses=await loadCourses();
  renderDashboard();
} catch(error){content.innerHTML=`<div class="empty-state"><h2>تعذر تحميل المنصة</h2><p>تحقق من اتصال الإنترنت وإعدادات تسجيل الدخول، ثم أعد تحميل الصفحة.</p><small>${escapeHtml(error.message)}</small></div>`;}
