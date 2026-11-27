import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Brain,
  CalendarCheck,
  CheckCircle2,
  Code2,
  FileCheck2,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { headers } from "next/headers";
import { auth, isManagerAllowedEmail } from "@/lib/auth";
import { AccountControl, AccessDenied, SignIn } from "@/app/_components/web-chat-auth";

const specialists = [
  { name: "Product owner", role: "product_owner", description: "Besoin, parcours et critères d'acceptation", group: "Pilotage" },
  { name: "Architecte solution", role: "solution_architect", description: "Architecture, contrats et dépendances", group: "Pilotage" },
  { name: "UI Designer", role: "ui_designer", description: "Parcours, écrans et spécifications d'interaction", group: "Conception" },
  { name: "Expert Supabase", role: "supabase_expert", description: "PostgreSQL, migrations, RPC et performance", group: "Données" },
  { name: "Développeur frontend", role: "frontend_developer", description: "Interface et expérience utilisateur", group: "Développement" },
  { name: "Développeur backend", role: "backend_developer", description: "Services, données et logique métier", group: "Développement" },
  { name: "Ingénieur QA", role: "qa_engineer", description: "Tests locaux et non-régression", group: "Qualité" },
  { name: "Responsable livraison", role: "release_manager", description: "Préparation et contrôle des livraisons", group: "Pilotage" },
  { name: "Documentation", role: "documentation_specialist", description: "Documentation fonctionnelle et technique", group: "Pilotage" },
  { name: "Auditeur de plan", role: "plan_auditor", description: "Revue indépendante des plans", group: "Revue" },
  { name: "Relecteur QA", role: "qa_reviewer", description: "Couverture et preuves de test", group: "Revue" },
  { name: "Expert tennis", role: "tennis_expert", description: "Règles métier et parcours tennis", group: "Revue" },
  { name: "Relecteur UX", role: "ux_reviewer", description: "Ergonomie, mobile et accessibilité", group: "Revue" },
  { name: "Expert sécurité", role: "data_security_reviewer", description: "Accès, confidentialité et isolation", group: "Revue" },
];

const groups = ["Pilotage", "Conception", "Développement", "Données", "Qualité", "Revue"];

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <SignIn />;
  if (!isManagerAllowedEmail(session.user.email)) return <AccessDenied />;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <AccountControl email={session.user.email} image={session.user.image} name={session.user.name} />
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <header className="flex flex-col gap-5 border-b pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Coach In · Centre de pilotage</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Manager Dashboard</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              L'équipe technique et ses garde-fous, réunis au même endroit. Les indicateurs ci-dessous décrivent la configuration connue, pas une télémétrie temps réel.
            </p>
          </div>
          <Link href="/s" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
            <MessageSquare className="size-4" />
            Démarrer une mission
            <ArrowUpRight className="size-4" />
          </Link>
        </header>

        <section aria-label="État du système" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={<Users className="size-5" />} label="Équipe spécialisée" value="14 spécialistes" detail="Rôles et responsabilités déclarés" />
          <StatusCard icon={<Brain className="size-5" />} label="Mémoire de projet" value="Blob privé" detail="Preview uniquement · test runtime restant" />
          <StatusCard icon={<ShieldCheck className="size-5" />} label="Accès" value="Liste blanche" detail="Compte autorisé uniquement sur cette Preview" />
          <StatusCard icon={<Activity className="size-5" />} label="Déploiement Manager" value="En attente" detail="Limite quotidienne Vercel à réinitialiser" />
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Workflow className="size-5 text-muted-foreground" />
              <h2 className="font-semibold">Chaîne de travail</h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <FlowCard icon={<CalendarCheck />} title="1. Cadrage" detail="Comprendre la demande, les contraintes et les critères d'acceptation." />
              <FlowCard icon={<Users />} title="2. Répartition" detail="Choisir les spécialistes et séparer les tâches sans conflit de fichiers." />
              <FlowCard icon={<Code2 />} title="3. Réalisation" detail="Développer dans des worktrees isolés, sans commit ni déploiement autonome." />
              <FlowCard icon={<FileCheck2 />} title="4. Vérification" detail="Contrôler les diffs, les tests, les preuves et les revues indépendantes." />
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <LockKeyhole className="size-5 text-muted-foreground" />
              <h2 className="font-semibold">Garde-fous actifs</h2>
            </div>
            <ul className="mt-5 space-y-3 text-sm">
              <Guardrail text="Authentification et liste blanche côté pages et canal agent" />
              <Guardrail text="Mémoire projet stockée dans un Blob privé" />
              <Guardrail text="Jeton mémoire limité à cette branche Preview" />
              <Guardrail text="Aucune écriture Supabase Production" />
              <Guardrail text="Aucun merge ni déploiement Production automatique" />
            </ul>
            <div className="mt-5 rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              La Preview n'est pas encore reconstruite sur le dernier commit. Les fonctions mémoire et l'authentification renforcée doivent être testées en conditions réelles après le prochain déploiement.
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Annuaire des agents</p>
              <h2 className="mt-1 text-xl font-semibold">Une équipe, des responsabilités distinctes</h2>
            </div>
            <span className="text-xs text-muted-foreground">14 spécialistes configurés · disponibilité runtime à confirmer</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <div key={group} className="rounded-xl border bg-card p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h3>
                <div className="space-y-3">
                  {specialists.filter((agent) => agent.group === group).map((agent) => (
                    <div key={agent.role} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{agent.description}</p>
                      </div>
                      <span className="mt-0.5 shrink-0 rounded-full border px-2 py-1 font-mono text-[10px] text-muted-foreground">{agent.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-10 flex flex-col gap-3 border-t pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Coach In Manager · Préproduction</span>
          <Link href="/s" className="inline-flex items-center gap-2 font-medium text-foreground hover:underline">
            Ouvrir l'espace de conversation <ArrowUpRight className="size-3.5" />
          </Link>
        </footer>
      </div>
    </main>
  );
}

function StatusCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs font-medium">{label}</span></div>
      <p className="mt-3 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function FlowCard({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<h3 className="text-sm font-semibold text-foreground">{title}</h3></div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function Guardrail({ text }: { text: string }) {
  return <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /><span className="leading-5">{text}</span></li>;
}
