export const courseFiles = [
  "./data/deutsch.json", "./data/mathematik.json", "./data/english.json",
  "./data/biology.json", "./data/chemistry.json", "./data/geography.json",
  "./data/history.json", "./data/physics.json", "./data/politics.json", "./data/worklife.json"
];

async function fetchCourseFile(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const course = await response.json();
    if (!course || !Array.isArray(course.lessons)) throw new Error("تنسيق ملف المادة غير صحيح");
    return course;
  } catch (error) {
    const reason = error.name === "AbortError" ? "انتهت مهلة التحميل بعد 20 ثانية" : error.message;
    throw new Error(`تعذر تحميل ${path}: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadCourses() {
  const results = await Promise.all(courseFiles.map(fetchCourseFile));
  return results;
}
