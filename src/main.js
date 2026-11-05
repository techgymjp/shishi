// 鹿威しカコーン（Japan Garden KAKOON!） ゲーム全体の状態管理
import { Sound } from './audio.js';
import { Scene3D } from './scene3d.js';
import { ShishiOdoshi } from './shishi.js';
import {
  MAX_MISSES, JUDGE_WINDOWS, judge, pointsFor, comboMultiplier, levelFor, tierFor, cycleParams,
  TITLES, unlockedTitles, currentTitle, emptyStats, commitPlay,
  NO_GIMMICKS, GIMMICK_INFO, gimmicksForPractice,
} from './rules.js';

const PERFECT_SLOW_MS = 200;   // PERFECT時のスロー演出
const SLOW_SCALE = 0.3;
const GAMEOVER_DELAY_MS = 700;
const TAP_ACCEPT = 0.6;        // 衝突のこの秒数前より早いタップは判定しない（MISSにしない）
const RING_TIME = 0.9;         // タイミングリングが縮み始める時間

const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('garden'), fx: $('fx'), hud: $('hud'), bottom: $('bottom'),
  loading: $('loading-screen'), progress: $('progress-bar'), loadingText: $('loading-text'),
  score: $('score'), combo: $('combo'), comboWrap: $('combo-wrap'), lives: $('lives'),
  hudBest: $('hud-best'), level: $('level'), judge: $('judge'), mult: $('mult'),
  tapHint: $('tap-hint'), timing: $('timing'), approach: $('approach'),
  title: $('title-screen'), result: $('result-screen'), settings: $('settings-screen'),
  best: $('best'), titleName: $('title-name'),
  btnStart: $('btn-start'), btnSound: $('btn-sound'), btnSettings: $('btn-settings'),
  finalScore: $('final-score'), newBest: $('new-best'), rBest: $('r-best'), rPerfect: $('r-perfect'),
  rGreat: $('r-great'), rCombo: $('r-combo'), rTitle: $('r-title'),
  btnRetry: $('btn-retry'), btnHome: $('btn-home'),
  optSound: $('opt-sound'), optVibe: $('opt-vibe'), records: $('records'), titles: $('titles'),
  btnSettingsClose: $('btn-settings-close'), btnReset: $('btn-reset'),
  optGimmick: $('opt-gimmick'), banner: $('banner'), optBgm: $('opt-bgm'),
};

// ---------- 端末内保存（読み書きに失敗しても遊べるように） ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : { ...d, ...JSON.parse(v) }; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存不可 */ } },
};
let stats = store.get('kakoon.stats', emptyStats());
const settings = store.get('kakoon.settings', { sound: true, bgm: true, vibe: true, gimmick: 'auto' });

// ---------- 主要オブジェクト ----------
const sound = new Sound();
sound.setEnabled(settings.sound);
sound.setBgm(settings.bgm);
const renderer = new Scene3D(el.canvas, el.fx);
// 鹿威し（2本目はギミック「2本の鹿威し」で登場）
const units = [0, 1].map(() => ({
  sim: new ShishiOdoshi(cycleParams(3)),
  active: false,
  tappedCycle: -1,       // 1サイクル1回の入力制限
  pendingLate: null,     // 衝突後の「遅め」タップ受付 { cycle, impactTime }
  cycleResult: null,     // 衝突前に確定した判定（衝突時の演出用）
}));
units[0].active = true;
const shishi = units[0].sim;
let gimmicks = { ...NO_GIMMICKS };

const game = {
  mode: 'loading',
  score: 0, combo: 0, maxCombo: 0, perfectStreak: 0, maxPerfectStreak: 0,
  successes: 0, misses: 0, perfects: 0, greats: 0, goods: 0, level: 1,
  committed: null,
};
// mode: loading | title | play | ending | result
let slowUntil = 0;

// ---------- ギミック ----------
function resetUnit(u, params) {
  u.sim.params = params;
  u.sim.nextParams = null;
  u.sim.reset();
  u.tappedCycle = -1;
  u.pendingLate = null;
  u.cycleResult = null;
}

function applyGimmicks(g, announce = false) {
  const prev = gimmicks;
  gimmicks = { ...g };
  renderer.setGimmicks(gimmicks);
  sound.setWeather(gimmicks);
  const lv = game.level;
  if (gimmicks.twin && !units[1].active) {
    // 2本目：1本目と半周期ずらして交互に鳴るようにする
    const u = units[1];
    resetUnit(u, cycleParams(lv, game.combo, Math.random, gimmicks));
    const p = u.sim.params;
    u.sim.update((p.fillDuration + p.pourDuration + p.returnDuration) / 2);
    u.active = true;
  } else if (!gimmicks.twin && units[1].active) {
    units[1].active = false;
    units[1].pendingLate = null;
  }
  for (const u of units) if (u.active) u.sim.setParams(cycleParams(lv, game.combo, Math.random, gimmicks));
  if (announce) {
    const added = Object.keys(GIMMICK_INFO).filter((k) => (k === 'size' ? gimmicks.size !== 1 && gimmicks.size !== prev.size : gimmicks[k] && !prev[k]));
    showBanner(`Lv.${lv} ${tierFor(lv)}`, added.map((k) => `${GIMMICK_INFO[k].icon} ${k === 'size' ? (gimmicks.size > 1 ? '太い竹筒' : '細い竹筒') : GIMMICK_INFO[k].desc}`));
  }
}

