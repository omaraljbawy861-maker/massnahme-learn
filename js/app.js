import { loadCourses } from "./data.js?v=20261109-5";
import { supabase } from "./supabase.js";
import { requireStudentSession } from "./auth.js?v=20261109-2";
import { initializeStudentProgress, getProgress, isCompleted, markCompleted, saveScore, completionCount } from "./progress.js?v=20261109-3";

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
let studyChatMessages = [];

const labels = { videos:"مكتبة الفيديوهات", dashboard:"لوحة الطالب", library:"مكتبة الكتب", schedule:"جدول الحصص", assignments:"الواجبات", exams:"الاختبارات", phrases:"مختبر اللغات", "language-de":"اللغة الألمانية", "language-en":"اللغة الإنجليزية", "intensive-b1":"الألمانية المكثفة B1", "intensive-b2":"الألمانية المكثفة B2", "zfa-preparation":"التحضير لتدريب مساعدة طبيب الأسنان", "zfa-application":"ملف التقديم والمقابلة ZFA", "zfa-simulation":"محاكاة يوم في عيادة الأسنان", "study-assistant":"المساعد الدراسي الذكي" };

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

function waitForSpeechVoices() {
  return new Promise(resolve => {
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    if (voices.length) return resolve(voices);
    const done = () => {
      voices = synth.getVoices();
      resolve(voices);
    };
    synth.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1200);
  });
}

