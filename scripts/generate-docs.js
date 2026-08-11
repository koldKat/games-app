#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'docs');
const CHECK = process.argv.includes('--check');
const documents = [
  { source: 'docs/user-guide.md', output: 'public/docs/user-guide.html', title: 'User Guide', description: 'Accounts, library browsing, game management, PEGI lookup, mobile use, and troubleshooting.' },
  { source: 'docs/technical.md', output: 'public/docs/technical.html', title: 'Technical Reference', description: 'Architecture, database, authentication, APIs, testing, and operations.' },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function inline(value) {
  let text = escapeHtml(value);
  const code = [];
  text = text.replace(/`([^`]+)`/g, (_, content) => `\u0000${code.push(`<code>${content}</code>`) - 1}\u0000`);
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)]);
}

function slugify(value, used) {
  const base = value.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
  let slug = base; let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  used.add(slug); return slug;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output = [];
  const toc = [];
  const usedSlugs = new Set();
  let paragraph = [];
  let listType = '';
  let codeFence = false;
  let codeLanguage = '';
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = '';
  };
  const flushAll = () => { flushParagraph(); closeList(); };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('```')) {
      flushAll();
      if (!codeFence) { codeFence = true; codeLanguage = line.slice(3).trim(); codeLines = []; }
      else { output.push(`<pre data-language="${escapeHtml(codeLanguage)}"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`); codeFence = false; }
      continue;
    }
    if (codeFence) { codeLines.push(line); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const slug = slugify(heading[2], usedSlugs);
      if (level >= 2 && level <= 3) toc.push({ level, title: heading[2], slug });
      output.push(`<h${level} id="${slug}">${inline(heading[2])}<a class="anchor" href="#${slug}" aria-label="Link to section">#</a></h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) { flushAll(); output.push('<hr>'); continue; }
    if (line.startsWith('> ')) { flushAll(); output.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue; }
    const next = lines[index + 1] || '';
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(next)) {
      flushAll();
      const tableRows = [line];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { tableRows.push(lines[index]); index++; }
      index--;
      const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      output.push(`<div class="table-wrap"><table><thead><tr>${cells(tableRows[0]).map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${tableRows.slice(1).map(row => `<tr>${cells(row).map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const wanted = ordered ? 'ol' : 'ul';
      if (listType && listType !== wanted) closeList();
      if (!listType) { listType = wanted; output.push(`<${listType}>`); }
      output.push(`<li>${inline((unordered || ordered)[1])}</li>`);
      continue;
    }
    if (!line.trim()) { flushAll(); continue; }
    if (listType) closeList();
    paragraph.push(line.trim());
  }
  flushAll();
  if (codeFence) output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return { body: output.join('\n'), toc };
}

function pageTemplate(document, markdown) {
  const { body, toc } = markdownToHtml(markdown);
  const tocHtml = toc.map(item => `<a class="toc-${item.level}" href="#${item.slug}">${escapeHtml(item.title)}</a>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080b10"><title>Games Shelf // ${document.title}</title>
<style>
:root{color-scheme:dark;--bg:#080b10;--panel:#0d1219;--line:#222c38;--text:#dce5ef;--muted:#8491a0;--accent:#35d6b2;--amber:#e9b949;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-size:13px;line-height:1.65}a{color:#5fe4c5}header{height:48px;position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--line);background:#080b10ed;backdrop-filter:blur(10px)}header strong{font-size:12px}header span{color:var(--muted);font-size:9px}header nav{margin-left:auto;display:flex;gap:5px}header nav a{padding:5px 8px;border:1px solid var(--line);text-decoration:none;font-size:9px}.layout{width:min(1240px,100%);margin:auto;display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px;padding:18px}.toc{position:sticky;top:66px;align-self:start;max-height:calc(100vh - 82px);overflow:auto;border:1px solid var(--line);background:var(--panel);padding:10px}.toc b{display:block;color:var(--accent);font-size:9px;letter-spacing:.12em;margin-bottom:7px}.toc a{display:block;padding:3px 5px;color:#93a0af;text-decoration:none;font-size:9px;border-left:1px solid #283440}.toc a:hover{color:var(--accent);border-color:var(--accent)}.toc .toc-3{padding-left:15px;color:#6f7d8b}.content{min-width:0;border:1px solid var(--line);background:var(--panel);padding:clamp(15px,3vw,34px)}h1,h2,h3,h4{line-height:1.2;scroll-margin-top:65px}h1{font-size:28px;margin:0 0 28px;color:#f0f5fa}h1:before{content:'> ';color:var(--accent)}h2{font-size:18px;margin:32px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--line)}h3{font-size:14px;margin:24px 0 8px;color:#b9c7d5}h4{font-size:12px;color:var(--amber)}.anchor{opacity:0;text-decoration:none;margin-left:7px;font-size:.7em}h2:hover .anchor,h3:hover .anchor{opacity:1}p{margin:8px 0 13px;color:#b6c0cb}strong{color:#eef4f8}code{background:#111c24;border:1px solid #263542;padding:1px 4px;color:#6ee6cb;font-size:.9em}pre{overflow:auto;background:#070a0e;border:1px solid #273441;padding:12px;margin:12px 0}pre code{border:0;background:none;padding:0;color:#b9c7d5}.table-wrap{overflow:auto;margin:12px 0}table{width:100%;border-collapse:collapse;font-size:10px}th,td{text-align:left;padding:7px 8px;border:1px solid #25313d;vertical-align:top}th{background:#111a23;color:#62e2c4}td{color:#aeb9c5}ul,ol{padding-left:22px;color:#b6c0cb}li{margin:3px 0}blockquote{margin:12px 0;padding:8px 11px;border-left:2px solid var(--amber);background:#17150e;color:#d3c594}hr{border:0;border-top:1px solid var(--line);margin:28px 0}.source{margin-top:35px;color:#63707e;font-size:8px}
@media(max-width:760px){header{padding:0 8px}.layout{display:block;padding:7px}.toc{display:none}.content{padding:14px}h1{font-size:21px}h2{font-size:16px;margin-top:25px}body{font-size:11px}header span{display:none}}
</style></head><body><header><strong>GAMES_SHELF // DOCS</strong><span>${document.title}</span><nav><a href="/">APP</a><a href="/docs/">INDEX</a><a href="/docs/user-guide.html">USER</a><a href="/docs/technical.html">TECH</a></nav></header><div class="layout"><aside class="toc"><b>CONTENTS</b>${tocHtml}</aside><article class="content">${body}<p class="source">Generated from ${escapeHtml(document.source)}. Do not edit this HTML directly.</p></article></div></body></html>`;
}

function indexTemplate() {
  const cards = documents.map(document => `<a href="/${document.output.replace(/^public\//, '')}"><b>${document.title}</b><span>${document.description}</span><em>OPEN →</em></a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080b10"><title>Games Shelf // Documentation</title><style>:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080b10;color:#dce5ef;padding:12px}main{width:min(720px,100%)}small{color:#35d6b2;letter-spacing:.12em}h1{font-size:27px;margin:8px 0}p{color:#7f8c9a;font-size:11px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:22px}.grid a{border:1px solid #263440;background:#0d1219;padding:15px;text-decoration:none;color:#dce5ef}.grid a:hover{border-color:#35d6b2}.grid b,.grid span,.grid em{display:block}.grid b{font-size:13px}.grid span{font-size:9px;line-height:1.5;color:#8794a2;margin:7px 0 14px}.grid em{font-style:normal;color:#35d6b2;font-size:8px}nav{margin-top:10px}nav a{color:#35d6b2;font-size:9px}@media(max-width:560px){.grid{grid-template-columns:1fr}}</style></head><body><main><small>GAMES_SHELF // KNOWLEDGE BASE</small><h1>> Documentation</h1><p>User operations and implementation details, generated from version-controlled Markdown.</p><div class="grid">${cards}</div><nav><a href="/">← RETURN TO APP</a></nav></main></body></html>`;
}

const files = documents.map(document => ({
  path: path.join(ROOT, document.output),
  content: pageTemplate(document, fs.readFileSync(path.join(ROOT, document.source), 'utf8')),
}));
files.push({ path: path.join(OUTPUT_DIR, 'index.html'), content: indexTemplate() });

if (!CHECK) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
let stale = false;
for (const file of files) {
  if (CHECK) {
    if (!fs.existsSync(file.path) || fs.readFileSync(file.path, 'utf8') !== file.content) {
      console.error(`stale documentation: ${path.relative(ROOT, file.path)}`); stale = true;
    }
  } else {
    fs.writeFileSync(file.path, file.content, 'utf8');
    console.log(`generated ${path.relative(ROOT, file.path)}`);
  }
}
if (stale) process.exit(1);
if (CHECK) console.log(`documentation is current (${files.length} HTML files)`);
