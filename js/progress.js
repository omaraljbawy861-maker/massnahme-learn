import { supabase } from "./supabase.js";
let studentId = null;
let saveTimer = null;
let progressChannel = null;
const storageKey = () => `massnahme-learn-progress-v1:${studentId || "guest"}`;
function read(){try{return JSON.parse(localStorage.getItem(storageKey()))||{completed:[],scores:{}};}catch{return {completed:[],scores:{}};}}
function writeLocal(data){localStorage.setItem(storageKey(),JSON.stringify(data));}
function mergeProgress(cloud={},local={}){
 return {completed:[...new Set([...(cloud.completed||[]),...(local.completed||[])])],scores:{...(local.scores||{}),...(cloud.scores||{})}};
}
async function writeCloud(data){
 if(!studentId)return;
 const {error}=await supabase.from("student_progress").upsert({student_id:studentId,progress:data,updated_at:new Date().toISOString()},{onConflict:"student_id"});
 if(error){console.error("Progress cloud save failed:",error.message);window.dispatchEvent(new CustomEvent("student-progress-sync-error",{detail:error.message}));}
}
function queueCloud(data){if(!studentId)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>writeCloud(data),350);}
export async function initializeStudentProgress(id){
 studentId=id;
 const local=read();
 const {data,error}=await supabase.from("student_progress").select("progress").eq("student_id",id).maybeSingle();
 if(error)throw error;
 const merged=mergeProgress(data?.progress||{},local);
 writeLocal(merged);
 if(!data||JSON.stringify(merged)!==JSON.stringify(data.progress))await writeCloud(merged);
 if(progressChannel)await supabase.removeChannel(progressChannel);
 progressChannel=supabase.channel("student-progress-"+id)
  .on("postgres_changes",{event:"*",schema:"public",table:"student_progress",filter:"student_id=eq."+id},payload=>{
   if(!payload.new?.progress)return;
   const incoming=payload.new.progress,current=read();
   const synced={completed:[...new Set([...(current.completed||[]),...(incoming.completed||[])])],scores:{...(current.scores||{}),...(incoming.scores||{})}};
   writeLocal(synced);
   window.dispatchEvent(new CustomEvent("student-progress-cloud-updated"));
  }).subscribe();
 window.addEventListener("beforeunload",()=>{if(progressChannel)supabase.removeChannel(progressChannel);},{once:true});
}
export function getProgress(){return read();}
export function isCompleted(id){return read().completed.includes(id);}
export function markCompleted(id){const data=read();if(!data.completed.includes(id))data.completed.push(id);writeLocal(data);queueCloud(data);}
export function saveScore(id,score){const data=read();data.scores[id]=score;writeLocal(data);queueCloud(data);}
export function completionCount(){return read().completed.length;}
