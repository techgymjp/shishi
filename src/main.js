// 鹿威しカコーン（Japan Garden KAKOON!） ゲーム全体の状態管理
import { Sound } from './audio.js';
import { Scene3D } from './scene3d.js';
import { ShishiOdoshi } from './shishi.js';
import {
  MAX_MISSES, JUDGE_WINDOWS, judge, pointsFor, comboMultiplier, levelFor, tierFor, cycleParams,
  TITLES, unlockedTitles, currentTitle, emptyStats, commitPlay,
} from './rules.js';

const PERFECT_SLOW_MS = 200;   // PERFECT時のスロー演出
const SLOW_SCALE = 0.3;
const GAMEOVER_DELAY_MS = 700;

const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('garden'), fx: $('fx'), hud: $('hud'), bottom: $('bottom'),
  loading: $('loading-screen'), progress: $('progress-bar'), loadingText: $('loading-text'),
  score: $('score'), combo: $('combo'), comboWrap: $('combo-wrap'), lives: $('lives'),
  hudBest: $('hud-best'), level: $('level'), judge: $('judge'), mult: $('mult'),
  tapHint: $('tap-hint'), gauge: $('gauge-fill'),
  title: $('title-screen'), result: $('result-screen'), settings: $('settings-screen'),
  best: $('best'), titleName: $('title-name'),
  btnStart: $('btn-start'), btnSound: $('btn-sound'), btnSettings: $('btn-settings'),
  finalScore: $('final-score'), newBest: $('new-best'), rBest: $('r-best'), rPerfect: $('r-perfect'),
  rGreat: $('r-great'), rCombo: $('r-combo'), rTitle: $('r-title'),
  btnRetry: $('btn-retry'), btnHome: $('btn-home'),
  optSound: $('opt-sound'), optVibe: $('opt-vibe'), records: $('records'), titles: $('titles'),
  btnSettingsClose: $('btn-settings-close'), btnReset: $('btn-reset'),
};

// ---------- 端末内保存（読み書きに失敗しても遊べるように） ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : { ...d, ...JSON.parse(v) }; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存不可 */ } },
};
let stats = store.get('kakoon.stats', emptyStats());
const settings = store.get('kakoon.settings', { sound: true, vibe: true });

// ---------- 主要オブジェクト ----------
const sound = new Sound();
sound.setEnabled(settings.sound);
const renderer = new Scene3D(el.canvas, el.fx);
const shishi = new ShishiOdoshi(cycleParams(3));

const game = {
  mode: 'loading',
  score: 0, combo: 0, maxCombo: 0, perfectStreak: 0, maxPerfectStreak: 0,
  successes: 0, misses: 0, perfects: 0, greats: 0, goods: 0,
  tappedCycle: -1,       // 1サイクル1回の入力制限
  pendingLate: null,     // 衝突後の「遅め」タップ受付 { cycle, impactTime, result? }
  cycleResult: null,     // 衝突前に確定した判定（衝突時の演出用）
  committed: null,
};
// mode: loading | title | play | ending | result
let slowUntil = 0;

// ---------- 判定 ----------
function onTap() {
  if (game.mode !== 'play') return;
  const now = shishi.time;

  // 衝突直後の遅めのタップは、直前のサイクルとして判定
  const late = game.pendingLate;
  if (late && game.tappedCycle !== late.cycle && now - late.impactTime <= JUDGE_WINDOWS.GOOD) {
    game.tappedCycle = late.cycle;
    game.pendingLate = null;
    applyResult(judge(now - late.impactTime), now - late.impactTime);
    return;
  }
  // 水が溜まっている間のタップは無視（ペナルティなし）
  if (shishi.phase === 'fill' || game.tappedCycle === shishi.cycle) return;

  game.tappedCycle = shishi.cycle;
  const delta = now - shishi.impactTime;
  const result = judge(delta);
  game.cycleResult = result;
  applyResult(result, delta);
}

function applyResult(result, delta) {
  if (result === 'MISS') {
    game.misses += 1;
    game.combo = 0;
    game.perfectStreak = 0;
    showJudge('MISS', delta < 0 ? 'はやい' : 'おそい');
    vibrate([40, 60, 40]);
  } else {
    game.combo += 1;
    game.successes += 1;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    if (result === 'PERFECT') {
      game.perfects += 1;
      game.perfectStreak += 1;
      game.maxPerfectStreak = Math.max(game.maxPerfectStreak, game.perfectStreak);
      slowUntil = performance.now() + PERFECT_SLOW_MS;
      vibrate(30);
    } else {
      game.perfectStreak = 0;
      if (result === 'GREAT') game.greats += 1; else game.goods += 1;
      vibrate(15);
    }
    game.score += pointsFor(result, game.combo);
    showJudge(result);
    const m = comboMultiplier(game.combo);
    if (m > 1 && comboMultiplier(game.combo - 1) < m) flashMultiplier(`コンボ倍率 ×${m.toFixed(1)}`);
  }
  renderer.judgeEffect(result);
  sound.judge(result);
  updateHud(true);
  if (game.misses >= MAX_MISSES) endGame();
}

