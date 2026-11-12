export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', options).format(date);
}

export function formatTime(value) { return value ? String(value).slice(0, 5) : '—'; }

export function toast(message, type = 'success') {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.dataset.type = type;
  node.classList.add('visible');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove('visible'), 3600);
}

export function showDialog(content) {
  $('#dialog-content').innerHTML = content;
  const dialog = $('#app-dialog');
  if (!dialog.open) dialog.showModal();
}
export function closeDialog() { const dialog = $('#app-dialog'); if (dialog.open) dialog.close(); }
