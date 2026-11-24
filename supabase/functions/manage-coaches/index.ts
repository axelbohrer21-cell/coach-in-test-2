import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Connexion requise." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Session invalide." }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: caller, error: callerError } = await admin
      .from("profiles").select("id,role,is_admin,archived_at").eq("id", authData.user.id).single();
    if (callerError || !caller || caller.archived_at !== null || !(caller.is_admin === true || caller.role === "admin")) return json({ error: "Accès administrateur requis." }, 403);

    const body = await req.json();
    const action = String(body.action || "");
    if (action === "invite") return json({ error: "Un compte coach doit obligatoirement être créé via un lien de parrainage personnel généré par un coach actif." }, 403);

    if (action === "archive" || action === "restore") {
      const coachId = String(body.coach_id || "");
      if (!coachId) return json({ error: "Identifiant coach manquant." }, 400);
      const { data: coach, error: coachError } = await admin.from("profiles")
        .select("id,email,role,is_admin").eq("id", coachId).single();
      if (coachError || !coach || coach.role !== "coach" || coach.is_admin === true || coach.id === authData.user.id) return json({ error: "Compte coach introuvable ou protégé." }, 404);
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(coachId, {
        ban_duration: action === "archive" ? "876000h" : "none",
      });
      if (authUpdateError) return json({ error: authUpdateError.message }, 400);
      const { error: profileUpdateError } = await admin.from("profiles").update({
        archived_at: action === "archive" ? new Date().toISOString() : null,
      }).eq("id", coachId);
      if (profileUpdateError) return json({ error: profileUpdateError.message }, 500);
      return json({ ok: true, coach: coach.email, status: action === "archive" ? "archived" : "active" });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur serveur." }, 500);
  }
});
