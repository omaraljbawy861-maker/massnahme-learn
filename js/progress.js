import { supabase } from "./supabase.js";
const KEY = "massnahme-learn-progress-v1";
let studentId = null;
let saveTimer = null;
function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {completed:[],scores:{}}; } catch { return {completed:[],scores:{}}; } }
function writeLocal(data){localStorage.setItem(KEY,JSON.stringify(data));}
async function writeCloud(data){
 if(!studentId)return;
 const {error}=await supabase.from("student_progress").upsert({student_id:studentId,progress:data,updated_at:new Date().toISOString()},{onConflict:"student_id"});
 if(error)console.error("Progress cloud save failed:",error.message);
}
function queueCloud(data){if(!studentId)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>writeCloud(data),350);}
export async function initializeStudentProgress(id){
 studentId=id;
 const local=read();
 const {data,error}=await supabase.from("student_progress").select("progress").eq("student_id",id).maybeSingle();
 if(error){console.error("Progress load failed:",error.message);return;}
 if(data?.progress){
  const cloud=data.progress;
  const merged={completed:[...new Set([...(cloud.completed||[]),...(local.completed||[])])],scores:{...(cloud.scores||{}),...(local.scores||{})}};
  writeLocal(merged);await writeCloud(merged);
 }else if(local.completed.length||Object.keys(local.scores||{}).length){await writeCloud(local);}
}
export function getProgress(){return read();}
export function isCompleted(id){return read().completed.includes(id);}
export function markCompleted(id){const data=read();if(!data.completed.includes(id))data.completed.push(id);writeLocal(data);queueCloud(data);}
export function saveScore(id,score){const data=read();data.scores[id]=score;writeLocal(data);queueCloud(data);}
export function completionCount(){return read().completed.length;}
