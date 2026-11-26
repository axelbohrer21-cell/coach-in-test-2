export const reviewerIds = ["qa_reviewer", "tennis_expert", "ux_reviewer", "data_security_reviewer", "supabase_expert"] as const;

export function selectReviewers(task: string, context?: string) {
  const text = `${task}\n${context ?? ""}`.toLowerCase();
  const selected = new Set<string>(["qa_reviewer"]);
  const reasons: string[] = ["QA est inclus par défaut pour vérifier les critères et les cas limites."];

  const rules: Array<{ id: typeof reviewerIds[number]; pattern: RegExp; reason: string }> = [
    { id: "tennis_expert", pattern: /tennis|joueur|coach|classement|séance|exercice|tournoi|cours collectif|cours particulier|réservation|planning|calendrier|zone b|bilan pédagogique|défi/, reason: "Le périmètre touche aux règles métier ou aux parcours tennis." },
    { id: "ux_reviewer", pattern: /interface|frontend|front-end|écran|visuel|design|ergonomie|mobile|iphone|navigation|accessibilité|responsive|formulaire|affichage/, reason: "Le périmètre touche à l'interface, à l'accessibilité ou à l'expérience mobile." },
    { id: "data_security_reviewer", pattern: /sécurité|auth|authentification|autorisation|rls|confidentialité|secret|permission|multi-coach|isolation|privilège|politique d’accès|données privées/, reason: "Le périmètre touche aux permissions, à la confidentialité ou à la sécurité des données." },
    { id: "supabase_expert", pattern: /supabase|postgres|postgresql|sql|rpc|edge function|storage bucket|schéma de base|base de données|migration|indexation|requête sql/, reason: "Le périmètre touche au schéma PostgreSQL, aux migrations, aux RPC ou aux services Supabase." },
  ];
  for (const rule of rules) if (rule.pattern.test(text)) { selected.add(rule.id); reasons.push(rule.reason); }
  return { reviewers: [...selected], reasons };
}
