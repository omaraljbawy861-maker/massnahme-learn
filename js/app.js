import { loadCourses } from "./data.js";
import { getProgress, isCompleted, markCompleted, saveScore, completionCount } from "./progress.js";

const content = document.querySelector("#appContent");
const pageTitle = document.querySelector("#pageTitle");
const toast = document.querySelector("#toast");
let courses = [];
let currentCourse = null;
let currentLesson = null;
let languageBank = null;

const labels = { dashboard:"لوحة الطالب", library:"مكتبة الكتب", schedule:"جدول الحصص", assignments:"الواجبات", exams:"الاختبارات", phrases:"مختبر اللغات", "language-de":"اللغة الألمانية", "language-en":"اللغة الإنجليزية" };

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

function speakText(text, lang="de-DE") {
  if (!("speechSynthesis" in window)) { notify("ميزة النطق غير مدعومة في هذا المتصفح"); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = lang.toLowerCase().startsWith("en") ? 0.60 : 0.78;
  utterance.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.toLowerCase().startsWith(lang.toLowerCase().split("-")[0]));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}
const allLessons = () => courses.flatMap(c => c.lessons.map(l => ({...l, courseId:c.id, courseName:c.name, courseGerman:c.german})));
const escapeHtml = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function notify(message) { toast.textContent = message; toast.classList.add("show"); setTimeout(()=>toast.classList.remove("show"),2400); }
function setActive(view) {
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  pageTitle.textContent = labels[view] || "الدرس";
  document.querySelector("#sidebar").classList.remove("open");
}
function courseProgress(course) {
  const done = course.lessons.filter(l=>isCompleted(l.id)).length;
  return Math.round(done/course.lessons.length*100);
}
function updateStats() {
  const lessons = allLessons();
  const done = completionCount();
  document.querySelector("#statSubjects").textContent = courses.length;
  document.querySelector("#statLessons").textContent = lessons.length;
  document.querySelector("#statCompleted").textContent = done;
  document.querySelector("#statProgress").textContent = `${lessons.length ? Math.round(done/lessons.length*100):0}%`;
}
function subjectCard(c, cls="subject-card") {
  const pct = courseProgress(c);
  return `<article class="${cls}" data-course="${c.id}">
    <div class="subject-top"><span class="subject-symbol">${escapeHtml(c.icon)}</span><span class="subject-code">${escapeHtml(c.code)}</span></div>
    <h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.german)} · ${c.lessons.length} دروس</p>
    <div class="progress-meta"><span>التقدم</span><strong>${pct}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
  </article>`;
}
function renderDashboard() {
  content.innerHTML = `
  <section class="welcome-banner"><div><span class="eyebrow">WILLKOMMEN · أهلاً بك</span><h1>كل خطوة تعلم، <em>تقربك من هدفك.</em></h1><p>منصتك المجانية للتحضير للشهادة المدرسية الأولى في ألمانيا.</p><button class="primary-btn" data-action="open-library">ابدأ التعلّم <span>←</span></button></div><div class="banner-seal"><div class="seal-ring">ESA<span>2026</span></div></div></section>
  <section class="stats-grid"><article class="stat-card"><span class="stat-icon gold">▤</span><div><small>المواد الدراسية</small><strong>${courses.length}</strong></div></article><article class="stat-card"><span class="stat-icon blue">▣</span><div><small>الدروس المتاحة</small><strong>${allLessons().length}</strong></div></article><article class="stat-card"><span class="stat-icon green">✓</span><div><small>الدروس المكتملة</small><strong>${completionCount()}</strong></div></article><article class="stat-card"><span class="stat-icon purple">◷</span><div><small>نسبة الإنجاز</small><strong>${Math.round(completionCount()/Math.max(1,allLessons().length)*100)}%</strong></div></article></section>
  <section class="section-block"><div class="section-heading"><div><span class="eyebrow">DEIN LERNWEG</span><h2>المواد الدراسية</h2></div><button class="text-btn" data-action="open-library">عرض كل المواد ←</button></div><div class="subject-grid">${courses.map(c=>subjectCard(c)).join("")}</div></section>
  <section class="bottom-grid"><article class="panel"><div class="panel-heading"><h3>ابدأ من هنا</h3><span class="subtle-tag">دروس مقترحة</span></div><div class="continue-list">${allLessons().slice(0,4).map(l=>`<div class="continue-item"><div><strong>${escapeHtml(l.title)}</strong><small>${escapeHtml(l.courseName)} · ${escapeHtml(l.duration)}</small></div><button class="mini-btn" data-lesson="${l.id}">فتح الدرس</button></div>`).join("")}</div></article><article class="panel quote-panel"><span class="quote-mark">“</span><h3>Bildung für alle</h3><p>التعليم حق وفرصة. تعلم اليوم شيئاً جديداً، ولو كان صغيراً.</p><span class="quote-line"></span></article></section>`;
  updateStats();
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
function navigate(view) {
 if(view==="language-de"){ renderLanguage("de"); return; }
 if(view==="language-en"){ renderLanguage("en"); return; }
 setActive(view);
 const pages={dashboard:renderDashboard,library:renderLibrary,schedule:renderSchedule,assignments:renderAssignments,exams:renderExams,phrases:renderPhrases};
 if(pages[view]) pages[view]();
 else { setActive("dashboard"); renderDashboard(); }
 window.scrollTo({top:0,behavior:"smooth"});
}
document.addEventListener("click",e=>{
 const nav=e.target.closest("[data-view]"); if(nav){navigate(nav.dataset.view);return;}
 const course=e.target.closest("[data-course]"); if(course){openCourse(course.dataset.course);return;}
 const lesson=e.target.closest("[data-lesson]"); if(lesson){const l=allLessons().find(x=>x.id===lesson.dataset.lesson);if(l){currentCourse=courses.find(c=>c.id===l.courseId);setActive("library");openLesson(l.id);}return;}
 const speakButton=e.target.closest("[data-speak]");
 if(speakButton){speakText(speakButton.dataset.speak,speakButton.dataset.lang||"de-DE");return;}
 const action=e.target.closest("[data-action]")?.dataset.action;
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
try { courses=await loadCourses(); renderDashboard(); }
catch(error){content.innerHTML=`<div class="empty-state"><h2>تعذر تحميل بيانات المواد</h2><p>افتح المشروع باستخدام Live Server في Visual Studio Code، ولا تفتح index.html مباشرة.</p><small>${escapeHtml(error.message)}</small></div>`;}
