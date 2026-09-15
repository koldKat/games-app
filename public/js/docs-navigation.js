const menu = document.querySelector('.toc');

if (menu) {
  const entries = [...menu.querySelectorAll('a[href^="#"]')]
    .map(link => ({ link, section: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
    .filter(entry => entry.section);
  let active = null;
  let queued = false;

  function select(entry) {
    if (!entry || entry === active) return;
    if (active) {
      active.link.classList.remove('active');
      active.link.removeAttribute('aria-current');
    }
    active = entry;
    active.link.classList.add('active');
    active.link.setAttribute('aria-current', 'location');

    const top = active.link.offsetTop;
    const bottom = top + active.link.offsetHeight;
    if (top < menu.scrollTop + 10) menu.scrollTop = Math.max(0, top - 10);
    else if (bottom > menu.scrollTop + menu.clientHeight - 10) menu.scrollTop = bottom - menu.clientHeight + 10;
  }

  function update() {
    let current = entries[0];
    for (const entry of entries) {
      if (entry.section.getBoundingClientRect().top <= 72) current = entry;
      else break;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = entries.at(-1);
    select(current);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  }

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  addEventListener('hashchange', schedule);
  for (const entry of entries) entry.link.addEventListener('click', () => select(entry));
  update();
}
