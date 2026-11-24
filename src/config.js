/** Configuration publique chargée depuis l'environnement Vercel. */
const LOCAL_FALLBACK = {
  supabaseUrl: 'https://whyylgiscrpqoahdzdkv.supabase.co',
  // Clé publique de préproduction uniquement, utilisée en développement local.
  supabaseAnonKey: 'sb_publishable_C-ZG8_bqBAwAPb9gW6cRZg_lhfsIMr'
};

async function loadRuntimeConfig() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Configuration distante indisponible');
    const value = await response.json();
    if (value?.supabaseUrl && value?.supabaseAnonKey) {
      return Object.freeze({
        supabaseUrl: value.supabaseUrl,
        supabaseAnonKey: value.supabaseAnonKey,
        appName: 'Coach In',
        vapidPublicKey: 'BJA2asPo8t947qg8DWE9qp1T8Q-ubcyG6XII3g8MFDJrlE_sYkQJIGdN4umCr6tiD5XRTWvsgvY0D6l3W8itRec',
        timezone: 'Europe/Paris',
        coachEmail: 'Axel.bohrer21@gmail.com'
      });
    }
  } catch (error) {
    console.warn('Coach In : utilisation de la configuration locale de préproduction.', error);
  }
  return Object.freeze({
    ...LOCAL_FALLBACK,
    appName: 'Coach In',
    vapidPublicKey: 'BJA2asPo8t947qg8DWE9qp1T8Q-ubcyG6XII3g8MFDJrlE_sYkQJIGdN4umCr6tiD5XRTWvsgvY0D6l3W8itRec',
    timezone: 'Europe/Paris',
    coachEmail: 'Axel.bohrer21@gmail.com'
  });
}

export const CONFIG = await loadRuntimeConfig();

export function validateConfig() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
    throw new Error('Configuration Supabase manquante.');
  }
}
