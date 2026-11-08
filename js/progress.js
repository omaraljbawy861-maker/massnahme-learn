const KEY = "massnahme-learn-progress-v1";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { completed: [], scores: {} }; }
  catch { return { completed: [], scores: {} }; }
}
export function getProgress() { return read(); }
export function isCompleted(id) { return read().completed.includes(id); }
export function markCompleted(id) {
  const data = read();
  if (!data.completed.includes(id)) data.completed.push(id);
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function saveScore(id, score) {
  const data = read();
  data.scores[id] = score;
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function completionCount() { return read().completed.length; }
