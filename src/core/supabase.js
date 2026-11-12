import { CONFIG, validateConfig } from '../config.js';

validateConfig();
if (!window.supabase?.createClient) {
  throw new Error('La bibliothèque Supabase n’a pas été chargée. Vérifie ta connexion internet.');
}

export const supabase = window.supabase.createClient(
  CONFIG.supabaseUrl,
  CONFIG.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'coach-in-auth'
    }
  }
);
