// ============================================================
// English Buddy 🌸 - Background Service Worker
// コンテキストメニューの作成・キーボードショートカット処理・Gemini API呼び出し
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
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

  chrome.tabs.sendMessage(tabId, {
    type: 'SHOW_LOADING',
    text,
    action,
  });

  try {
    const analysis = await callGeminiAPI(apiKey, text, action);
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

// Gemini API 呼び出し
async function callGeminiAPI(apiKey, text, action) {
  const prompts = {
    all: `あなたは英語学習サポーターです。以下の英語テキストについて日本語で詳しく解説してください。

テキスト: "${text}"

以下のJSON形式のみで返してください（前後に余分なテキスト不要）:
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

    translate: `あなたは英語学習サポーターです。以下の英語テキストを日本語に翻訳してください。

テキスト: "${text}"

以下のJSON形式のみで返してください:
{
  "translation": "自然な日本語訳",
  "literal": "直訳（参考）",
  "tips": "翻訳のポイント"
}`,

    grammar: `あなたは英語学習サポーターです。以下の英語テキストの文法を日本語で解説してください。

テキスト: "${text}"

以下のJSON形式のみで返してください:
{
  "grammar": "文法の詳しい解説",
  "structure": "文の構造の説明",
  "patterns": ["文法パターン1", "文法パターン2"],
  "tips": "学習のポイント"
}`,

    vocab: `あなたは英語学習サポーターです。以下の英語テキストの重要な単語・表現を日本語で解説してください。

テキスト: "${text}"

以下のJSON形式のみで返してください:
{
  "vocabulary": [
    {"word": "単語/表現", "reading": "発音・読み方", "partOfSpeech": "品詞", "meaning": "意味", "example": "例文", "note": "補足"}
  ],
  "idioms": ["イディオム・慣用表現の説明"],
  "tips": "単語学習のポイント"
}`,

    alternative: `あなたは英語学習サポーターです。以下の英語テキストの別の言い方を日本語で教えてください。

テキスト: "${text}"

以下のJSON形式のみで返してください:
{
  "original_meaning": "元テキストの意味",
  "alternatives": [
    {"text": "別の言い方", "formality": "フォーマル/カジュアル/etc", "nuance": "ニュアンスの違い"}
  ],
  "tips": "使い分けのポイント"
}`,
  };

  const prompt = prompts[action] ?? prompts.all;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('レスポンスのJSON解析に失敗しました');

  return JSON.parse(match[0]);
}
