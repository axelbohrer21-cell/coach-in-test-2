/** Configuration publique de l'application. La clé publishable/anon est prévue pour le navigateur. */
/**
 * Branche QA dédiée : ce fichier pointe volontairement vers Supabase de préproduction.
 * Ne pas fusionner cette configuration dans main / production.
 */
export const CONFIG = Object.freeze({
  supabaseUrl: 'https://whyylgiscrpqoahdzdkv.supabase.co',
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
