// ゲームルール（企画書「2. ゲームルール」「4. スコア設計」「5. 難易度設計」）
// DOM に依存しない純粋なロジック。Node のテストからも読み込めます。

export const MAX_MISSES = 3; // MISSが3回でゲームオーバー

/** 判定幅（秒）。衝突予定時刻とタップ時刻の差で判定する。 */
export const JUDGE_WINDOWS = { PERFECT: 0.10, GREAT: 0.20, GOOD: 0.35 };

export const BASE_POINTS = { PERFECT: 100, GREAT: 70, GOOD: 40, MISS: 0 };

/** delta = タップ時刻 − 衝突予定時刻（負なら早い、正なら遅い） */
export function judge(delta) {
  const d = Math.abs(delta);
  if (d <= JUDGE_WINDOWS.PERFECT) return 'PERFECT';
  if (d <= JUDGE_WINDOWS.GREAT) return 'GREAT';
  if (d <= JUDGE_WINDOWS.GOOD) return 'GOOD';
  return 'MISS';
}

/** コンボ倍率（combo は今回の成功を含めた連続成功数） */
export function comboMultiplier(combo) {
  if (combo >= 30) return 3.0;
  if (combo >= 20) return 2.0;
  if (combo >= 10) return 1.5;
  if (combo >= 5) return 1.2;
  return 1.0;
}

/** 獲得点 = 基本点 × コンボ倍率 */
export function pointsFor(result, combo) {
  return Math.round(BASE_POINTS[result] * comboMultiplier(combo));
}

/** 10回成功するごとに難易度（レベル）が上がる */
export function levelFor(successes) {
  return 1 + Math.floor(successes / 10);
}

export function tierFor(level) {
  if (level <= 5) return 'チュートリアル';
  if (level <= 10) return '初級';
  if (level <= 20) return '中級';
  if (level <= 30) return '上級';
  if (level <= 50) return '達人';
  return '超上級';
}

/**
 * レベルとコンボから、次の1サイクルの鹿威しの動きを決める。
 * - レベルが上がるほど水の流入が速く、竹筒の戻りも速くなる
 * - 連続成功で水の流入速度が上がる
 * - 31〜50は流入に変化あり、51以上はランダム変化
 */
export function cycleParams(level, combo = 0, rand = Math.random, gimmicks = NO_GIMMICKS) {
  const lv = Math.max(1, level);
  let fillDuration = Math.max(0.9, 2.6 * 0.95 ** (lv - 1));
  // 口側はゆっくり沈み（pour）、石側は一気に落ちる（return）
  let returnDuration = Math.max(0.2, 0.34 * 0.985 ** (lv - 1));
  let pourDuration = Math.max(0.45, 0.85 * 0.98 ** (lv - 1));

  fillDuration *= Math.max(0.85, 1 - combo * 0.005);

  if (lv > 50) {
    fillDuration *= 0.7 + rand() * 0.6;   // ±30%
    returnDuration *= 0.85 + rand() * 0.3; // ±15%
  } else if (lv > 30) {
    fillDuration *= 0.85 + rand() * 0.3;  // ±15%
  }
  // 雨：水の流入が速くなり、雨脚によって毎回少し変わる
  if (gimmicks.rain) fillDuration *= 0.62 + rand() * 0.18;
  // 風：竹筒の動きが微妙に変わる（沈む速さ・落ちる速さがずれる）
  if (gimmicks.wind) {
    pourDuration *= 0.8 + rand() * 0.4;
    returnDuration *= 0.88 + rand() * 0.24;
  }
  // 竹筒のサイズ：太いほど溜まるのに時間がかかり、戻りも重い
  const sz = gimmicks.size ?? 1;
  fillDuration *= sz * sz;
  pourDuration *= 0.8 + 0.2 * sz;
  returnDuration *= 0.85 + 0.15 * sz;
  return { fillDuration, pourDuration, returnDuration };
}

// ---------- 追加ギミック ----------
export const NO_GIMMICKS = Object.freeze({ rain: false, wind: false, night: false, size: 1, twin: false });

