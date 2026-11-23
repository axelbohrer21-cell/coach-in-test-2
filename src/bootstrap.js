const errorBox = document.getElementById('auth-error');
const showBootError = (message) => {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
};

const loadScript = (src, integrity) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = src;
  script.integrity = integrity;
  script.crossOrigin = 'anonymous';
  script.async = true;
  script.onload = resolve;
  script.onerror = () => reject(new Error('Chargement sécurisé de la bibliothèque Supabase impossible.'));
  document.head.appendChild(script);
});

try {
  await loadScript(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.js',
    'sha384-A97u3Qnt9GZHURO9YJZRe7VQgGUeFzcv6I1oIGnUTxQrCxnpQMwR0/G8F2zt9abZ'
  );
  if (!window.supabase?.createClient) {
    throw new Error('La bibliothèque de connexion Supabase est indisponible.');
  }
  await import('./app.js');
} catch (error) {
  console.error('Coach In : démarrage impossible', error);
  showBootError('Coach In n’a pas pu démarrer correctement. Vérifie ta connexion puis actualise la page.');
}
