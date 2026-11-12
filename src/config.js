/** Configuration publique de l'application. La clé publishable/anon est prévue pour le navigateur. */
export const CONFIG = Object.freeze({
  supabaseUrl: 'https://whyylgiscrpqoahdzdkv.supabase.co',
  // Clé publishable publique du projet. Ne jamais placer une clé service_role ici.
  supabaseAnonKey: 'sb_publishable_C-ZG8_bqBAwAPb9gW6cRZg_lhfsIMrB',
  appName: 'Coach In',
  timezone: 'Europe/Paris',
  coachEmail: 'Axel.bohrer21@gmail.com'
});

export function validateConfig() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
    throw new Error('Configuration Supabase manquante dans src/config.js.');
  }
}
