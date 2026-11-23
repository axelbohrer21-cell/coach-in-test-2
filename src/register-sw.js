if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url).href)
      .catch(error => console.warn('Coach In : service worker indisponible', error));
  });
}
