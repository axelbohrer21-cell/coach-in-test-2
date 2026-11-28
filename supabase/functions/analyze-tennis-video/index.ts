import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const cleanText = (value: unknown, max = 700): string =>
  typeof value === "string" ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "";
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function normalizePose(value: any) {
  if (!value || value.available !== true || !Array.isArray(value.frames)) {
    return { available: false, reason: cleanText(value?.reason, 300) || "Aucun repère corporel exploitable n’a été détecté.", frames: [], summary: { frames_detected: 0, mean_visibility: 0 } };
  }
  const frames = value.frames.slice(0, 8).map((frame: any) => {
    const landmarks = Array.isArray(frame?.landmarks) ? frame.landmarks.slice(0, 33).map((point: any) => ({
      x: finite(point?.x) ?? 0,
      y: finite(point?.y) ?? 0,
      z: finite(point?.z) ?? 0,
      visibility: Math.max(0, Math.min(1, finite(point?.visibility) ?? 0)),
    })) : [];
    const angles: Record<string, number | null> = {};
    for (const key of ["left_knee","right_knee","left_elbow","right_elbow","left_hip","right_hip","left_arm_torso","right_arm_torso","leg_spread"]) {
      angles[key] = finite(frame?.joint_angles?.[key]);
    }
    const overlay = typeof frame?.overlay_data_url === "string" &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame.overlay_data_url) &&
      frame.overlay_data_url.length <= 1_200_000 ? frame.overlay_data_url : null;
    return {
      timestamp: Math.max(0, finite(frame?.timestamp) ?? 0),
      visibility: Math.max(0, Math.min(1, finite(frame?.visibility) ?? 0)),
      landmarks,
      joint_angles: angles,
      foot_spacing_image_ratio: finite(frame?.foot_spacing_image_ratio) ?? 0,
      overlay_data_url: overlay,
    };
  }).filter((frame: any) => frame.landmarks.length >= 33);
  frames.sort((a: any, b: any) => a.timestamp - b.timestamp);
  const meanVisibility = frames.length ? frames.reduce((sum: number, frame: any) => sum + frame.visibility, 0) / frames.length : 0;
  const rootOverlay = typeof value.overlay_data_url === "string" &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.overlay_data_url) &&
    value.overlay_data_url.length <= 1_200_000 ? value.overlay_data_url : null;
  return {
    available: frames.length > 0,
    model: "MediaPipe Pose Landmarker Lite · traitement local",
    frames,
    overlay_data_url: rootOverlay || frames.reduce((best: any, frame: any) => !best || frame.visibility > best.visibility ? frame.overlay_data_url : best, null),
    summary: {
      frames_detected: frames.length,
      mean_visibility: Number(meanVisibility.toFixed(2)),
      best_frame_timestamp: frames.reduce((best: any, frame: any) => !best || frame.visibility > best.visibility ? frame : best, null)?.timestamp ?? null,
      measurements_note: "Angles 2D estimés à partir des repères visibles. Ce ne sont pas des mesures biomécaniques certifiées.",
    },
    calibration: value.calibration && typeof value.calibration === "object" ? value.calibration : undefined,
  };
}

