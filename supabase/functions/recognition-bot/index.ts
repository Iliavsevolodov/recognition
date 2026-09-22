import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function chunks(text: string, size = 3500) {
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.6) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) out.push(rest);
  return out;
}

Deno.serve(async (req) => {
  try {
    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
    if (!webhookSecret || req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret) return json({ error: "UNAUTHORIZED" }, 401);

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const allowedChat = Deno.env.get("TELEGRAM_CHAT_ID") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!botToken || !allowedChat || !supabaseUrl || !serviceKey) return json({ error: "CONFIG_MISSING" }, 503);

    const update = await req.json();
    const message = update?.message;
    const chatId = String(message?.chat?.id ?? "");
    const text = String(message?.text ?? "").trim();
    if (!message || !text || chatId !== String(allowedChat)) return json({ ok: true });

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const send = async (text: string) => {
      for (const part of chunks(text)) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: part }),
        });
      }
    };

    const { data: rows, error } = await db.from("recognition_submissions").select("recognition_type,first_name,last_name,partner_id,qualification,created_at").order("created_at", { ascending: true });
    if (error) throw error;
    const list = Array.isArray(rows) ? rows : [];
    const command = text.split(/\s+/)[0].toLowerCase();
    const arg = text.slice(command.length).trim().toUpperCase();
    const qualificationNames = ["S1","S2","L","L1 PRO","L2","L2 PRO","L3","L3 PRO"];

    const renderList = (items: any[], title: string) => !items.length
      ? `${title}\n\nПока заявок нет.`
      : [title, "", ...items.map((r, i) => `${i + 1}. ${r.last_name} ${r.first_name} — ID ${r.partner_id}${r.recognition_type === "qualification" ? ` — ${r.qualification}` : " — 500 PV"}`)].join("\n");

    if (command === "/start" || command === "/help") await send(["🏆 Recognition Bot", "", "/stats — общая сводка", "/all — полный список", "/pv500 — список 500 PV", "/quals — количество по квалификациям", "/q S1 — список конкретной квалификации", "", "Пример: /q L2 PRO"].join("\n"));
    else if (command === "/stats") {
      const pv = list.filter(r => r.recognition_type === "pv500").length;
      const quals = list.filter(r => r.recognition_type === "qualification").length;
      await send(`📊 Сводка признания\n\nВсего заявок: ${list.length}\n500 PV: ${pv}\nКвалификаций: ${quals}`);
    } else if (command === "/all") await send(renderList(list, "📋 Полный список"));
    else if (command === "/pv500") await send(renderList(list.filter(r => r.recognition_type === "pv500"), "🔥 500 PV"));
    else if (command === "/quals") await send(["🏆 Грамоты по квалификациям", "", ...qualificationNames.map(q => `${q}: ${list.filter(r => r.qualification === q).length}`)].join("\n"));
    else if (command === "/q") {
      if (!qualificationNames.includes(arg)) await send(`Не нашёл такую квалификацию. Используй: ${qualificationNames.join(", ")}`);
      else await send(renderList(list.filter(r => r.qualification === arg), `🏆 ${arg}`));
    } else await send("Команда не найдена. Нажми /help");

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});