/** 衝突のたび：音を鳴らし、未入力なら遅めのタップを待ってからMISSにする */
function onImpact(impactTime, cycle) {
  const r = game.cycleResult;
  const strength = r === 'PERFECT' ? 1.15 : r === 'GREAT' ? 1 : r === 'GOOD' ? 0.85 : 0.7;
  sound.kakoon(game.mode === 'title' ? 0.7 : strength);
  renderer.impact(game.mode === 'title' ? 0.6 : strength);
  game.cycleResult = null;

  if (game.mode !== 'play') return;
  if (game.tappedCycle !== cycle) game.pendingLate = { cycle, impactTime };
  shishi.setParams(cycleParams(levelFor(game.successes), game.combo));
}

function checkLateMiss() {
  const late = game.pendingLate;
  if (!late || game.mode !== 'play') return;
  if (shishi.time - late.impactTime > JUDGE_WINDOWS.GOOD) {
    game.pendingLate = null;
    if (game.tappedCycle !== late.cycle) {
      game.tappedCycle = late.cycle;
      applyResult('MISS', 1);
    }
  }
}

// ---------- 表示 ----------
function showJudge(result, sub = '') {
  el.judge.className = 'judge';
  el.judge.innerHTML = sub ? `${result}<small>${sub}</small>` : result;
  void el.judge.offsetWidth;
  el.judge.className = `judge ${result} show`;
}

function flashMultiplier(text) {
  el.mult.textContent = text;
  el.mult.classList.remove('show');
  void el.mult.offsetWidth;
  el.mult.classList.add('show');
}

function updateHud(bump = false) {
  el.score.textContent = game.score.toLocaleString();
  el.combo.textContent = game.combo;
  el.comboWrap.classList.toggle('zero', game.combo === 0);
  if (bump && game.combo > 0) {
    el.comboWrap.classList.remove('bump'); void el.comboWrap.offsetWidth; el.comboWrap.classList.add('bump');
  }
  const left = Math.max(MAX_MISSES - game.misses, 0);
  el.lives.textContent = '●'.repeat(left) + '○'.repeat(MAX_MISSES - left);
  el.hudBest.textContent = Math.max(stats.best, game.score).toLocaleString();
  const lv = levelFor(game.successes);
  el.level.textContent = `Lv.${lv} ${tierFor(lv)}`;
}

function updateTitleScreen() {
  el.best.textContent = stats.best.toLocaleString();
  const t = currentTitle(stats);
  el.titleName.textContent = t ? `称号：${t.name}` : '';
  el.btnSound.textContent = settings.sound ? '🔊' : '🔇';
}

function showScreen(name) {
  el.loading.classList.toggle('active', name === 'loading');
  el.title.classList.toggle('active', name === 'title');
  el.result.classList.toggle('active', name === 'result');
  const playing = name === null;
  el.hud.hidden = !playing && name !== 'result';
  el.bottom.hidden = !playing;
}

// ---------- メインループ ----------
let lastTs = performance.now();
function frame(ts) {
  const realDt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  const dt = ts < slowUntil ? realDt * SLOW_SCALE : realDt;

  if (game.mode !== 'result' && game.mode !== 'loading') {
    const prevCycle = shishi.cycle;
    const prevImpact = shishi.impactTime;
    const events = shishi.update(dt);
    for (const ev of events) {
      if (ev === 'pour') { sound.pour(); renderer.splash(0.8); }
      if (ev === 'impact') onImpact(prevImpact, prevCycle);
    }
    checkLateMiss();
  }
  renderer.update(realDt);

  // タップのタイミングが近づくと光る
  let glow = 0;
  if (game.mode === 'play' && shishi.phase !== 'fill' && game.tappedCycle !== shishi.cycle) {
    const remain = shishi.impactTime - shishi.time;
    glow = Math.max(0, 1 - remain / 0.6);
  }
  renderer.draw(shishi, { glow });
  el.tapHint.classList.toggle('hot', glow > 0.4);
  el.gauge.style.width = `${(shishi.fill * 100).toFixed(1)}%`;

  requestAnimationFrame(frame);
}

// ---------- ゲームの流れ ----------
function startGame() {
  sound.unlock();
  Object.assign(game, {
    mode: 'play', score: 0, combo: 0, maxCombo: 0, perfectStreak: 0, maxPerfectStreak: 0,
    successes: 0, misses: 0, perfects: 0, greats: 0, goods: 0,
    tappedCycle: -1, pendingLate: null, cycleResult: null, committed: null,
  });
  shishi.params = cycleParams(1, 0);
  shishi.nextParams = null;
  shishi.reset();
  updateHud();
  renderer.setMode('play');
  showScreen(null);
}