function angleStats(frames: any[], key: string) {
  const values = frames.map(frame => frame.joint_angles?.[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, min: Math.min(...values), max: Math.max(...values), count: values.length };
}
function formatAngle(value: number | null) { return value === null ? "non mesurable" : Math.round(value) + "°"; }

function buildLocalReport(pose: any, theme: string, objective: string) {
  const frames = pose.frames || [];
  const visible = frames.filter((frame: any) => frame.visibility >= 0.45);
  const meanVisibility = pose.summary?.mean_visibility ?? 0;
  const confidence = frames.length >= 7 && meanVisibility >= 0.8 ? "élevée" : frames.length >= 5 && meanVisibility >= 0.65 ? "moyenne" : "faible";
  const keys = ["left_knee","right_knee","left_elbow","right_elbow","left_arm_torso","right_arm_torso","leg_spread"];
  const stats: Record<string, any> = {};
  for (const key of keys) stats[key] = angleStats(visible, key);
  const labels: Record<string,string> = {
    left_knee:"genou gauche",right_knee:"genou droit",left_elbow:"coude gauche",right_elbow:"coude droit",
    left_arm_torso:"angle bras-tronc gauche",right_arm_torso:"angle bras-tronc droit",leg_spread:"ouverture des jambes",
  };
  const phases = frames.length ? [frames[0], frames[Math.floor((frames.length-1)/2)], frames[frames.length-1]]
    .filter((frame: any, index: number, list: any[]) => list.findIndex((item: any) => item.timestamp === frame.timestamp) === index)
    .map((frame: any, index: number) => {
      const a = frame.joint_angles || {};
      const details = [
        "genoux G/D : " + formatAngle(a.left_knee) + " / " + formatAngle(a.right_knee),
        "coudes G/D : " + formatAngle(a.left_elbow) + " / " + formatAngle(a.right_elbow),
        "bras-tronc G/D : " + formatAngle(a.left_arm_torso) + " / " + formatAngle(a.right_arm_torso),
      ];
      return { phase: ["Premier repère","Repère intermédiaire","Dernier repère"][index], timestamp: frame.timestamp.toFixed(2) + " s", observation: "Mesures 2D estimées à cet instant : " + details.join(" ; ") + ". Il s’agit d’un relevé géométrique, pas d’une interprétation technique du geste." };
    }) : [];
  const strengths: string[] = [];
  if (frames.length) strengths.push("Repères corporels détectés sur " + frames.length + " image(s) échantillonnée(s) ; " + visible.length + " présentent une visibilité suffisante pour les mesures.");
  if (meanVisibility >= 0.7) strengths.push("La silhouette est globalement bien détectée sur la séquence.");
  const corrections: any[] = [];
  const limitations = [
    "Cette version effectue une analyse géométrique locale des repères corporels ; elle ne produit pas encore une interprétation automatique fiable de la technique tennis.",
    "Les angles sont calculés en 2D : la perspective, l’orientation de la caméra et les occultations peuvent modifier les valeurs.",
    "La vitesse de balle, les effets, la puissance, le point de contact raquette-balle et le timing exact ne sont pas mesurés.",
    "Les valeurs ne doivent pas être comparées à un angle idéal universel : elles dépendent du coup, de la phase et du point de vue.",
  ];
  if (!pose.available || frames.length < 3 || meanVisibility < 0.45) {
    corrections.push({
      priority:"Priorité 1 · Qualité de la prise de vue",
      observation:"Les repères corporels sont trop peu nombreux ou trop peu visibles pour tirer une conclusion fiable.",
      correction:"Refaire une séquence avec le joueur entièrement dans le cadre, une caméra stable et les articulations non masquées.",
      exercise_name:"Nouvelle prise vidéo cadrée",
      exercise_setup:"Filmer 5 à 10 secondes depuis un angle stable, en gardant le corps entier et les pieds visibles.",
      verification_goal:"Obtenir au moins 4 images avec une visibilité correcte des articulations.",
      success_criteria:"Le corps et les deux pieds restent visibles sur la majorité des images.",
    });
  }
  const focus = !pose.available
    ? "Améliorer le cadrage pour permettre la détection des articulations."
    : meanVisibility < 0.55
      ? "Refaire une vidéo avec un cadrage plus stable et le corps entièrement visible."
      : "Revoir les repères 2D avec le joueur et confirmer visuellement le point technique à travailler avant de choisir une correction.";
  const summary = !pose.available
    ? "L’analyse locale n’a pas détecté suffisamment de repères corporels. Aucune conclusion technique n’est proposée."
    : "Analyse locale terminée pour la thématique « " + cleanText(theme,100) + " ». " +
      frames.length + " images ont été traitées sur l’appareil ; visibilité moyenne des repères : " +
      Math.round(meanVisibility*100) + " %. " +
      (cleanText(objective,300) ? "Geste / critère sélectionné : " + cleanText(objective,300) + ". " : "") +
      "Le résultat présente des mesures 2D et des repères temporels. Il ne constitue pas, à lui seul, un diagnostic technique du coup.";
  return {
    summary,
    next_session_focus: focus,
    phases,
    strengths,
    corrections,
    drills: [],
    limitations,
    confidence,
    pose_analysis: pose,
    local_analysis: { method:"MediaPipe Pose Landmarker Lite · calculs géométriques déterministes", theme:cleanText(theme,100), objective:cleanText(objective,300), angle_statistics:stats, frames_with_usable_visibility:visible.length },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const authHeader = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authHeader || !url || !anonKey) return json({ error: "Authentification indisponible." }, 401);
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Session invalide. Reconnecte-toi." }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  const analysisId = String(payload?.analysis_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(analysisId)) return json({ error: "Identifiant d’analyse invalide." }, 400);
  const pose = normalizePose(payload?.pose_analysis);
  const serializedPoseLength = JSON.stringify(pose).length;
  if (serializedPoseLength > 7_000_000) return json({ error: "Les repères calculés sont trop volumineux. Essaie une vidéo plus courte." }, 413);

  const { data: analysis, error: readError } = await supabase
    .from("coach_video_analyses")
    .select("id,coach_id,player_id,title,stroke_type,status")
    .eq("id", analysisId).eq("coach_id", user.id).single();
  if (readError || !analysis) return json({ error: "Analyse introuvable ou accès refusé." }, 404);

  const { error: markError } = await supabase.from("coach_video_analyses")
    .update({ status:"processing", analysis_error:null, updated_at:new Date().toISOString() })
    .eq("id", analysisId).eq("coach_id", user.id);
  if (markError) return json({ error: "Impossible de démarrer l’analyse." }, 500);

  try {
    const report = buildLocalReport(pose, cleanText(payload?.theme,100), cleanText(payload?.objective,300));
    const { error: saveError } = await supabase.from("coach_video_analyses").update({
      status:"completed", analysis_result:report, analysis_error:null,
      model_name:"MediaPipe Pose Landmarker Lite · local", confidence:report.confidence,
      analyzed_at:new Date().toISOString(), updated_at:new Date().toISOString(),
    }).eq("id",analysisId).eq("coach_id",user.id);
    if (saveError) throw new Error("Analyse calculée mais impossible à enregistrer.");
    return json({ success:true, analysis:report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant l’analyse locale.";
    await supabase.from("coach_video_analyses").update({
      status:"failed", analysis_error:message.slice(0,500), updated_at:new Date().toISOString(),
    }).eq("id",analysisId).eq("coach_id",user.id);
    return json({ error:message },500);
  }
});
