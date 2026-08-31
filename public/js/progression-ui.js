function formatXp(value) { return Number(value || 0).toLocaleString(); }
const XP_ANIM_MS_PER_LEVEL = 100;
function progressAt(xp, target) {
  const value = Math.max(0, Math.round(Number(xp) || 0));
  const level = Math.min(100, Math.floor((-1 + Math.sqrt(1 + (8 * value) / 1000)) / 2));
  const currentLevelXp = 1000 * level * (level + 1) / 2;
  const nextLevelXp = level >= 100 ? currentLevelXp : 1000 * (level + 1) * (level + 2) / 2;
  return { ...target, xp: value, level, currentLevelXp, nextLevelXp, progress: nextLevelXp === currentLevelXp ? 100 : Math.round((value - currentLevelXp) / (nextLevelXp - currentLevelXp) * 100) };
}

export function createProgressionUi({ api }) {
  let progress = null;
  let displayedXp = null; let queue = []; let animating = false; let highestQueuedXp = 0;
  function render(next = progress) {
    progress = next || progress; if (!progress) return;
    const percent = Math.max(0, Math.min(100, progress.progress || 0));
    const root = document.getElementById('account-progression'); if (!root) return;
    root.hidden = false;
    root.querySelector('[data-progress-level]').textContent = `LV ${progress.level}`;
    root.querySelector('[data-progress-title]').textContent = progress.title;
    root.querySelector('[data-progress-xp]').textContent = `${formatXp(progress.xp)} XP`;
    const meter = root.querySelector('[data-progress-meter]'); meter.style.width = `${percent}%`;
    root.querySelector('[data-progress-next]').textContent = progress.level >= 100 ? 'Maximum level reached.' : `${formatXp(Math.max(0, progress.nextLevelXp - progress.xp))} XP to level ${progress.level + 1}`;
    const header = document.getElementById('header-progression'); if (!header) return;
    header.hidden = false;
    header.querySelector('[data-header-progress-level]').textContent = `LV ${progress.level}`;
    header.querySelector('[data-header-progress-title]').textContent = progress.title;
    header.querySelector('[data-header-progress-xp]').textContent = `${formatXp(progress.xp)} XP`;
    header.querySelector('[data-header-progress-meter]').style.width = `${percent}%`;
    header.querySelector('[data-header-progress-next]').textContent = progress.level >= 100 ? 'Maximum level reached' : `${formatXp(Math.max(0, progress.nextLevelXp - progress.xp))} XP to LV ${progress.level + 1}`;
  }
  function runQueue() {
    if (animating || !queue.length) return;
    animating = true; const target = queue.shift(); const from = displayedXp == null ? target.xp : displayedXp;
    const duration = Math.max(0, Number(target.level) || 0) * XP_ANIM_MS_PER_LEVEL;
    if (from === target.xp || !duration) { displayedXp = target.xp; render(target); animating = false; runQueue(); return; }
    const started = performance.now();
    const step = now => {
      const ratio = Math.min(1, (now - started) / duration); const current = from + (target.xp - from) * ratio;
      displayedXp = current; render(progressAt(current, target));
      if (ratio < 1) requestAnimationFrame(step);
      else { displayedXp = target.xp; render(target); animating = false; runQueue(); }
    };
    requestAnimationFrame(step);
  }
  async function load() { try { const loaded = await api('/api/progression'); displayedXp = loaded.xp; highestQueuedXp = loaded.xp; render(loaded); } catch { /* Progress should never block the library. */ } }
  function handleEvent(data) {
    const next = data?.progress;
    if (!next || Number(next.xp) <= highestQueuedXp) return;
    highestQueuedXp = Number(next.xp); queue.push(next); runQueue();
  }
  return { handleEvent, load, render };
}
