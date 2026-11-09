export const courseFiles = [
  "./data/deutsch.json", "./data/mathematik.json", "./data/english.json",
  "./data/biology.json", "./data/physics.json", "./data/chemistry.json",
  "./data/politics.json", "./data/worklife.json"
];
export async function loadCourses() {
 const results = await Promise.all(courseFiles.map(async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`تعذر تحميل ملف المادة: ${path} (HTTP ${response.status})`);
  return response.json();
 }));
 return results;
}