function showBanner(title, lines) {
  el.banner.innerHTML = `<b>${title}</b>${lines.map((l) => `<span>${l}</span>`).join('')}`;
  el.banner.classList.remove('show');
  void el.banner.offsetWidth;
  el.banner.classList.add('show');
}

function gimmickIcons() {
  return Object.keys(GIMMICK_INFO).filter((k) => (k === 'size' ? gimmicks.size !== 1 : gimmicks[k])).map((k) => GIMMICK_INFO[k].icon).join('');
}

// ---------- 判定 ----------
function onTap() {
  if (game.mode !== 'play') return;

  // 判定の対象：遅めのタップ待ち、またはこれから衝突する鹿威しのうち、衝突時刻に最も近いもの
  let best = null;
  units.forEach((u, i) => {
    if (!u.active) return;
    const now = u.sim.time;
    const late = u.pendingLate;
    if (late && u.tappedCycle !== late.cycle && now - late.impactTime <= JUDGE_WINDOWS.GOOD) {
      const d = now - late.impactTime;
      if (!best || Math.abs(d) < Math.abs(best.delta)) best = { i, u, delta: d, late: true };
    }
    if (u.tappedCycle !== u.sim.cycle && u.sim.phase !== 'fill') {
      const d = now - u.sim.impactTime;
      if (-d <= TAP_ACCEPT && (!best || Math.abs(d) < Math.abs(best.delta))) best = { i, u, delta: d, late: false };
    }
  });

  if (!best) {
    // まだ早い：水が一番溜まっている竹筒が、水の量に応じて沈んで戻る（判定はしない）
    const fills = units.map((u) => (u.active && u.sim.phase === 'fill' ? u.sim.fill : -1));
    const i = fills.indexOf(Math.max(...fills));
    if (i >= 0 && fills[i] >= 0) renderer.nudgeTube('dip', 1, fills[i], i);
    else renderer.nudgeTube('wobble', 0.8, 0, 0);
    showHint('まだ');
    return;
  }

  const { i, u, delta } = best;
  const result = judge(delta);
  if (best.late) {
    u.tappedCycle = u.pendingLate.cycle;
    u.pendingLate = null;
  } else {
    u.tappedCycle = u.sim.cycle;
    u.cycleResult = result;
  }
  renderer.nudgeTube(result === 'MISS' ? 'wobble' : 'push', result === 'PERFECT' ? 1.2 : 1, 0, i);
  applyResult(result, delta, i);
}

function applyResult(result, delta, i = 0) {
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
    showJudge(result, result === 'PERFECT' && game.perfectStreak > 1 ? `${game.perfectStreak}連続` : '');
    const m = comboMultiplier(game.combo);
    if (m > 1 && comboMultiplier(game.combo - 1) < m) flashMultiplier(`コンボ倍率 ×${m.toFixed(1)}`);
  }
  renderer.judgeEffect(result, i, game.perfectStreak);
  sound.judge(result, game.perfectStreak);
  // レベルアップでギミックが変わる
  const lv = levelFor(game.successes);
  if (lv !== game.level) {
    game.level = lv;
    applyGimmicks(gimmicksForPractice(settings.gimmick, lv), true);
  }
  updateHud(true);
  if (game.misses >= MAX_MISSES) endGame();
}

/** 衝突のたび：音を鳴らし、未入力なら遅めのタップを待ってからMISSにする */
function onImpact(i, impactTime, cycle) {
  const u = units[i];
  const r = u.cycleResult;
  const strength = r === 'PERFECT' ? 1.15 : r === 'GREAT' ? 1 : r === 'GOOD' ? 0.85 : 0.7;
  sound.kakoon(game.mode === 'title' ? 0.7 : strength);
  renderer.impact(game.mode === 'title' ? 0.6 : strength, i);
  u.cycleResult = null;

  if (game.mode !== 'play') return;
  if (u.tappedCycle !== cycle) u.pendingLate = { cycle, impactTime };
  u.sim.setParams(cycleParams(game.level, game.combo, Math.random, gimmicks));
}

function checkLateMiss() {
  if (game.mode !== 'play') return;
  units.forEach((u, i) => {
    const late = u.pendingLate;
    if (!late || !u.active) return;
    if (u.sim.time - late.impactTime > JUDGE_WINDOWS.GOOD) {
      u.pendingLate = null;
      if (u.tappedCycle !== late.cycle && game.mode === 'play') {
        u.tappedCycle = late.cycle;
        applyResult('MISS', 1, i);
      }
    }
  });
}

// ---------- 表示 ----------
function showJudge(result, sub = '') {
  el.judge.className = 'judge';
  el.judge.innerHTML = sub ? `${result}<small>${sub}</small>` : result;
  void el.judge.offsetWidth;
  el.judge.className = `judge ${result} show`;
}

