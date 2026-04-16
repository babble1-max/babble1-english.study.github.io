// ============================================================
// English Buddy 🌸 - ポップアップ（設定ページ）スクリプト
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const apiInput    = document.getElementById('api-key');
  const toggleBtn   = document.getElementById('toggle-vis');
  const saveBtn     = document.getElementById('save-btn');
  const statusEl    = document.getElementById('status');
  const shortcutLink = document.getElementById('open-shortcuts-link');

  // ── 保存済みAPIキーを復元 ──────────────────────────────────
  const { apiKey } = await chrome.storage.sync.get(['apiKey']);
  if (apiKey) apiInput.value = apiKey;

  // ── 表示/非表示トグル ─────────────────────────────────────
  let visible = false;
  toggleBtn.addEventListener('click', () => {
    visible = !visible;
    apiInput.type    = visible ? 'text' : 'password';
    toggleBtn.textContent = visible ? '🙈' : '👁️';
  });

  // ── ショートカット設定ページを開く ───────────────────────────
  shortcutLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // ── 保存 ──────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const key = apiInput.value.trim();

    if (!key) {
      showStatus('🔑 APIキーを入力してください', 'error');
      return;
    }
    if (!key.startsWith('sk-ant-')) {
      showStatus('⚠️ 正しい Anthropic APIキーを入力してください', 'error');
      return;
    }

    await chrome.storage.sync.set({ apiKey: key });
    showStatus('✨ 保存しました！', 'success');
  });

  // ── ステータスメッセージを表示して自動消去 ──────────────────
  function showStatus(msg, type) {
    statusEl.textContent  = msg;
    statusEl.className    = `p-status ${type}`;
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className   = 'p-status';
    }, 3500);
  }
});
