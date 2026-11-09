import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "لم يتم إعداد مفتاح Gemini في الخادم بعد." }, 503);
  }

  try {
    const { messages = [], subject = "عام" } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return json({ error: "صيغة المحادثة غير صالحة." }, 400);
    }

    const contents = messages.slice(-12).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "").slice(0, 5000) }],
    }));

    const system = `أنت مساعد تعليمي ودود داخل منصة MAßNAHME LEARN. اشرح بالعربية الواضحة وبأسلوب مبسط، وادعم الطالب في مواد ESA الألمانية والرياضيات والعلوم واللغات وZFA. إذا كتب الطالب بالألمانية أو الإنجليزية، صحح الجملة بلطف واشرح الخطأ وقدّم الصيغة الصحيحة. لا تعطِ جواباً مقتضباً فقط؛ ناقش خطوة بخطوة، اسأل سؤال متابعة عند الحاجة، وقدّم مثالاً وتمريناً قصيراً. لا تخترع معلومات أو مصادر. المادة/السياق الحالي: ${String(subject).slice(0, 100)}. اجعل الإجابة منظمة ومناسبة للطالب.`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.5, maxOutputTokens: 900 },
        }),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini request failed", response.status, data?.error?.message);
      if (response.status === 429) {
        return json({ error: "وصلنا إلى حد الاستخدام المجاني مؤقتاً. انتظر قليلاً ثم حاول مجدداً." }, 429);
      }
      return json({ error: "تعذر الحصول على إجابة الآن. تحقق من إعداد مفتاح Gemini وحاول مرة أخرى." }, 502);
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();

    return json({ reply: reply || "لم أتمكن من صياغة إجابة. جرّب إعادة السؤال." });
  } catch (error) {
    console.error("Tutor function error", error);
    return json({ error: "حدث خطأ أثناء معالجة السؤال." }, 500);
  }
});
