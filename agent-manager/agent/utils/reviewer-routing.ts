export const reviewerIds = ["qa_reviewer", "tennis_expert", "ux_reviewer", "data_security_reviewer", "supabase_expert"] as const;

export function selectReviewers(task: string, context?: string) {
  const text = `${task}\n${context ?? ""}`.toLowerCase();
  const reasons: string[] = ["QA est inclus par défaut pour vérifier les critères et les cas limites."];

  // Select at most one domain reviewer per review request. Security takes
  // precedence over data-platform, then tennis and UX, to avoid fan-out bursts.
  const rules: Array<{ id: typeof reviewerIds[number]; pattern: RegExp; reason: string }> = [
    { id: "data_security_reviewer", pattern: /sécurité|auth|authentification|autorisation|rls|confidentialité|secret|permission|multi-coach|isolation|privilège|politique d’accès|données privées/, reason: "Priorité sécurité : le périmètre touche aux permissions ou aux données privées." },
    { id: "supabase_expert", pattern: /supabase|postgres|postgresql|sql|rpc|edge function|storage bucket|schéma de base|base de données|migration|indexation|requête sql/, reason: "Le périmètre touche aux services ou au schéma Supabase." },
    { id: "tennis_expert", pattern: /tennis|joueur|coach|classement|séance|exercice|tournoi|cours collectif|cours particulier|réservation|planning|calendrier|zone b|bilan pédagogique|défi/, reason: "Le périmètre touche aux règles métier ou aux parcours tennis." },
    { id: "ux_reviewer", pattern: /interface|frontend|front-end|écran|visuel|design|ergonomie|mobile|iphone|navigation|accessibilité|responsive|formulaire|affichage/, reason: "Le périmètre touche à l'interface ou à l'expérience utilisateur." },
  ];
  const selected = rules.find((rule) => rule.pattern.test(text));
  if (selected) reasons.push(selected.reason);
  return { reviewers: selected ? ["qa_reviewer", selected.id] : ["qa_reviewer"], reasons };
}
