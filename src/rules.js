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
export function cycleParams(level, combo = 0, rand = Math.random) {
  const lv = Math.max(1, level);
  let fillDuration = Math.max(0.9, 2.6 * 0.95 ** (lv - 1));
  let returnDuration = Math.max(0.45, 0.95 * 0.975 ** (lv - 1));
  const pourDuration = Math.max(0.25, 0.4 * 0.985 ** (lv - 1));

  fillDuration *= Math.max(0.85, 1 - combo * 0.005);

  if (lv > 50) {
    fillDuration *= 0.7 + rand() * 0.6;   // ±30%
    returnDuration *= 0.85 + rand() * 0.3; // ±15%
  } else if (lv > 30) {
    fillDuration *= 0.85 + rand() * 0.3;  // ±15%
  }
  return { fillDuration, pourDuration, returnDuration };
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
