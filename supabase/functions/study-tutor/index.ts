import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "لم يتم إعداد مفتاح خدمة المساعد بعد." }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { messages = [], subject = "عام" } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return new Response(JSON.stringify({ error: "صيغة المحادثة غير صالحة." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const safeMessages = messages.slice(-12).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 5000),
    }));
    const system = `أنت مساعد تعليمي ودود داخل منصة MAßNAHME LEARN. اشرح بالعربية الواضحة وبأسلوب مبسط، وادعم الطالب في مواد ESA الألمانية والرياضيات والعلوم واللغات وZFA. إذا كتب الطالب بالألمانية أو الإنجليزية، صحح الجملة بلطف واشرح الخطأ وقدّم الصيغة الصحيحة. لا تعطِ جواباً مقتضباً فقط؛ ناقش خطوة بخطوة، اسأل سؤال متابعة عند الحاجة، وقدّم مثالاً وتمريناً قصيراً. لا تخترع معلومات أو مصادر. المادة/السياق الحالي: ${String(subject).slice(0,100)}. اجعل الإجابة منظمة ومناسبة للطالب.`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, ...safeMessages],
        temperature: 0.5,
        max_tokens: 900,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI request failed", response.status, data?.error?.message);
      return new Response(JSON.stringify({ error: "تعذر الحصول على إجابة الآن. حاول مرة أخرى بعد قليل." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ reply: data.choices?.[0]?.message?.content || "لم أتمكن من صياغة إجابة." }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Tutor function error", error);
    return new Response(JSON.stringify({ error: "حدث خطأ أثناء معالجة السؤال." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
