const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

const COLORS = Object.freeze({
  red: '#ff8a82', orange: '#f0ae62', amber: '#f0c45a', green: '#6fe1be', teal: '#5ddfc8', blue: '#7eb9f4', purple: '#b49aea', pink: '#eb9dc5',
});

export function formatAnnouncementBody(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\{color:(red|orange|amber|green|teal|blue|purple|pink)\}(.+?)\{\/color\}/g, (_, color, text) => `<span style="color:${COLORS[color]}">${text}</span>`)
    .replace(/\n/g, '<br>');
}
