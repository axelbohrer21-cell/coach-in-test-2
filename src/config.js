/** Configuration publique chargée depuis l'environnement Vercel. */
function buildRuntimeConfig(value) {
  return Object.freeze({
    supabaseUrl: value.supabaseUrl,
    supabaseAnonKey: value.supabaseAnonKey,
    appName: 'Coach In',
    vapidPublicKey: 'BDWLCIv7_fXVqXO17_-ZVjNDU8aT4uPt12cjGQOuJOKwTenM26Dh1nHMa4whfY6xSL85v3glB_NmDGxJbOfpESM',
    timezone: 'Europe/Paris',
    coachEmail: 'Axel.bohrer21@gmail.com'
  });
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Configuration distante indisponible');
    const value = await response.json();
    if (!value?.supabaseUrl || !value?.supabaseAnonKey) throw new Error('Configuration Supabase incomplète');
    return buildRuntimeConfig(value);
  } catch (error) {
    // En production, ne jamais basculer silencieusement vers la base de préproduction.
    if (import.meta.env?.DEV === true && import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY) {
      console.warn('Coach In : configuration locale explicite utilisée en développement.', error);
      return buildRuntimeConfig({
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
      });
    }
    console.error('Coach In : chargement de la configuration Supabase impossible.', error);
    throw new Error('Impossible de charger la configuration Coach In. Vérifie la connexion puis réessaie. Aucune base de test ne sera utilisée en remplacement.');
  }
}

export const CONFIG = await loadRuntimeConfig();

export function validateConfig() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
    throw new Error('Configuration Supabase manquante.');
  }
}
