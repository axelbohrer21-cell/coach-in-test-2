import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "La clé OPENAI_API_KEY n’est pas encore configurée dans les secrets Supabase." }, 503);
  const authHeader = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authHeader || !url || !anonKey) return json({ error: "Authentification indisponible." }, 401);
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Session invalide. Reconnecte-toi." }, 401);
  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  const analysisId = String(payload?.analysis_id || "");
  const frames = Array.isArray(payload?.frames) ? payload.frames : [];
  if (!/^[0-9a-f-]{36}$/i.test(analysisId) || frames.length < 3 || frames.length > 8) return json({ error: "L’analyse nécessite entre 3 et 8 images extraites de la vidéo." }, 400);
  let totalChars = 0;
  for (const frame of frames) {
    if (typeof frame?.data_url !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame.data_url)) return json({ error: "Format d’image invalide." }, 400);
    totalChars += frame.data_url.length;
  }
  if (totalChars > 7_000_000) return json({ error: "Séquence trop volumineuse. Essaie une vidéo plus courte ou de meilleure qualité." }, 413);
  const { data: analysis, error: readError } = await supabase.from("coach_video_analyses").select("id,coach_id,player_id,title,stroke_type,status").eq("id", analysisId).eq("coach_id", user.id).single();
  if (readError || !analysis) return json({ error: "Analyse introuvable ou accès refusé." }, 404);
  const { error: markError } = await supabase.from("coach_video_analyses").update({ status: "processing", analysis_error: null, updated_at: new Date().toISOString() }).eq("id", analysisId).eq("coach_id", user.id);
  if (markError) return json({ error: "Impossible de démarrer l’analyse." }, 500);
  const strokeNames: Record<string,string> = { general: "geste tennis", service: "service", forehand: "coup droit", backhand: "revers", volley: "volée", return: "retour de service", footwork: "déplacements" };
  const content: any[] = [{ type: "text", text: `Tu es un assistant d’analyse vidéo pour entraîneur de tennis. Analyse uniquement ce qui est réellement visible dans les images, dans leur ordre chronologique et avec leurs horodatages. Type annoncé : ${strokeNames[analysis.stroke_type] || "geste tennis"}. Ne prétends jamais mesurer précisément les angles articulaires, la vitesse de balle, la rotation, la puissance ou la biomécanique à partir d’images fixes. Si un élément est masqué ou incertain, dis-le. Donne des observations pédagogiques prudentes, concrètes et faciles à vérifier par le coach. Distingue observation, interprétation et conseil. Réponds en français, sans diagnostic médical. Retourne un JSON strict avec : summary (string), phases (array d’objets {phase,timestamp,observation}), strengths (array de strings), corrections (array d’objets {priority,observation,correction}), drills (array d’objets {name,objective,setup}), limitations (array de strings), confidence ("faible"|"moyenne"|"bonne"). Le titre de la vidéo est : ${analysis.title}.` }];
  for (const frame of frames) {
    content.push({ type: "text", text: `Image à ${String(frame.timestamp || "inconnu")} s` });
    content.push({ type: "image_url", image_url: { url: frame.data_url, detail: "low" } });
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1-mini", temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "user", content }] })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || "Le service IA n’a pas pu analyser la vidéo.");
    const raw = result?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);
    const { error: saveError } = await supabase.from("coach_video_analyses").update({ status: "completed", analysis_result: parsed, analysis_error: null, model_name: "gpt-4.1-mini", confidence: parsed.confidence || "faible", analyzed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", analysisId).eq("coach_id", user.id);
    if (saveError) throw new Error("Analyse reçue mais impossible de l’enregistrer.");
    return json({ success: true, analysis: parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue pendant l’analyse.";
    await supabase.from("coach_video_analyses").update({ status: "failed", analysis_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", analysisId).eq("coach_id", user.id);
    return json({ error: message }, 502);
  }
});