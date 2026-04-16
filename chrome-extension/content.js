// ============================================================
// English Buddy 🌸 - Content Script
// ページ上にかわいいオーバーレイを表示する
// ============================================================

let overlay = null;

// バックグラウンドからのメッセージを受信
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'SHOW_LOADING':
      showOverlay(buildLoadingHTML(message.text, message.action));
      break;
    case 'SHOW_RESULT':
      updateContent(buildResultHTML(message.text, message.action, message.analysis));
      break;
    case 'SHOW_ERROR':
      showError(message.message);
      break;
    case 'SHOW_NOTIFICATION':
      showToast(message.message);
      break;
  }
});

// ============================================================
// オーバーレイ管理
// ============================================================

function showOverlay(html) {
  removeOverlay();

  overlay = document.createElement('div');
  overlay.id = 'eb-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  bindCloseButton();
  makeDraggable(overlay);

  requestAnimationFrame(() => overlay.classList.add('eb-show'));
}

function updateContent(html) {
  if (!overlay) { showOverlay(html); return; }
  overlay.innerHTML = html;
  bindCloseButton();
}

function removeOverlay() {
  if (!overlay) return;
  overlay.classList.remove('eb-show');
  overlay.classList.add('eb-hide');
  const el = overlay;
  overlay = null;
  setTimeout(() => el.remove(), 300);
}

function bindCloseButton() {
  overlay?.querySelector('.eb-close')?.addEventListener('click', removeOverlay);
}

// ============================================================
// HTML ビルダー
// ============================================================

function actionLabel(action) {
  return {
    all:         '🌸 全部まとめて解説',
    translate:   '🇯🇵 日本語訳',
    grammar:     '📚 文法解説',
    vocab:       '💡 単語解説',
    alternative: '✨ 別の言い方',
  }[action] ?? '🌸 解析結果';
}

function buildLoadingHTML(text, action) {
  return `
    <div class="eb-header">
      <span class="eb-title">${actionLabel(action)}</span>
      <button class="eb-close" aria-label="閉じる">✕</button>
    </div>
    <div class="eb-selected">
      <span class="eb-badge">📝 選択テキスト</span>
      <p class="eb-selected-text">"${esc(text)}"</p>
    </div>
    <div class="eb-loading">
      <div class="eb-dots"><span></span><span></span><span></span></div>
      <p>解析中… ちょっと待ってね！🌟</p>
    </div>`;
}

function buildResultHTML(text, action, data) {
  const sections = [];

  // 日本語訳
  if (data.translation) {
    sections.push(`
      <div class="eb-section">
        <h3 class="eb-sec-title">🇯🇵 日本語訳</h3>
        <p class="eb-translation">${esc(data.translation)}</p>
        ${data.literal ? `<p class="eb-sub">直訳: ${esc(data.literal)}</p>` : ''}
      </div>`);
  }

  // 文法解説
  if (data.grammar) {
    sections.push(`
      <div class="eb-section">
        <h3 class="eb-sec-title">📚 文法解説</h3>
        <p>${esc(data.grammar)}</p>
        ${data.structure ? `<p class="eb-pill-row"><span class="eb-pill eb-pill--blue">📐 ${esc(data.structure)}</span></p>` : ''}
        ${data.patterns?.length ? `<div class="eb-tags">${data.patterns.map(p => `<span class="eb-tag">${esc(p)}</span>`).join('')}</div>` : ''}
      </div>`);
  }

  // 単語解説
  if (data.vocabulary?.length) {
    const vocabItems = data.vocabulary.map(v => `
      <div class="eb-vocab">
        <div class="eb-vocab-head">
          <span class="eb-word">${esc(v.word)}</span>
          ${v.reading     ? `<span class="eb-reading">[${esc(v.reading)}]</span>` : ''}
          ${v.partOfSpeech ? `<span class="eb-pos">${esc(v.partOfSpeech)}</span>` : ''}
        </div>
        <p class="eb-meaning">${esc(v.meaning)}</p>
        ${v.example ? `<p class="eb-example">💬 ${esc(v.example)}</p>` : ''}
        ${v.note    ? `<p class="eb-sub">${esc(v.note)}</p>` : ''}
      </div>`).join('');

    const idioms = data.idioms?.length
      ? data.idioms.map(i => `<p class="eb-idiom">🔤 ${esc(i)}</p>`).join('')
      : '';

    sections.push(`
      <div class="eb-section">
        <h3 class="eb-sec-title">💡 単語解説</h3>
        ${vocabItems}${idioms}
      </div>`);
  }

  // 別の言い方
  if (data.alternatives?.length) {
    const altItems = data.alternatives.map(alt => {
      const t = typeof alt === 'string' ? alt : alt.text;
      const f = typeof alt === 'object' ? alt.formality : null;
      const n = typeof alt === 'object' ? alt.nuance    : null;
      return `
        <div class="eb-alt">
          <p class="eb-alt-text">💬 "${esc(t)}"</p>
          ${f ? `<span class="eb-tag">${esc(f)}</span>` : ''}
          ${n ? `<p class="eb-sub">${esc(n)}</p>` : ''}
        </div>`;
    }).join('');

    sections.push(`
      <div class="eb-section">
        <h3 class="eb-sec-title">✨ 別の言い方</h3>
        ${data.original_meaning ? `<p class="eb-sub">${esc(data.original_meaning)}</p>` : ''}
        ${altItems}
      </div>`);
  }

  // 学習のポイント
  if (data.tips) {
    sections.push(`
      <div class="eb-section eb-tips-section">
        <h3 class="eb-sec-title">⭐ 学習のポイント</h3>
        <p>${esc(data.tips)}</p>
      </div>`);
  }

  return `
    <div class="eb-header">
      <span class="eb-title">${actionLabel(action)}</span>
      <button class="eb-close" aria-label="閉じる">✕</button>
    </div>
    <div class="eb-selected">
      <span class="eb-badge">📝 選択テキスト</span>
      <p class="eb-selected-text">"${esc(text)}"</p>
    </div>
    <div class="eb-body">${sections.join('')}</div>`;
}

// ============================================================
// エラー / トースト通知
// ============================================================

function showError(msg) {
  const html = `
    <div class="eb-header">
      <span class="eb-title">⚠️ エラー</span>
      <button class="eb-close" aria-label="閉じる">✕</button>
    </div>
    <div class="eb-error-body">
      <p>${esc(msg)}</p>
    </div>`;

  if (overlay) { updateContent(html); } else { showOverlay(html); }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'eb-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('eb-show'));
  setTimeout(() => {
    toast.classList.remove('eb-show');
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

// ============================================================
// ドラッグ可能にする
// ============================================================

function makeDraggable(el) {
  const header = el.querySelector('.eb-header');
  if (!header) return;

  let dragging = false, ox = 0, oy = 0, ix = 0, iy = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('eb-close')) return;
    dragging = true;
    ox = e.clientX; oy = e.clientY;
    const r = el.getBoundingClientRect();
    ix = r.left;    iy = r.top;
    el.style.transition = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    el.style.right  = 'auto';
    el.style.bottom = 'auto';
    el.style.left   = Math.max(0, ix + e.clientX - ox) + 'px';
    el.style.top    = Math.max(0, iy + e.clientY - oy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    el.style.transition = '';
  });
}

// ============================================================
// ユーティリティ
// ============================================================

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
