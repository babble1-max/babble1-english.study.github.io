// ============================================================
// English Buddy 🌸 - Background Service Worker
// コンテキストメニューの作成・キーボードショートカット処理・Claude API呼び出し
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  // 右クリックメニューを作成
  const menus = [
    { id: 'eb-all',         title: '🌸 全部まとめて解説する' },
    { id: 'eb-sep1',        type: 'separator' },
    { id: 'eb-translate',   title: '🇯🇵 日本語訳を見る' },
    { id: 'eb-grammar',     title: '📚 文法を解説する' },
    { id: 'eb-vocab',       title: '💡 単語を解説する' },
    { id: 'eb-alternative', title: '✨ 別の言い方を見る' },
  ];

  for (const menu of menus) {
    chrome.contextMenus.create({
      id: menu.id,
      title: menu.title,
      type: menu.type || 'normal',
      contexts: ['selection'],
    });
  }
});

const MENU_ACTIONS = {
  'eb-all':         'all',
  'eb-translate':   'translate',
  'eb-grammar':     'grammar',
  'eb-vocab':       'vocab',
  'eb-alternative': 'alternative',
};

// 右クリックメニュー処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = MENU_ACTIONS[info.menuItemId];
  if (!action || !tab?.id) return;

  const text = info.selectionText?.trim();
  if (!text) return;

  await processText(tab.id, text, action);
});

// キーボードショートカット処理 (Ctrl+I / ⌘I)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'analyze-text') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // アクティブタブから選択テキストを取得
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString()?.trim() ?? '',
    });
  } catch (e) {
    console.error('[EnglishBuddy] スクリプト実行エラー:', e);
    return;
  }

  const text = results?.[0]?.result;
  if (!text) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_NOTIFICATION',
      message: '📝 テキストを選択してから Ctrl+I を押してね！',
    });
    return;
  }

  await processText(tab.id, text, 'all');
});

// テキスト処理のメイン関数
async function processText(tabId, text, action) {
  const { apiKey } = await chrome.storage.sync.get(['apiKey']);

  if (!apiKey) {
    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_ERROR',
      message: '🔑 APIキーが設定されていません。\n拡張機能のアイコンをクリックして設定してください！',
    });
    return;
  }

  // ローディング表示
  chrome.tabs.sendMessage(tabId, {
    type: 'SHOW_LOADING',
    text,
    action,
  });

  try {
    const analysis = await callClaudeAPI(apiKey, text, action);
    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_RESULT',
      text,
      action,
      analysis,
    });
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_ERROR',
      message: `⚠️ エラーが発生しました\n${err.message}`,
    });
  }
}

// Claude API 呼び出し
async function callClaudeAPI(apiKey, text, action) {
  const systemPrompt =
    'あなたは英語学習サポーターです。ユーザーが選択した英語テキストを解析し、日本語で分かりやすく解説してください。必ずJSONのみを返してください。前後に余分なテキストは不要です。';

  const prompts = {
    all: `以下の英語テキストについて全て解説してください。

テキスト: "${text}"

以下のJSON形式のみ返してください:
{
  "translation": "自然な日本語訳",
  "grammar": "文法解説（文の構造・時制・品詞など）",
  "vocabulary": [
    {"word": "単語/表現", "reading": "発音・読み方", "partOfSpeech": "品詞", "meaning": "意味", "note": "補足"}
  ],
  "alternatives": [
    {"text": "別の言い方", "formality": "フォーマル/カジュアル", "nuance": "ニュアンスの違い"}
  ],
  "tips": "学習のポイントや豆知識"
}`,

    translate: `以下の英語テキストを日本語に翻訳してください。

テキスト: "${text}"

以下のJSON形式のみ返してください:
{
  "translation": "自然な日本語訳",
  "literal": "直訳（参考）",
  "tips": "翻訳のポイント"
}`,

    grammar: `以下の英語テキストの文法を解説してください。

テキスト: "${text}"

以下のJSON形式のみ返してください:
{
  "grammar": "文法の詳しい解説",
  "structure": "文の構造の説明",
  "patterns": ["文法パターン1", "文法パターン2"],
  "tips": "学習のポイント"
}`,

    vocab: `以下の英語テキストの重要な単語・表現を解説してください。

テキスト: "${text}"

以下のJSON形式のみ返してください:
{
  "vocabulary": [
    {"word": "単語/表現", "reading": "発音・読み方", "partOfSpeech": "品詞", "meaning": "意味", "example": "例文", "note": "補足"}
  ],
  "idioms": ["イディオム・慣用表現の説明"],
  "tips": "単語学習のポイント"
}`,

    alternative: `以下の英語テキストの別の言い方を教えてください。

テキスト: "${text}"

以下のJSON形式のみ返してください:
{
  "original_meaning": "元テキストの意味",
  "alternatives": [
    {"text": "別の言い方", "formality": "フォーマル/カジュアル/etc", "nuance": "ニュアンスの違い"}
  ],
  "tips": "使い分けのポイント"
}`,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompts[action] ?? prompts.all }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text ?? '';

  // JSON を抽出してパース
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('レスポンスのJSON解析に失敗しました');

  return JSON.parse(match[0]);
}