export const GIMMICK_INFO = {
  rain: { label: '雨', icon: '☔', desc: '雨で水の流れが速くなる' },
  wind: { label: '風', icon: '🍃', desc: '風で竹筒の動きが微妙に変わる' },
  night: { label: '夜', icon: '🌙', desc: '夜の庭園。見えにくくなる' },
  size: { label: '竹筒', icon: '🎋', desc: '竹筒の太さが変わる' },
  twin: { label: '2本', icon: '⇄', desc: '2本の鹿威しが交互に動く' },
};

/** 竹筒の太さ（レベルごとに太い・細いが入れ替わる） */
function sizeFor(level) {
  return level % 2 === 0 ? 1.3 : 0.78;
}

/**
 * レベルごとのギミック
 * Lv2 雨 → Lv3 風 → Lv4 夜 → Lv5 竹筒のサイズ → Lv6 2本の鹿威し → Lv7以降は組み合わせが変化
 */
export function gimmicksForLevel(level, rand = Math.random) {
  if (level <= 1) return { ...NO_GIMMICKS };
  if (level === 2) return { ...NO_GIMMICKS, rain: true };
  if (level === 3) return { ...NO_GIMMICKS, wind: true };
  if (level === 4) return { ...NO_GIMMICKS, night: true };
  if (level === 5) return { ...NO_GIMMICKS, size: sizeFor(level) };
  if (level === 6) return { ...NO_GIMMICKS, twin: true };
  // 7以降：2〜3個をランダムに組み合わせる
  const keys = ['rain', 'wind', 'night', 'size', 'twin'];
  const n = level >= 20 ? 3 : 2;
  // シャッフルして先頭から n 個（乱数が偏っていても必ず終わる）
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  const picked = keys.slice(0, n);
  const g = { ...NO_GIMMICKS };
  for (const k of picked) g[k] = k === 'size' ? sizeFor(level) : true;
  return g;
}

/** 設定画面の「練習」で選んだギミックを常に有効にする */
export function gimmicksForPractice(choice, level, rand = Math.random) {
  if (!choice || choice === 'auto') return gimmicksForLevel(level, rand);
  if (choice === 'none') return { ...NO_GIMMICKS };
  if (choice === 'all') return { rain: true, wind: true, night: true, size: sizeFor(level), twin: true };
  if (choice === 'size') return { ...NO_GIMMICKS, size: sizeFor(level) };
  return { ...NO_GIMMICKS, [choice]: true };
}

// ---------- 称号 ----------
export const TITLES = [
  { id: 'novice', name: '新米庭師', desc: '初回プレイ', test: (s) => s.plays >= 1 },
  { id: 'apprentice', name: '竹筒見習い', desc: '累計100点', test: (s) => s.totalScore >= 100 },
  { id: 'artisan', name: '鹿威し職人', desc: '累計1,000点', test: (s) => s.totalScore >= 1000 },
  { id: 'master', name: '音の達人', desc: 'PERFECTを50回', test: (s) => s.perfectTotal >= 50 },
  { id: 'legend', name: '伝説の庭師', desc: '1プレイ5,000点', test: (s) => s.best >= 5000 },
];

export function unlockedTitles(stats) {
  return TITLES.filter((t) => t.test(stats));
}

/** 表示用の称号（獲得済みのうち最上位） */
export function currentTitle(stats) {
  const list = unlockedTitles(stats);
  return list.length ? list[list.length - 1] : null;
}

// ---------- 記録 ----------
export function emptyStats() {
  return { plays: 0, totalScore: 0, best: 0, perfectTotal: 0, maxCombo: 0, bestPerfectStreak: 0 };
}

/**
 * 1プレイの結果を記録に反映する。
 * コンティニュー後に再度ゲームオーバーになっても二重計上しないよう、
 * 前回反映済みの値（committed）との差分だけ加算する。
 */
export function commitPlay(stats, play, committed = null) {
  const prev = committed ?? { score: 0, perfects: 0, counted: false };
  const next = { ...stats };
  if (!prev.counted) next.plays += 1;
  next.totalScore += play.score - prev.score;
  next.perfectTotal += play.perfects - prev.perfects;
  next.best = Math.max(next.best, play.score);
  next.maxCombo = Math.max(next.maxCombo, play.maxCombo);
  next.bestPerfectStreak = Math.max(next.bestPerfectStreak, play.maxPerfectStreak);
  return { stats: next, committed: { score: play.score, perfects: play.perfects, counted: true } };
}
