// خادم تصحيح احتياطي لمسابقة تاج الوقار على Cloudflare Workers AI
// يستقبل تسجيل المرة (ملف صوت) ويرجع النص اللي سمعه
const KEY = "taj-48132d5dec65";
const MODEL = "@cf/openai/whisper-large-v3-turbo";

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Taj-Key",
      "Access-Control-Expose-Headers": "X-Taj-Mode",
    };
    const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ ok: true, ai: !!env.AI });
    if (req.headers.get("X-Taj-Key") !== KEY) return json({ error: "key" }, 403);
    if (!env.AI) return json({ error: "no AI binding" }, 500);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (!buf.length) return json({ error: "empty" }, 400);
    if (buf.length > 8000000) return json({ error: "too large" }, 413);
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    const prompt = new URL(req.url).searchParams.get("p") || "";
    const opt = { task: "transcribe", language: "ar" };
    if (prompt) opt.initial_prompt = prompt;
    let r, mode = "b64";
    try {
      r = await env.AI.run(MODEL, { audio: b64, ...opt });
    } catch (e1) {
      try { mode = "bytes"; r = await env.AI.run(MODEL, { audio: [...buf], ...opt }); }
      catch (e2) { return json({ error: String((e2 && e2.message) || e2), first: String((e1 && e1.message) || e1) }, 502); }
    }
    const text = (r && (r.text || (r.transcription_info && r.transcription_info.text))) || ((r && r.segments) || []).map((s) => s.text).join(" ") || "";
    return json({ text, mode });
  },
};
