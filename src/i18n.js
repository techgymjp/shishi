// 日本語 / 英語の切り替え
// 日本語の文言をそのままキーにして、英語の訳を引く（日本語のときは元の文言を使う）。
// HTML は data-i18n（textContent）/ data-i18n-html（innerHTML）を付けた要素を書き換える。

const EN = {
  // ページ・読み込み
  '鹿威しカコーン｜Japan Garden KAKOON!': 'Japan Garden KAKOON! | Shishi-odoshi timing game',
  '日本庭園の鹿威しを絶妙なタイミングで鳴らすワンタップゲーム': 'A one-tap game: strike the shishi-odoshi of a Japanese garden at the perfect moment.',
  '日本庭園の鹿威し': 'Shishi-odoshi in a Japanese garden',
  '鹿威しカコーン': 'Japan Garden KAKOON!',
  'Japan Garden KAKOON!': '鹿威しカコーン',
  '庭園を準備しています…': 'Preparing the garden…',
  '3D表示を準備できませんでした。ページを再読み込みしてください。': 'Could not start 3D. Please reload the page.',
  // タイトル
  '鹿威し<br>カコーン': 'Japan Garden<br>KAKOON!',
  '鹿威しタイミングチャレンジ': 'Shishi-odoshi Timing Challenge',
  '水がこぼれて軽くなった竹筒が<b>石を打つ瞬間</b>にタップ<br><small>縮んでくる輪が石の輪と重なったとき</small>':
    'Tap <b>the moment the bamboo strikes the stone</b><br><small>when the shrinking ring meets the ring on the stone</small>',
  'サウンド切り替え': 'Toggle sound',
  '設定': 'Settings',
  '残り': 'Lives',
  // リザルト
  'もう一度遊ぶ': 'Play again',
  'シェア': 'Share',
  'コピー': 'Copy',
  'コピーしました': 'Copied!',
  // 設定
  'サウンド': 'Sound',
  'BGM（大正琴）': 'BGM (Taishōgoto)',
  '振動': 'Vibration',
  '言語 / Language': '言語 / Language',
  '自動': 'Auto',
  '練習（ギミック）': 'Practice (gimmick)',
  '自動（レベルで変化）': 'Auto (changes with level)',
  'なし': 'None',
  '☔ 雨': '☔ Rain',
  '🍃 風': '🍃 Wind',
  '🌙 夜': '🌙 Night',
  '🎋 竹筒のサイズ': '🎋 Tube size',
  '⇄ 2本の鹿威し': '⇄ Two shishi-odoshi',
  'すべて': 'All',
  '記録': 'Records',
  '称号': 'Titles',
  '閉じる': 'Close',
  '記録をリセット': 'Reset records',
  '記録と称号をすべてリセットしますか？': 'Reset all records and titles?',
  '累計プレイ回数': 'Total plays',
  '累計スコア': 'Total score',
  '最高スコア': 'Best score',
  'PERFECT累計': 'Total PERFECTs',
  '最大コンボ': 'Max combo',
  '最高連続PERFECT': 'Best PERFECT streak',
  // ゲーム中
  'まだ': 'Not yet',
  'はやい': 'Early',
  'おそい': 'Late',
  '{0}連続': '{0} in a row',
  'コンボ倍率 ×{0}': 'Combo ×{0}',
  '称号：{0}': 'Title: {0}',
  '称号獲得：{0}': 'New title: {0}',
  '太い竹筒': 'Thick bamboo tube',
  '細い竹筒': 'Thin bamboo tube',
  // 難易度
  'チュートリアル': 'Tutorial',
  '初級': 'Beginner',
  '中級': 'Intermediate',
  '上級': 'Advanced',
  '達人': 'Master',
  '超上級': 'Expert',
  // ギミック
  '雨で水の流れが速くなる': 'Rain makes the water flow faster',
  '風で竹筒の動きが微妙に変わる': 'Wind subtly changes the bamboo’s motion',
  '夜の庭園。見えにくくなる': 'Night garden — harder to see',
  '竹筒の太さが変わる': 'The tube size changes',
  '2本の鹿威しが交互に動く': 'Two shishi-odoshi take turns',
  // 称号
  '新米庭師': 'Novice Gardener',
  '竹筒見習い': 'Bamboo Apprentice',
  '鹿威し職人': 'Shishi-odoshi Artisan',
  '音の達人': 'Master of Sound',
  '伝説の庭師': 'Legendary Gardener',
  '初回プレイ': 'First play',
  '累計100点': '100 points in total',
  '累計1,000点': '1,000 points in total',
  'PERFECTを50回': '50 PERFECTs',
  '1プレイ5,000点': '5,000 points in one play',
  // シェア
  '鹿威しカコーンで{0}点！ PERFECT {1}回・最大コンボ {2} #鹿威しカコーン':
    'I scored {0} in Japan Garden KAKOON! PERFECT ×{1}, max combo {2} #KAKOON',
};

let lang = 'ja';

export function detectLang(pref = 'auto') {
  if (pref === 'ja' || pref === 'en') return pref;
  const l = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja';
  return l.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function setLang(l) { lang = l; }
export function getLang() { return lang; }

/** 日本語の文言を現在の言語へ。{0} {1} … を args で置き換える */
export function t(ja, ...args) {
  const s = lang === 'en' && EN[ja] !== undefined ? EN[ja] : ja;
  return s.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
}

/** data-i18n / data-i18n-html / data-i18n-aria を付けた要素を書き換える */
export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    if (el.dataset.ja === undefined) el.dataset.ja = el.textContent.trim();
    el.textContent = t(el.dataset.ja);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    if (el.dataset.ja === undefined) el.dataset.ja = el.innerHTML.trim();
    el.innerHTML = t(el.dataset.ja);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    if (el.dataset.jaAria === undefined) el.dataset.jaAria = el.getAttribute('aria-label');
    el.setAttribute('aria-label', t(el.dataset.jaAria));
  });
  document.documentElement.lang = lang;
  document.title = t('鹿威しカコーン｜Japan Garden KAKOON!');
  const desc = document.querySelector('meta[name="description"]');
  if (desc) {
    if (!desc.dataset.ja) desc.dataset.ja = desc.content;
    desc.content = t(desc.dataset.ja);
  }
}
