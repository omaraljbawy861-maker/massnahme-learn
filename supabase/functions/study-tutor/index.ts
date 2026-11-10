import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeMessages(input: unknown) {
  if (!Array.isArray(input)) return null;

  const normalized: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  for (const item of input.slice(-20)) {
    if (!item || typeof item !== "object") continue;

    const message = item as { role?: unknown; content?: unknown };
    const role = message.role === "assistant" ? "model" : "user";
    const text = String(message.content ?? "").trim().slice(0, 5000);
    if (!text) continue;

    const previous = normalized[normalized.length - 1];

    // Gemini conversation contents must begin with a user message.
    if (!previous && role === "model") continue;

    // Merge adjacent messages with the same role into one content item.
    if (previous?.role === role) {
      previous.parts[0].text += "\n\n" + text;
    } else {
      normalized.push({ role, parts: [{ text }] });
    }
  }

  return normalized.length > 0 ? normalized : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "طريقة الطلب غير مدعومة." }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      { error: "لم يتم إعداد مفتاح Gemini في إعدادات الخادم (GEMINI_API_KEY)." },
      503,
    );
  }

  let body: { messages?: unknown; subject?: unknown };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "تعذر قراءة البيانات المرسلة." }, 400);
  }

  const contents = normalizeMessages(body.messages);
  if (!contents) {
    return jsonResponse({ error: "اكتب سؤالك أولاً ثم أرسله للمساعد." }, 400);
  }

  const subject = String(body.subject ?? "عام").trim().slice(0, 100) || "عام";
  const systemInstruction = `أنت مساعد تعليمي ودود داخل منصة MAßNAHME LEARN.
اشرح بالعربية الواضحة وبأسلوب مبسط ومنظم، وراعِ مستوى طالب الصف التاسع ومواد ESA.
ساعد في الرياضيات والعلوم واللغة الألمانية والإنجليزية ومواد ZFA.
إذا كتب الطالب بالألمانية أو الإنجليزية، صحح الجملة بلطف واشرح الخطأ وقدّم الصيغة الصحيحة.
اشرح المسائل خطوة بخطوة، ولا تكتفِ بإعطاء النتيجة النهائية.
استخدم أمثلة واضحة وتمارين قصيرة عند الحاجة، ولا تخترع معلومات أو مصادر.
إذا كان السؤال غير واضح، اسأل سؤالاً واحداً لتوضيحه.
المادة أو السياق الحالي: ${subject}.`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents,
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1200,
          },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    const rawResponse = await response.text();
    let data: any;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      console.error("Gemini returned a non-JSON response:", response.status);
      return jsonResponse(
        { error: "وصل رد غير مفهوم من خدمة الذكاء الاصطناعي. حاول مرة أخرى." },
        502,
      );
    }

    if (!response.ok) {
      const apiMessage = String(data?.error?.message ?? "");
      console.error("Gemini API error:", response.status, apiMessage);

      if (response.status === 429) {
        return jsonResponse(
          { error: "وصل المساعد إلى حد الاستخدام المجاني مؤقتاً. انتظر قليلاً ثم حاول مجدداً." },
          429,
        );
      }

      if (response.status === 400) {
        return jsonResponse(
          { error: "تعذر فهم الطلب المرسل. أعد صياغة السؤال وحاول مرة أخرى." },
          400,
        );
      }

      if (response.status === 401 || response.status === 403) {
        return jsonResponse(
          { error: "مفتاح Gemini غير صالح أو لا يملك صلاحية استخدام الخدمة. تحقق من GEMINI_API_KEY." },
          502,
        );
      }

      return jsonResponse(
        { error: "خدمة المساعد غير متاحة حالياً. حاول مرة أخرى بعد قليل." },
        502,
      );
    }

    const candidate = data?.candidates?.[0];
    const reply = candidate?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();

    if (!reply) {
      console.error("Gemini returned no text. Finish reason:", candidate?.finishReason);
      return jsonResponse(
        { error: "لم يتمكن المساعد من إنشاء إجابة. جرّب كتابة السؤال بطريقة أخرى." },
        502,
      );
    }

    return jsonResponse({ reply });
  } catch (error) {
    console.error("Study tutor request failed:", error);

    if (error instanceof DOMException && error.name === "TimeoutError") {
      return jsonResponse(
        { error: "تأخر رد المساعد أكثر من اللازم. تحقق من الإنترنت وحاول مجدداً." },
        504,
      );
    }

    return jsonResponse(
      { error: "حدث خطأ أثناء الاتصال بالمساعد. حاول مرة أخرى." },
      500,
    );
  }
});
