const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

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

export function openEventStream({ token, onEvent, onUnauthorized = () => {} }) {
  let stopped = false; let controller = null; let lastEventId = null;
  (async function connect() {
    while (!stopped) {
      try {
        controller = new AbortController();
        const headers = { Accept: 'text/event-stream', Authorization: `Bearer ${token}` };
        if (lastEventId != null) headers['Last-Event-ID'] = lastEventId;
        const response = await fetch('/api/events', {
          headers,
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
      if (!stopped) await delay(2500);
    }
  })();
  return () => { stopped = true; controller?.abort(); };
}

export { decodeFrame };
