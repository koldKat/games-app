const RUNTIME_POLICY = require('../runtime-policy');
function readRaw(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let rejected = false;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { rejected = true; reject(Object.assign(new Error('Avatar is too large (maximum 256 KB).'), { status: 413 })); request.resume(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    request.on('error', reject);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > RUNTIME_POLICY.requestJsonMaxBytes) request.destroy(new Error('Request body is too large.'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body.')); }
    });
    request.on('error', reject);
  });
}

module.exports = { readJson, readRaw };
