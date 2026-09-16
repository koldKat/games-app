const source = new EventSource('/api/site/stream');
document.addEventListener('click', event => {
  const current = event.target.closest('.top-actions a.active');
  if (current) event.preventDefault();
});
source.addEventListener('version-updated', event => {
  try {
    const version = JSON.parse(event.data).version;
    if (version) document.querySelectorAll('[data-app-version]').forEach(element => { element.textContent = version; });
  } catch {}
});
window.addEventListener('pagehide', () => source.close(), { once: true });