function showHint(text) {
  el.judge.className = 'judge';
  el.judge.textContent = text;
  void el.judge.offsetWidth;
  el.judge.className = 'judge HINT show';
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
  el.level.textContent = `Lv.${lv} ${tierFor(lv)} ${gimmickIcons()}`;
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
    units.forEach((u, i) => {
      if (!u.active) return;
      const prevCycle = u.sim.cycle;
      const prevImpact = u.sim.impactTime;
      const events = u.sim.update(dt);
      for (const ev of events) {
        if (ev === 'pour') { sound.pour(); renderer.splash(0.8, i); }
        if (ev === 'impact') onImpact(i, prevImpact, prevCycle);
      }
    });
    checkLateMiss();
  }
  renderer.update(realDt);

  // タップのタイミングが近づくと光る
  const glows = units.map((u) => {
    if (game.mode !== 'play' || !u.active || u.sim.phase === 'fill' || u.tappedCycle === u.sim.cycle) return 0;
    return Math.max(0, 1 - (u.sim.impactTime - u.sim.time) / 0.6);
  });
  renderer.draw(units.map((u) => (u.active ? u.sim : null)), { glows });
  updateTimingRing();
  const maxFill = Math.max(...units.map((u) => (u.active && u.sim.phase === 'fill' ? u.sim.fill : 0)));
  sound.setWater(maxFill, units.some((u) => u.active && u.sim.phase === 'fill') ? 'tube' : 'stone');
  el.tapHint.classList.toggle('hot', Math.max(...glows) > 0.4);

  requestAnimationFrame(frame);
}

/** 石に向かって縮むリング：内側の輪と重なった瞬間が衝突（PERFECT） */
function updateTimingRing() {
  let pick = -1, remain = Infinity;
  units.forEach((u, i) => {
    if (!u.active || u.sim.phase === 'fill' || u.tappedCycle === u.sim.cycle) return;
    const r = u.sim.impactTime - u.sim.time;
    if (r < remain) { remain = r; pick = i; }
  });
  const show = game.mode === 'play' && pick >= 0 && remain < RING_TIME && remain > -0.2;
  el.timing.hidden = !show;
  if (!show) return;
  const pos = renderer.contactScreen(pick);
  if (!pos) { el.timing.hidden = true; return; }
  const size = Math.max(56, el.canvas.clientWidth * 0.17);
  el.timing.style.transform = `translate(${pos.x - size / 2}px, ${pos.y - size / 2}px)`;
  el.timing.style.width = el.timing.style.height = `${size}px`;
  const k = Math.max(remain, 0) / RING_TIME;
  el.approach.style.transform = `scale(${1 + k * 2.2})`;
  el.timing.classList.toggle('perfect', Math.abs(remain) <= JUDGE_WINDOWS.PERFECT);
}

// ---------- ゲームの流れ ----------
function startGame() {
  sound.unlock();
  Object.assign(game, {
    mode: 'play', score: 0, combo: 0, maxCombo: 0, perfectStreak: 0, maxPerfectStreak: 0,
    successes: 0, misses: 0, perfects: 0, greats: 0, goods: 0, level: 1, committed: null,
  });
  units[1].active = false;
  const g = gimmicksForPractice(settings.gimmick, 1);
  resetUnit(units[0], cycleParams(1, 0, Math.random, g));
  applyGimmicks(g);
  updateHud();
  renderer.setMode('play');
  showScreen(null);
}

function endGame() {
  game.mode = 'ending';
  for (const u of units) u.pendingLate = null;
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
  game.level = 1;
  showTitleGarden();
  renderer.setMode('title');
  updateTitleScreen();
  showScreen('title');
}

/** タイトル画面の庭：練習でギミックを選んでいればその様子を見せる */
function showTitleGarden() {
  const g = settings.gimmick && settings.gimmick !== 'auto' ? gimmicksForPractice(settings.gimmick, 1) : { ...NO_GIMMICKS };
  if (!g.twin) units[1].active = false;
  applyGimmicks(g);
  for (const u of units) if (u.active) u.sim.setParams(cycleParams(3, 0, Math.random, g));
}

// ---------- 設定 ----------
function openSettings() {
  el.optSound.checked = settings.sound;
  el.optVibe.checked = settings.vibe;
  el.optBgm.checked = settings.bgm;
  el.optGimmick.value = settings.gimmick || 'auto';
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
el.optBgm.addEventListener('change', () => {
  settings.bgm = el.optBgm.checked;
  store.set('kakoon.settings', settings);
  sound.unlock();
  sound.setBgm(settings.bgm);
});
el.optGimmick.addEventListener('change', () => {
  settings.gimmick = el.optGimmick.value;
  store.set('kakoon.settings', settings);
  if (game.mode === 'title') showTitleGarden();
});
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
    showTitleGarden();
    showScreen('title');
  });

// 自動テスト用（URLに ?debug を付けたときのみ）
if (new URLSearchParams(location.search).has('debug')) window.__kakoon = { game, shishi, units, renderer, stats: () => stats, applyGimmicks, settings };
