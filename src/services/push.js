import { supabase } from '../core/supabase.js';
import { CONFIG } from '../config.js';

function decodeApplicationServerKey(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export const pushService = {
  async enable(userId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('Les notifications push ne sont pas prises en charge par ce navigateur. Sur iPhone, ajoute Coach In à l’écran d’accueil et ouvre l’application installée.');
    }
    if (!CONFIG.vapidPublicKey) throw new Error('Le service push n’est pas encore configuré.');
    if (Notification.permission === 'denied') {
      throw new Error('Les notifications sont bloquées dans les réglages de cet appareil. Autorise-les pour Coach In puis réessaie.');
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Tu n’as pas autorisé les notifications.');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(CONFIG.vapidPublicKey)
      });
    }
    const json = subscription.toJSON();
    const { error } = await supabase.rpc('register_push_subscription', {
      p_endpoint: json.endpoint,
      p_subscription: json,
      p_user_agent: navigator.userAgent
    });
    if (error) throw error;
    return subscription;
  }
};
