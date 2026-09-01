const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const RECONNECT_MIN_MS = 2_500;
const RECONNECT_MAX_MS = 30_000;
const STABLE_CONNECTION_MS = 15_000;

function decodeFrame(frame) {
  let event = 'message'; let id = null; const data = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try { return { event, id, data: JSON.parse(data.join('\n')) }; }
  catch { return null; }
}

export function openEventStream({ onEvent, onUnauthorized = () => {} }) {
  let stopped = false; let controller = null; let lastEventId = null; let reconnectMs = RECONNECT_MIN_MS;
  (async function connect() {
    while (!stopped) {
      const connectedAt = performance.now();
      try {
        controller = new AbortController();
        const headers = { Accept: 'text/event-stream' };
        if (lastEventId != null) headers['Last-Event-ID'] = lastEventId;
        const response = await fetch('/api/events', {
          headers, credentials: 'same-origin',
          cache: 'no-store', signal: controller.signal,
        });
        if (stopped) return;
        if (response.status === 401) { onUnauthorized(); return; }
        if (!response.ok || !response.body) throw new Error(`Event stream failed (${response.status}).`);
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const decoded = decodeFrame(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2);
            if (decoded) {
              if (decoded.id !== null) lastEventId = decoded.id;
              onEvent(decoded.event, decoded.data);
            }
          }
        }
      } catch (error) {
        if (stopped || error.name === 'AbortError') return;
      }
      if (!stopped) {
        reconnectMs = performance.now() - connectedAt >= STABLE_CONNECTION_MS
          ? RECONNECT_MIN_MS
          : Math.min(RECONNECT_MAX_MS, reconnectMs * 2);
        await delay(reconnectMs);
      }
    }
  })();
  return () => { stopped = true; controller?.abort(); };
}

export { decodeFrame };
