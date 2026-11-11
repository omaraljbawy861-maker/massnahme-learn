import { supabase } from "./supabase.js";
const LOCAL_KEY = "massnahme_english_school_v1";
const clone = value => JSON.parse(JSON.stringify(value ?? {}));
const localRead = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch { return {}; } };
const localWrite = value => localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
function mergeLists(remote = [], local = [], keyOf) {
 const map = new Map();
 for (const item of [...remote, ...local]) { const key=keyOf(item),old=map.get(key); map.set(key,old?{...old,...item,done:Boolean(old.done||item.done)}:item); }
 return [...map.values()];
}
function mergeSchool(remote = {}, local = {}) {
 return {...local,...remote,name:remote.name||local.name||"",number:remote.number||local.number||"",className:remote.className||local.className||"",year:remote.year||local.year||"2026–2027",tasks:mergeLists(remote.tasks,local.tasks,x=>x.id||`${x.title}|${x.due||""}`),grades:mergeLists(remote.grades,local.grades,x=>x.id||`${x.title}|${x.score}|${x.date||""}`),att:mergeLists(remote.att,local.att,x=>x.date)};
}
export async function connectEnglishSchoolSync(userId,onRemoteChange=()=>{}) {
 if(!userId)throw new Error("يلزم تسجيل الدخول لمزامنة السجل الدراسي.");
 const local=localRead();
 const {data,error}=await supabase.from("english_school_records").select("school_data,updated_at").eq("user_id",userId).maybeSingle();
 if(error)throw error;
 let state=mergeSchool(data?.school_data||{},local);localWrite(state);
 const persist=async value=>{
  state=clone(value);localWrite(state);
  const {error:saveError}=await supabase.from("english_school_records").upsert({user_id:userId,school_data:state,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  if(saveError){window.dispatchEvent(new CustomEvent("english-school-sync-error",{detail:saveError.message}));throw saveError;}
  window.dispatchEvent(new CustomEvent("english-school-sync-saved"));
 };
 if(!data&&Object.keys(local).length)await persist(state);
 const channel=supabase.channel("english-school-record-"+userId).on("postgres_changes",{event:"*",schema:"public",table:"english_school_records",filter:"user_id=eq."+userId},payload=>{
  if(!payload.new?.school_data)return;state=mergeSchool(payload.new.school_data,{});localWrite(state);onRemoteChange(clone(state));
 }).subscribe();
 window.addEventListener("beforeunload",()=>{supabase.removeChannel(channel);},{once:true});
 return {get state(){return clone(state);},save:persist,close:()=>supabase.removeChannel(channel)};
}