async function speakText(text, lang) {
  if (!("speechSynthesis" in window)) {
    notify("ميزة النطق غير مدعومة في هذا المتصفح.");
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const detected = lang || detectSpeechLanguage(text);
  const languagePrefix = detected.toLowerCase().split("-")[0];
  const voices = await waitForSpeechVoices();
  const matchingVoices = voices.filter(v => v.lang.toLowerCase().startsWith(languagePrefix));

  if (!matchingVoices.length) {
    const languageName = languagePrefix === "ar" ? "العربية" : languagePrefix === "de" ? "الألمانية" : "الإنجليزية";
    notify(`لا يوجد صوت ${languageName} مثبت على الجهاز. أضف صوت هذه اللغة من إعدادات النظام.`);
    return;
  }

  const preferred = matchingVoices.find(v => v.default) || matchingVoices[0];
  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = preferred.lang;
  utterance.voice = preferred;
  utterance.rate = languagePrefix === "en" ? 0.88 : languagePrefix === "ar" ? 0.90 : 0.86;
  utterance.pitch = 1;
  utterance.onerror = () => notify("تعذر تشغيل الصوت. تحقق من إعدادات الصوت في الجهاز.");
  synth.speak(utterance);
}
const allLessons = () => courses.flatMap(c => c.lessons.map(l => ({...l, courseId:c.id, courseName:c.name, courseGerman:c.german})));
const escapeHtml = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function notify(message) { toast.textContent = message; toast.classList.add("show"); setTimeout(()=>toast.classList.remove("show"),2400); }
function setActive(view) {
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.querySelectorAll(".bottom-nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  pageTitle.textContent = labels[view] || "الدرس";
  document.querySelector("#sidebar").classList.remove("open");
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
    const response=await fetch("./data/video-library.json?v=19",{cache:"no-store"});
    if(!response.ok)throw new Error("تعذر تحميل مكتبة الفيديوهات");
    const data=await response.json();videoLibrary=data.items||[];
  }
  const subjects=[...new Set(videoLibrary.map(v=>v.subject))].map(id=>({id,label:({mathematics:"الرياضيات",german:"الألمانية",english:"الإنجليزية",biology:"الأحياء",politics:"السياسة",history:"التاريخ",zfa:"طب الأسنان ZFA",worklife:"العمل والحياة المهنية", "german-b1":"الألمانية B1", "german-b2":"الألمانية B2",all:"مواد متعددة"})[id]||id}));
  content.innerHTML=`<div class="page-intro"><span class="eyebrow">VIDEO CAMPUS · مكتبة المشاهدة</span><h1>مكتبة الفيديوهات التعليمية</h1><p>محتوى تعليمي مرئي منتقى من جهات تعليمية ألمانية، مع مساحة مشاهدة داخل المنصة.</p></div>
  <div class="video-library-toolbar"><input id="videoSearch" class="language-search" placeholder="ابحث عن مادة أو موضوع أو جهة تعليمية..."><select id="videoSubjectFilter"><option value="all">كل المواد</option>${subjects.map(x=>`<option value="${x.id}">${x.label}</option>`).join("")}</select></div>
  <div class="video-campus-layout"><section><div class="video-grid" id="videoGrid">${videoLibrary.map(videoCard).join("")}</div></section><aside class="video-player-panel" id="videoPlayerPanel"><div class="video-player-empty"><span>▶</span><h3>مساحة مشاهدة الدروس</h3><p>اختر محتوى من المكتبة لعرضه هنا دون مغادرة MAßNAHME LEARN.</p></div></aside></div>
  <p class="video-note">بعض الجهات تسمح بتضمين الفيديو، وبعضها تمنع عرض صفحاتها داخل مواقع أخرى. نضيف الفيديوهات الفردية إلى المكتبة بعد التحقق من رابط التضمين وحقوق عرضه.</p>`;
  document.querySelector("#videoSearch").addEventListener("input",filterVideos);
  document.querySelector("#videoSubjectFilter").addEventListener("change",filterVideos);
}
function videoCard(v){
 return `<article class="video-resource-card" data-video-card="${v.id}" data-subject="${v.subject}" data-search="${escapeHtml((v.title+" "+v.provider+" "+v.subjectName+" "+v.description).toLowerCase())}">
 <div class="video-card-art"><span>▶</span><small>MAßNAHME VIDEO CAMPUS</small></div><div class="video-card-body"><span class="video-chip">${escapeHtml(v.subjectName)}</span><h3>${escapeHtml(v.title)}</h3><p>${escapeHtml(v.description)}</p><div class="video-card-meta"><span>${escapeHtml(v.provider)}</span><small>${escapeHtml(v.level)}</small></div><button class="primary-btn" data-play-video="${v.id}">${v.type==="external"?"↗ مشاهدة من المصدر الرسمي":"▶ تشغيل الدرس هنا"}</button></div></article>`;
}
function filterVideos(){
 const q=document.querySelector("#videoSearch").value.trim().toLowerCase(),subject=document.querySelector("#videoSubjectFilter").value;
 document.querySelectorAll("[data-video-card]").forEach(card=>card.hidden=!(card.dataset.search.includes(q)&&(subject==="all"||card.dataset.subject===subject)));
}
function playVideo(id){
 const v=videoLibrary.find(x=>x.id===id);if(!v)return;
 const panel=document.querySelector("#videoPlayerPanel");
 let player="";
 if(v.type==="mp4" && v.src && !/^https?:\/\//i.test(v.src)){
   player=`<video controls playsinline preload="metadata" src="${escapeHtml(v.src)}"></video>`;
 }else if(v.type==="youtube"||v.type==="vimeo"){
   const src=v.type==="vimeo"?`https://player.vimeo.com/video/${encodeURIComponent(v.videoId)}`:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.videoId)}?rel=0`;
   player=`<iframe src="${src}" title="${escapeHtml(v.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
 }else if(v.type==="external" && v.url){
   player=`<div class="video-player-empty"><span>▶</span><h3>الفيديو متاح من المصدر الرسمي</h3><p>هذا المصدر لا يوفّر تضميناً مؤكداً داخل المنصة. افتح المشاهدة الرسمية من الزر أدناه.</p><a class="primary-btn" href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">▶ مشاهدة الفيديو من المصدر الرسمي</a></div>`;
 }else{
   player=`<div class="video-player-empty"><span>!</span><h3>رابط الفيديو غير مكتمل</h3><p>هذا العنصر لا يحتوي على ملف أو رابط تشغيل صالح حتى الآن.</p></div>`;
 }
 panel.innerHTML=`<div class="video-player-heading"><span class="eyebrow">MAßNAHME · INTERNAL PLAYER</span><h2>${escapeHtml(v.title)}</h2><p>${escapeHtml(v.subjectName)} · ${escapeHtml(v.level)}</p></div><div class="embedded-video-frame">${player}</div><div class="video-player-description"><h3>عن الدرس</h3><p>${escapeHtml(v.description)}</p><p class="video-note">المشاهدة تبقى ضمن صفحة MAßNAHME LEARN. بعض المقاطع تُبث من مزوّد الفيديو داخل المشغّل المدمج، ولا نفتح صفحة خارجية.</p></div>`;
 panel.scrollIntoView({behavior:"smooth",block:"start"});
}

