import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { submission_id } = await req.json();
    if (!submission_id || typeof submission_id !== "string") {
      return new Response(JSON.stringify({ error: "INVALID_SUBMISSION_ID" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_ENV_MISSING");

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: row, error: rowError } = await db
      .from("recognition_submissions")
      .select("id,recognition_type,first_name,last_name,partner_id,qualification,created_at,notified_at")
      .eq("id", submission_id)
      .maybeSingle();

    if (rowError) throw rowError;
    if (!row) return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    if (row.notified_at) return new Response(JSON.stringify({ ok: true, already_notified: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    if (!botToken || !chatId) return new Response(JSON.stringify({ ok: false, pending_setup: true }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });

    const achievement = row.recognition_type === "pv500" ? "🔥 Личный объём 500 PV" : `🏆 Новая квалификация: ${row.qualification}`;
    const text = ["✨ Новая заявка на признание", "", `👤 ${row.last_name} ${row.first_name}`, `🆔 ID: ${row.partner_id}`, achievement].join("\n");

    const tg = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const tgBody = await tg.json().catch(() => ({}));
    if (!tg.ok || tgBody?.ok === false) throw new Error(`TELEGRAM_ERROR:${JSON.stringify(tgBody)}`);

    const { error: updateError } = await db.from("recognition_submissions").update({ notified_at: new Date().toISOString() }).eq("id", submission_id).is("notified_at", null);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
