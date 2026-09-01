const source = new EventSource('/api/site/stream');
source.addEventListener('version-updated', event => {
  try {
    const version = JSON.parse(event.data).version;
    if (version) document.querySelectorAll('[data-app-version]').forEach(element => { element.textContent = version; });
  } catch {}
});
window.addEventListener('pagehide', () => source.close(), { once: true });