function renderDashboard() {
  content.innerHTML = `
  <section class="welcome-banner"><div><span class="eyebrow">WILLKOMMEN · أهلاً بك</span><h1>كل خطوة تعلم، <em>تقربك من هدفك.</em></h1><p>منصتك المجانية للتحضير للشهادة المدرسية الأولى في ألمانيا.</p><button class="primary-btn" data-action="open-library">ابدأ التعلّم <span>←</span></button></div><div class="banner-seal"><div class="seal-ring">ESA<span>2026</span></div></div></section>
  <section class="stats-grid"><article class="stat-card"><span class="stat-icon gold">▤</span><div><small>المواد الدراسية</small><strong>${courses.length}</strong></div></article><article class="stat-card"><span class="stat-icon blue">▣</span><div><small>الدروس المتاحة</small><strong>${allLessons().length}</strong></div></article><article class="stat-card"><span class="stat-icon green">✓</span><div><small>الدروس المكتملة</small><strong>${completionCount()}</strong></div></article><article class="stat-card"><span class="stat-icon purple">◷</span><div><small>نسبة الإنجاز</small><strong>${Math.round(completionCount()/Math.max(1,allLessons().length)*100)}%</strong></div></article></section>
  <section class="section-block"><div class="section-heading"><div><span class="eyebrow">DEIN LERNWEG</span><h2>المواد الدراسية</h2></div><button class="text-btn" data-action="open-library">عرض كل المواد ←</button></div><div class="subject-grid">${courses.map(c=>subjectCard(c)).join("")}</div></section>
  <section class="bottom-grid"><article class="panel"><div class="panel-heading"><h3>ابدأ من هنا</h3><span class="subtle-tag">دروس مقترحة</span></div><div class="continue-list">${allLessons().slice(0,4).map(l=>`<div class="continue-item"><div><strong>${escapeHtml(l.title)}</strong><small>${escapeHtml(l.courseName)} · ${escapeHtml(l.duration)}</small></div><button class="mini-btn" data-lesson="${l.id}">فتح الدرس</button></div>`).join("")}</div></article><article class="panel quote-panel"><span class="quote-mark">“</span><h3>Bildung für alle</h3><p>التعليم حق وفرصة. تعلم اليوم شيئاً جديداً، ولو كان صغيراً.</p><span class="quote-line"></span></article></section>`;
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

function renderStudyAssistant(){
  if(studyTimerInterval){clearInterval(studyTimerInterval);studyTimerInterval=null;}
  studyTimerRunning=false;
  content.innerHTML=`<div class="page-intro"><span class="eyebrow">YOUR STUDY COMPANION · رفيق دراستك</span><h1>المساعد الدراسي التفاعلي</h1><p>نظّم وقتك، اكتب سؤالك أو تحدث عبر الميكروفون، وناقش الدرس خطوة بخطوة.</p></div>
  <section class="study-tools-grid">
    <article class="study-timer-card">
      <div class="study-card-heading"><span class="study-tool-icon">◷</span><div><h2>مؤقّت الدراسة</h2><p>جلسة تركيز بدون تشتيت</p></div></div>
      <div class="study-timer-display" id="studyTimerDisplay">25:00</div>
      <label class="study-timer-label" for="studyTimerMinutes">مدة الجلسة بالدقائق</label>
      <input id="studyTimerMinutes" type="number" min="1" max="180" value="25">
      <div class="study-timer-actions"><button class="primary-btn" id="studyTimerStart">ابدأ</button><button class="secondary-btn" id="studyTimerPause" disabled>إيقاف مؤقت</button><button class="secondary-btn" id="studyTimerReset">إعادة</button></div>
      <p class="study-timer-status" id="studyTimerStatus" aria-live="polite">جاهز لجلسة دراسة جديدة</p>
    </article>
    <article class="study-chat-card">
      <div class="study-card-heading"><span class="study-tool-icon">✦</span><div><h2>اسأل وناقش</h2><p>مساعد يشرح ويصحح ويعطيك أمثلة</p></div></div>
      <label for="studySubject">المادة أو الموضوع</label>
      <select id="studySubject"><option>عام</option><option>الرياضيات</option><option>الألمانية</option><option>الإنجليزية</option><option>الأحياء والعلوم</option><option>التاريخ والجغرافيا</option><option>السياسة والعمل</option><option>مساعدة طبيب الأسنان ZFA</option></select>
      <div class="study-chat-messages" id="studyChatMessages" aria-live="polite"><div class="study-message assistant"><b>المساعد الدراسي</b><p>أهلاً بك! اكتب سؤالك أو جملة تريد تصحيحها. فيك تطلب مني أشرح بطريقة أبسط أو أعطيك تمريناً.</p></div></div>
      <form id="studyChatForm" class="study-chat-form"><textarea id="studyChatInput" rows="2" maxlength="3000" placeholder="اكتب سؤالك أو الجملة التي تريد مناقشتها..." required></textarea><div class="study-chat-controls"><button type="button" class="secondary-btn" id="studyMicButton">🎙️ تحدث</button><label class="study-voice-toggle"><input type="checkbox" id="studyVoiceReply"> اقرأ الرد بصوت</label><button class="primary-btn" id="studySendButton" type="submit">إرسال السؤال ←</button></div></form>
      <p class="study-tutor-note" id="studyTutorStatus">المحادثة الذكية تحتاج تفعيل خدمة المساعد على الخادم أولاً.</p>
    </article>
  </section>
  <div class="study-tips"><b>أمثلة لما يمكنك سؤاله:</b><span>اشرح لي الكسور بطريقة سهلة.</span><span>صحّح هذه الجملة الألمانية وناقشني بالسبب.</span><span>اختبرني بخمسة أسئلة عن الخلية.</span></div>`;
  document.getElementById("studyTimerStart").addEventListener("click",startStudyTimer);
  document.getElementById("studyTimerPause").addEventListener("click",pauseStudyTimer);
  document.getElementById("studyTimerReset").addEventListener("click",resetStudyTimer);
  document.getElementById("studyTimerMinutes").addEventListener("change",resetStudyTimer);
  document.getElementById("studyChatForm").addEventListener("submit",sendStudyMessage);
  document.getElementById("studyMicButton").addEventListener("click",startStudyDictation);
  renderStudyTimer();
}
function renderStudyTimer(){
  const display=document.getElementById("studyTimerDisplay");if(!display)return;
  const m=Math.floor(studyTimerRemaining/60),s=studyTimerRemaining%60;
  display.textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  document.getElementById("studyTimerStart").disabled=studyTimerRunning;
  document.getElementById("studyTimerPause").disabled=!studyTimerRunning;
}
function startStudyTimer(){
  if(studyTimerRunning)return;
  const input=document.getElementById("studyTimerMinutes");
  if(studyTimerRemaining<=0)studyTimerRemaining=Math.max(1,Math.min(180,Number(input?.value)||25))*60;
  studyTimerRunning=true;renderStudyTimer();
  document.getElementById("studyTimerStatus").textContent="أحسنت! ركّز على دراستك، المؤقّت يعمل الآن.";
  studyTimerInterval=setInterval(()=>{
    studyTimerRemaining=Math.max(0,studyTimerRemaining-1);renderStudyTimer();
    if(studyTimerRemaining===0){pauseStudyTimer();const status=document.getElementById("studyTimerStatus");if(status)status.textContent="انتهت الجلسة! خذ استراحة قصيرة ثم تابع.";notify("انتهى وقت جلسة الدراسة");if("speechSynthesis" in window)speakText("انتهى وقت الدراسة. أحسنت!","ar-SA");}
  },1000);
}
function pauseStudyTimer(){
  if(studyTimerInterval)clearInterval(studyTimerInterval);
  studyTimerInterval=null;studyTimerRunning=false;renderStudyTimer();
  const status=document.getElementById("studyTimerStatus");if(status)status.textContent="تم إيقاف المؤقّت مؤقتاً.";
}
function resetStudyTimer(){
  pauseStudyTimer();
  const minutes=Math.max(1,Math.min(180,Number(document.getElementById("studyTimerMinutes")?.value)||25));
  studyTimerRemaining=minutes*60;renderStudyTimer();
  const status=document.getElementById("studyTimerStatus");if(status)status.textContent="تم ضبط جلسة جديدة لمدة "+minutes+" دقيقة.";
}
function appendStudyMessage(role,text){
  const box=document.getElementById("studyChatMessages");if(!box)return;
  const item=document.createElement("div");item.className="study-message "+role;
  const heading=document.createElement("b");heading.textContent=role==="user"?"أنت":"المساعد الدراسي";
  const paragraph=document.createElement("p");paragraph.textContent=text;
  item.append(heading,paragraph);box.append(item);box.scrollTop=box.scrollHeight;
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
    const {data,error}=await supabase.functions.invoke("study-tutor",{body:{messages:studyChatMessages,subject:document.getElementById("studySubject").value}});
    if(error)throw error;
    if(!data?.reply)throw new Error(data?.error||"لم يصل رد من المساعد.");
    appendStudyMessage("assistant",data.reply);studyChatMessages.push({role:"assistant",content:data.reply});
    if(document.getElementById("studyVoiceReply").checked)speakText(data.reply);
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
function startStudyDictation(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){notify("الإملاء الصوتي غير مدعوم في هذا المتصفح. استخدم الكتابة.");return;}
  const recognition=new Recognition();recognition.lang="ar-SA";recognition.interimResults=false;recognition.maxAlternatives=1;
  const button=document.getElementById("studyMicButton");button.disabled=true;button.textContent="🎙️ أستمع...";
  recognition.onresult=event=>{const value=event.results?.[0]?.[0]?.transcript||"";const input=document.getElementById("studyChatInput");if(input)input.value=(input.value+" "+value).trim();};
  recognition.onerror=()=>notify("لم أتمكن من التقاط الصوت. تحقق من إذن الميكروفون.");
  recognition.onend=()=>{button.disabled=false;button.textContent="🎙️ تحدث";};
  try{recognition.start();}catch{button.disabled=false;button.textContent="🎙️ تحدث";notify("تعذر تشغيل الميكروفون");}
}

function navigate(view) {
 if(view==="study-assistant"){setActive(view);renderStudyAssistant();window.scrollTo({top:0,behavior:"smooth"});return;}
 if(view==="intensive-b1"){ renderIntensiveLevel("B1"); return; }
 if(view==="intensive-b2"){ renderIntensiveLevel("B2"); return; }
 if(view==="zfa-preparation"){ renderZfaPreparation(); return; }
 if(view==="zfa-application"){ renderZfaApplication(); return; }
 if(view==="zfa-simulation"){ zfaSimulationIndex=0; zfaSimulationScore=0; zfaSimulationAnswered=false; renderZfaSimulation(); return; }
 if(view==="language-de"){ renderLanguage("de"); return; }
 if(view==="language-en"){ renderLanguage("en"); return; }
 setActive(view);
 const pages={dashboard:renderDashboard,videos:renderVideoLibrary,library:renderLibrary,schedule:renderSchedule,assignments:renderAssignments,exams:renderExams,phrases:renderPhrases};
 if(pages[view]) pages[view]();
 else { setActive("dashboard"); renderDashboard(); }
 window.scrollTo({top:0,behavior:"smooth"});
}
document.addEventListener("click",e=>{
 const nav=e.target.closest("[data-view]"); if(nav){navigate(nav.dataset.view);return;}
 const play=e.target.closest("[data-play-video]"); if(play){playVideo(play.dataset.playVideo);return;}
 const course=e.target.closest("[data-course]"); if(course){openCourse(course.dataset.course);return;}
 const lesson=e.target.closest("[data-lesson]"); if(lesson){const l=allLessons().find(x=>x.id===lesson.dataset.lesson);if(l){currentCourse=courses.find(c=>c.id===l.courseId);setActive("library");openLesson(l.id);}return;}
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
 if(action==="stop-audio"&&"speechSynthesis" in window)window.speechSynthesis.cancel();
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
document.querySelector("#menuToggle").addEventListener("click",()=>document.querySelector("#sidebar").classList.toggle("open"));
document.querySelector("#bottomMore")?.addEventListener("click",()=>document.querySelector("#sidebar").classList.toggle("open"));
try {
  const student = await requireStudentSession(content);
  if (!student) throw new Error("يلزم تسجيل الدخول للمتابعة");
  await initializeStudentProgress(student.id);
  courses=await loadCourses();
  renderDashboard();
} catch(error){content.innerHTML=`<div class="empty-state"><h2>تعذر تحميل المنصة</h2><p>تحقق من اتصال الإنترنت وإعدادات تسجيل الدخول، ثم أعد تحميل الصفحة.</p><small>${escapeHtml(error.message)}</small></div>`;}
