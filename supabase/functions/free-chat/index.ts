import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"طريقة الطلب غير مدعومة."},405);
 const key=Deno.env.get("GEMINI_API_KEY");if(!key)return reply({error:"لم يتم إعداد مفتاح Gemini في الخادم."},503);
 let body:any;try{body=await req.json()}catch{return reply({error:"تعذر قراءة الرسالة."},400)}
 if(!Array.isArray(body.messages)||!body.messages.length)return reply({error:"اكتب رسالتك أولاً."},400);
 const gender=body.personaGender==="male"?"male":"female";
 const language=String(body.preferredLanguage||"auto");
 const persona=gender==="male"?"تحدث عن نفسك بصيغة المذكر وبشخصية ودودة وطبيعية.":"تحدثي عن نفسك بصيغة المؤنث وبشخصية ودودة وطبيعية.";
 const lang=language==="auto"?"اكتشف لغة آخر رسالة وأجب باللغة نفسها، وادعم أي لغة تستطيعها.":`استخدم اللغة المحددة برمز ${language} ما لم يطلب المستخدم لغة أخرى.`;
 const system=`أنت رفيق دردشة عام داخل موقع MAßNAHME LEARN، ولست معلماً ولا مساعداً دراسياً ولا روبوت خدمة عملاء. مهمتك إجراء محادثة طبيعية وودية حول المواضيع التي يختارها المستخدم، والاستماع والتفاعل وطرح أسئلة متابعة عند ملاءمتها. لا تحوّل كل حديث إلى درس أو شرح مدرسي، ولا تفرض موضوعاً على المستخدم. ${persona} ${lang} كن محترماً وواضحاً، ولا تدّع أنك إنسان حقيقي؛ إذا سُئلت فكن صريحاً أنك مساعد محادثة ذكي.`;
 const messages=body.messages.slice(-24).map((m:any)=>({role:m.role==="assistant"?"model":"user",parts:[{text:String(m.content||"").slice(0,4000)}]})).filter((m:any)=>m.parts[0].text);
 while(messages.length&&messages[0].role==="model")messages.shift();
 if(!messages.length)return reply({error:"اكتب رسالتك أولاً."},400);
 try{
  let response:Response|null=null,data:any=null;
  for(const model of ["gemini-3.8-flash","gemini-3.5-flash-lite"]){
   response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:messages,generationConfig:{temperature:.8,maxOutputTokens:1000}}),signal:AbortSignal.timeout(30000)});
   data=await response.json().catch(()=>null);if(response.ok)break;if(response.status<500&&response.status!==429)break;
  }
  if(!response?.ok)return reply({error:"خدمة الدردشة غير متاحة حالياً. حاول بعد قليل."},502);
  const text=data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("").trim();
  return text?reply({reply:text}):reply({error:"لم يصل رد واضح. حاول مرة أخرى."},502);
 }catch{return reply({error:"تعذر الاتصال بخدمة الدردشة."},502)}
});