function endGame() {
  game.mode = 'ending';
  game.pendingLate = null;
  setTimeout(showResult, GAMEOVER_DELAY_MS);
}

function showResult() {
  const before = new Set(unlockedTitles(stats).map((t) => t.id));
  const prevBest = stats.best;
  const res = commitPlay(stats, {
    score: game.score, perfects: game.perfects, maxCombo: game.maxCombo, maxPerfectStreak: game.maxPerfectStreak,
  }, game.committed);
  stats = res.stats;
  game.committed = res.committed;
  store.set('kakoon.stats', stats);

  const newTitles = unlockedTitles(stats).filter((t) => !before.has(t.id));
  el.finalScore.textContent = game.score.toLocaleString();
  el.newBest.hidden = !(game.score > prevBest);
  el.rBest.textContent = stats.best.toLocaleString();
  el.rPerfect.textContent = game.perfects;
  el.rGreat.textContent = game.greats;
  el.rCombo.textContent = game.maxCombo;
  el.rTitle.hidden = newTitles.length === 0;
  el.rTitle.textContent = newTitles.length ? `称号獲得：${newTitles.map((t) => t.name).join('・')}` : '';
  game.mode = 'result';
  updateHud();
  showScreen('result');
}

function goHome() {
  game.mode = 'title';
  game.combo = 0;
  shishi.params = cycleParams(3);
  shishi.nextParams = null;
  renderer.setMode('title');
  updateTitleScreen();
  showScreen('title');
}

// ---------- 設定 ----------
function openSettings() {
  el.optSound.checked = settings.sound;
  el.optVibe.checked = settings.vibe;
  const rows = [
    ['累計プレイ回数', stats.plays],
    ['累計スコア', stats.totalScore],
    ['最高スコア', stats.best],
    ['PERFECT累計', stats.perfectTotal],
    ['最大コンボ', stats.maxCombo],
    ['最高連続PERFECT', stats.bestPerfectStreak],
  ];
  el.records.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v.toLocaleString()}</dd>`).join('');
  const got = new Set(unlockedTitles(stats).map((t) => t.id));
  el.titles.innerHTML = TITLES.map((t) =>
    `<li class="${got.has(t.id) ? 'got' : ''}"><span>${got.has(t.id) ? '★' : '☆'} ${t.name}</span><span>${t.desc}</span></li>`).join('');
  el.settings.classList.add('active');
}

function setSound(on) {
  settings.sound = on;
  store.set('kakoon.settings', settings);
  sound.unlock();
  sound.setEnabled(on);
  updateTitleScreen();
}

function vibrate(pattern) {
  if (settings.vibe && navigator.vibrate) navigator.vibrate(pattern);
}

// ---------- 入力 ----------
// 画面全体をタップ可能にする（ボタンを探す必要がない）
el.canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(); });
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    if (game.mode === 'play') { e.preventDefault(); onTap(); }
  }
});
el.btnStart.addEventListener('click', startGame);
el.btnRetry.addEventListener('click', () => { if (game.mode === 'result') startGame(); });
el.btnHome.addEventListener('click', () => { if (game.mode === 'result') goHome(); });
el.btnSound.addEventListener('click', () => setSound(!settings.sound));
el.btnSettings.addEventListener('click', openSettings);
el.btnSettingsClose.addEventListener('click', () => el.settings.classList.remove('active'));
el.optSound.addEventListener('change', () => setSound(el.optSound.checked));
el.optVibe.addEventListener('change', () => { settings.vibe = el.optVibe.checked; store.set('kakoon.settings', settings); });
el.btnReset.addEventListener('click', () => {
  if (!confirm('記録と称号をすべてリセットしますか？')) return;
  stats = emptyStats();
  store.set('kakoon.stats', stats);
  openSettings();
  updateTitleScreen();
});
// タイトル画面でも最初の操作で音を有効化（自動再生制限への対応）
el.title.addEventListener('pointerdown', () => sound.unlock(), { once: true });

window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { lastTs = performance.now(); });

updateTitleScreen();
showScreen('loading');
requestAnimationFrame(frame);

renderer.load((p) => { el.progress.style.width = `${Math.round(p * 100)}%`; })
  .catch((err) => {
    console.error(err);
    el.loadingText.textContent = '3D表示を準備できませんでした。ページを再読み込みしてください。';
    throw err;
  })
  .then(() => {
    game.mode = 'title';
    renderer.setMode('title');
    showScreen('title');
  });

// 自動テスト用（URLに ?debug を付けたときのみ）
if (new URLSearchParams(location.search).has('debug')) window.__kakoon = { game, shishi, renderer, stats: () => stats };
