// 读书助手 — locate a passage between two phrases, compose a copy-ready prompt.

// Predefined prompts. {book} = book title, {text} = located passage.
const PROMPTS = [
  {
    id: 'interpret',
    name: '解读片段',
    build: (book, text) => `解读《${book}》中的如下片段：\n\n${text}`,
  },
];

const CONTEXT_CHARS = 36; // how much surrounding text to show around the passage

const state = {
  books: [],
  book: null, // { title, author, file }
  text: '',   // full text of the loaded book
};

const el = {};

function cache() {
  el.bookPicker = document.getElementById('book-picker');
  el.bookMeta = document.getElementById('book-meta');
  el.start = document.getElementById('start-input');
  el.end = document.getElementById('end-input');
  el.passage = document.getElementById('passage');
  el.prompts = document.getElementById('prompts');
  el.preview = document.getElementById('preview');
  el.copyPrompt = document.getElementById('copy-prompt');
  el.copyText = document.getElementById('copy-text');
  el.toast = document.getElementById('toast');
}

// ---- Loading -------------------------------------------------------------

async function init() {
  cache();
  bindEvents();
  buildPrompts();
  try {
    const manifest = await (await fetch('books/manifest.json')).json();
    state.books = manifest.books || [];
  } catch (err) {
    return showLoadError();
  }
  if (!state.books.length) return showLoadError();

  state.books.forEach((b, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = b.title;
    el.bookPicker.appendChild(opt);
  });
  await loadBook(0);
}

async function loadBook(index) {
  const book = state.books[index];
  state.book = book;
  el.bookMeta.textContent = book.author || '';
  try {
    const res = await fetch('books/' + encodeURIComponent(book.file));
    if (!res.ok) return showLoadError();
    state.text = await res.text();
  } catch (err) {
    return showLoadError();
  }
  render();
}

function showLoadError() {
  el.passage.innerHTML =
    '<p class="hint">无法加载书籍。请通过本地服务器打开此页面' +
    '（终端运行 <code>python3 -m http.server</code>，再访问 ' +
    '<code>http://localhost:8000</code>），或部署到 GitHub Pages 后访问。</p>';
}

// ---- Extraction ----------------------------------------------------------

function countOccurrences(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

// Returns one of:
//   { status: 'empty' }
//   { status: 'start-missing' } | { status: 'end-missing' }
//   { status: 'ambiguous', count }
//   { status: 'ok', startIdx, endIdx, passage }
function locate(text, start, end) {
  if (!start.trim() || !end.trim()) return { status: 'empty' };

  const startCount = countOccurrences(text, start);
  if (startCount === 0) return { status: 'start-missing' };
  if (startCount > 1) return { status: 'ambiguous', count: startCount };

  const startIdx = text.indexOf(start);
  // Search for END only after START ends, so an END that sits inside START
  // (e.g. a short END that is also a substring of START) is skipped. This also
  // guarantees the passage fully contains START followed by END.
  const endStart = text.indexOf(end, startIdx + start.length);
  if (endStart === -1) return { status: 'end-missing' };

  const endIdx = endStart + end.length;
  return { status: 'ok', startIdx, endIdx, passage: text.slice(startIdx, endIdx) };
}

function currentPassage() {
  const r = locate(state.text, el.start.value, el.end.value);
  return r.status === 'ok' ? r.passage : null;
}

// ---- Rendering -----------------------------------------------------------

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function render() {
  if (!state.text) return;
  const r = locate(state.text, el.start.value, el.end.value);
  renderPassage(r);
  renderPreview(r);
  const hasPassage = r.status === 'ok';
  el.copyPrompt.disabled = !hasPassage;
  el.copyText.disabled = !hasPassage;
}

function renderPassage(r) {
  const messages = {
    empty: '输入起始与结束文字，定位你要的段落。',
    'start-missing': '没有找到这段起始文字。请检查是否与原文一致。',
    'end-missing': '找到了起始位置，但其后没有这段结束文字。请检查结束文字。',
  };
  if (r.status !== 'ok' && r.status !== 'ambiguous') {
    el.passage.innerHTML = `<p class="hint">${messages[r.status]}</p>`;
    return;
  }
  if (r.status === 'ambiguous') {
    el.passage.innerHTML =
      `<p class="hint">这段起始文字在书中出现了 <b>${r.count}</b> 处。` +
      `请多输入几个字，缩小定位范围。</p>`;
    return;
  }

  const start = el.start.value;
  const end = el.end.value;
  const before = state.text.slice(Math.max(0, r.startIdx - CONTEXT_CHARS), r.startIdx);
  const after = state.text.slice(r.endIdx, r.endIdx + CONTEXT_CHARS);
  const mid = r.passage.slice(start.length, r.passage.length - end.length);

  el.passage.innerHTML =
    `<div class="excerpt">` +
    `<span class="ctx">…${esc(before)}</span>` +
    `<span class="hit">` +
    `<span class="mark">${esc(start)}</span>` +
    `${esc(mid)}` +
    `<span class="mark">${esc(end)}</span>` +
    `</span>` +
    `<span class="ctx">${esc(after)}…</span>` +
    `</div>`;
}

function renderPreview(r) {
  if (r.status !== 'ok') {
    el.preview.textContent = '提示词将在定位成功后显示。';
    el.preview.classList.add('muted');
    return;
  }
  const prompt = activePrompt();
  el.preview.textContent = prompt.build(state.book.title, r.passage);
  el.preview.classList.remove('muted');
}

// ---- Prompts -------------------------------------------------------------

let activePromptId = PROMPTS[0].id;

function activePrompt() {
  return PROMPTS.find((p) => p.id === activePromptId);
}

function buildPrompts() {
  el.prompts.innerHTML = '';
  PROMPTS.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg' + (p.id === activePromptId ? ' active' : '');
    b.textContent = p.name;
    b.addEventListener('click', () => {
      activePromptId = p.id;
      buildPrompts();
      render();
    });
    el.prompts.appendChild(b);
  });
}

// ---- Copy ----------------------------------------------------------------

async function copy(textGetter, label) {
  const text = textGetter();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast(label);
}

let toastTimer;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1600);
}

// ---- Events --------------------------------------------------------------

function bindEvents() {
  el.start.addEventListener('input', render);
  el.end.addEventListener('input', render);
  el.bookPicker.addEventListener('change', (e) => loadBook(Number(e.target.value)));
  el.copyPrompt.addEventListener('click', () =>
    copy(() => {
      const p = currentPassage();
      return p ? activePrompt().build(state.book.title, p) : '';
    }, '已复制提示词')
  );
  el.copyText.addEventListener('click', () =>
    copy(() => currentPassage() || '', '已复制原文')
  );
}

init();
