// 鹿威しカコーン（Japan Garden KAKOON!） ゲーム全体の状態管理
import { Sound } from './audio.js';
import { Ads, plugin } from './admob.js';
import { t, setLang, detectLang, applyDom, getLang } from './i18n.js';
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
const CONTINUE_MAX = 2;        // リワード広告のコンティニュー：1ゲームで使える回数
const CONTINUE_DELAY_MS = 2200; // 3回目のMISSを見届けられるよう、少し待ってから案内を出す
const CONTINUE_WAIT = 6;       // 案内は6秒で自動的に結果画面へ進む
const PRIVACY_URL = { ja: 'https://techgym.jp/privacy-policy/', en: 'https://techgym.jp/privacy-policy-en/' };

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
  optGimmick: $('opt-gimmick'), banner: $('banner'), optBgm: $('opt-bgm'), optLang: $('opt-lang'),
  btnHowto: $('btn-howto'), howto: $('howto-screen'), btnHowtoPlay: $('btn-howto-play'), btnHowtoBack: $('btn-howto-back'),
  pause: $('pause-screen'), btnPause: $('btn-pause'), btnResume: $('btn-resume'), btnPauseHome: $('btn-pause-home'),
  cont: $('continue-screen'), contNote: $('continue-note'), btnCont: $('btn-continue'), btnContSkip: $('btn-continue-skip'),
  rContinue: $('r-continue'), buildInfo: $('build-info'), privacyLink: $('privacy-link'),
  adPrivacy: $('ad-privacy'), adPrivacyLink: $('ad-privacy-link'), app: $('app'),
  btnShare: $('btn-share'), shareMenu: $('share-menu'), shareX: $('share-x'), shareLine: $('share-line'),
  shareFb: $('share-fb'), shareCopy: $('share-copy'),
};

// ---------- 端末内保存（読み書きに失敗しても遊べるように） ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : { ...d, ...JSON.parse(v) }; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存不可 */ } },
};
let stats = store.get('kakoon.stats', emptyStats());
const settings = store.get('kakoon.settings', { sound: true, bgm: true, vibe: true, gimmick: 'auto', lang: 'auto' });
setLang(detectLang(settings.lang));
applyDom();

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
  paused: false,          // 一時停止中（戻るボタン・Ⅱボタン・アプリの切り替え）
  continues: 0,           // リワード広告でコンティニューした回数
  beforeMiss: null,       // 直前の MISS の前のコンボ（コンティニューで戻す）
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
    showBanner(`Lv.${lv} ${t(tierFor(lv))}`, added.map((k) => `${GIMMICK_INFO[k].icon} ${k === 'size' ? t(gimmicks.size > 1 ? '太い竹筒' : '細い竹筒') : t(GIMMICK_INFO[k].desc)}`));
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
    showHint(t('まだ'));
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
    game.beforeMiss = { combo: game.combo, perfectStreak: game.perfectStreak };
    game.misses += 1;
    game.combo = 0;
    game.perfectStreak = 0;
    showJudge('MISS', t(delta < 0 ? 'はやい' : 'おそい'));
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
    showJudge(result, result === 'PERFECT' && game.perfectStreak > 1 ? t('{0}連続', game.perfectStreak) : '');
    const m = comboMultiplier(game.combo);
    if (m > 1 && comboMultiplier(game.combo - 1) < m) flashMultiplier(t('コンボ倍率 ×{0}', m.toFixed(1)));
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
  el.level.textContent = `Lv.${lv} ${t(tierFor(lv))} ${gimmickIcons()}`;
}

function updateTitleScreen() {
  el.best.textContent = stats.best.toLocaleString();
  const ti = currentTitle(stats);
  el.titleName.textContent = ti ? t('称号：{0}', t(ti.name)) : '';
  el.btnSound.textContent = settings.sound ? '🔊' : '🔇';
}

function showScreen(name) {
  el.loading.classList.toggle('active', name === 'loading');
  el.title.classList.toggle('active', name === 'title');
  el.howto.classList.toggle('active', name === 'howto');
  el.pause.classList.toggle('active', name === 'pause');
  el.cont.classList.toggle('active', name === 'continue');
  el.result.classList.toggle('active', name === 'result');
  const playing = name === null;
  el.hud.hidden = !playing && !['result', 'pause', 'continue'].includes(name);
  el.bottom.hidden = !playing;
  el.btnPause.hidden = !playing;
}

/** バナー広告：タイトル・あそびかた・一時停止・結果画面だけ（プレイ中は出さない） */
function updateBanner() {
  // 全画面広告をはさんで画面を移る間は出さない（広告を閉じた直後に一瞬出るのを防ぐ）
  const want = !adBusy && (['title', 'howto', 'result'].includes(game.mode) || game.paused);
  Ads.setBanner(want);
  el.app.classList.toggle('banner-on', want && Ads.canBanner);
}

// ---------- メインループ ----------
let lastTs = performance.now();
function frame(ts) {
  let realDt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  if (game.paused || Ads.showing) realDt = 0;   // 一時停止中・広告の表示中は時間を止める
  const dt = ts < slowUntil ? realDt * SLOW_SCALE : realDt;
  updateBanner();

  if (game.mode !== 'result' && game.mode !== 'loading' && dt > 0) {
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
// ---------- 全画面広告（アプリのみ）----------
// 「プレイ」（タイトル・あそびかたから）、「タイトルへ」（あそびかた・一時停止・結果画面から）、
// 一時停止からの「再開」、結果画面の「もう一度遊ぶ」のたびに毎回出す
let adBusy = false;
async function withInterstitial(next) {
  if (adBusy) return;
  if (Ads.available) {
    adBusy = true;
    updateBanner();
    await Ads.showInterstitial(3000);
    adBusy = false;
  }
  next();
}
function play() { sound.unlock(); withInterstitial(() => { if (['title', 'howto'].includes(game.mode)) startGame(); }); }
function retry() { withInterstitial(() => { if (game.mode === 'result') startGame(); }); }
function backToTitle() { withInterstitial(() => { if (['howto', 'result'].includes(game.mode) || game.paused) goHome(); }); }
function openHowto() {
  if (game.mode !== 'title' || adBusy) return;
  game.mode = 'howto';
  showScreen('howto');
}

// ---------- 一時停止 ----------
function pauseGame() {
  if (game.mode !== 'play' || game.paused) return;
  game.paused = true;
  el.timing.hidden = true;
  showScreen('pause');
  sound.suspend();
}
function resumeFromPause() {
  withInterstitial(() => {
    if (!game.paused) return;
    game.paused = false;
    lastTs = performance.now();
    showScreen(null);
    sound.resume();
  });
}

// ---------- コンティニュー（リワード広告のチート。アプリのみ・1ゲーム2回まで）----------
// 3回目の MISS でゲームオーバーになったら、少し待ってから「広告を見て続ける」を出す。
// 最後まで見たら、その MISS を取り消して（MISS 2回・コンボも戻す）続きから遊べる。6秒で自動的に結果画面へ
const cont = { timer: null, t: 0, busy: false };
function offerContinue() {
  if (game.mode !== 'ending') return;
  game.mode = 'continue';
  cont.t = CONTINUE_WAIT;
  cont.busy = false;
  el.contNote.innerHTML = t('MISS が 3 回になりました。<br>広告を見ると MISS を 1 つ取り消して続けられます（あと {0} 回）。', CONTINUE_MAX - game.continues);
  el.btnCont.disabled = false;
  el.btnCont.textContent = t('▶ 広告を見て続ける');
  el.btnContSkip.textContent = t('結果へ（{0}）', cont.t);
  showScreen('continue');
  clearInterval(cont.timer);
  cont.timer = setInterval(() => {
    if (cont.busy || Ads.showing) return;
    cont.t -= 1;
    el.btnContSkip.textContent = t('結果へ（{0}）', Math.max(cont.t, 0));
    if (cont.t <= 0) skipContinue();
  }, 1000);
}
function skipContinue() {
  if (game.mode !== 'continue') return;
  clearInterval(cont.timer);
  showResult();
}
async function watchContinue() {
  if (game.mode !== 'continue' || cont.busy) return;
  cont.busy = true;
  el.btnCont.disabled = true;
  el.btnCont.textContent = t('広告を読み込んでいます…');
  const r = await Ads.showRewarded();
  clearInterval(cont.timer);
  if (game.mode !== 'continue') return;
  if (r === 'unavailable') {
    el.contNote.textContent = t('広告を読み込めませんでした');
    setTimeout(showResult, 2000);
    return;
  }
  if (r !== 'rewarded') { showResult(); return; }
  // 3回目の MISS を取り消して、続きから
  game.continues += 1;
  game.misses = MAX_MISSES - 1;
  if (game.beforeMiss) { game.combo = game.beforeMiss.combo; game.perfectStreak = game.beforeMiss.perfectStreak; }
  for (const u of units) { u.pendingLate = null; u.tappedCycle = u.sim.cycle; }
  game.mode = 'play';
  lastTs = performance.now();
  updateHud();
  showScreen(null);
}

function startGame() {
  sound.unlock();
  clearInterval(cont.timer);
  Object.assign(game, {
    mode: 'play', score: 0, combo: 0, maxCombo: 0, perfectStreak: 0, maxPerfectStreak: 0,
    successes: 0, misses: 0, perfects: 0, greats: 0, goods: 0, level: 1, committed: null,
    paused: false, continues: 0, beforeMiss: null,
  });
  units[1].active = false;
  const g = gimmicksForPractice(settings.gimmick, 1);
  resetUnit(units[0], cycleParams(1, 0, Math.random, g));
  applyGimmicks(g);
  updateHud();
  renderer.setMode('play');
  renderer.randomizeCamera();   // 毎回違うアングルから始める
  showScreen(null);
}

function endGame() {
  game.mode = 'ending';
  for (const u of units) u.pendingLate = null;
  if (Ads.canReward && game.continues < CONTINUE_MAX) setTimeout(offerContinue, CONTINUE_DELAY_MS);
  else setTimeout(() => { if (game.mode === 'ending') showResult(); }, GAMEOVER_DELAY_MS);
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
  el.rTitle.textContent = newTitles.length ? t('称号獲得：{0}', newTitles.map((x) => t(x.name)).join(getLang() === 'en' ? ', ' : '・')) : '';
  el.rContinue.hidden = game.continues === 0;
  el.rContinue.textContent = game.continues ? t('コンティニュー {0} 回', game.continues) : '';
  game.mode = 'result';
  el.shareMenu.hidden = true;
  updateHud();
  showScreen('result');
}

function goHome() {
  clearInterval(cont.timer);
  game.paused = false;
  sound.resume();
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

// ---------- シェア ----------
const SHARE_URL = 'https://techgym.jp/column/claude-code-game-shishi/';

function shareText() {
  return t('鹿威しカコーンで{0}点！ PERFECT {1}回・最大コンボ {2} #鹿威しカコーン',
    game.score.toLocaleString(), game.perfects, game.maxCombo)
    + (game.continues ? t('（コンティニュー {0} 回）', game.continues) : '');
}

async function onShare() {
  const text = shareText();
  // アプリ：Android の共有メニュー
  const nativeShare = plugin('Share');
  if (nativeShare) {
    try { await nativeShare.share({ title: t('鹿威しカコーン'), text, url: SHARE_URL, dialogTitle: t('シェア') }); } catch (e) { /* キャンセル */ }
    return;
  }
  // スマホ：端末の共有メニュー（LINE・X・メッセージなど）
  if (navigator.share) {
    try {
      await navigator.share({ title: t('鹿威しカコーン'), text, url: SHARE_URL });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // ユーザーが閉じた
    }
  }
  // それ以外：各サービスへのリンクとコピー
  const enc = encodeURIComponent;
  el.shareX.href = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(SHARE_URL)}`;
  el.shareLine.href = `https://social-plugins.line.me/lineit/share?url=${enc(SHARE_URL)}&text=${enc(text)}`;
  el.shareFb.href = `https://www.facebook.com/sharer/sharer.php?u=${enc(SHARE_URL)}`;
  el.shareMenu.hidden = !el.shareMenu.hidden;
}

async function copyShare() {
  const text = `${shareText()} ${SHARE_URL}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* コピー不可 */ }
    ta.remove();
  }
  el.shareCopy.textContent = t('コピーしました');
  setTimeout(() => { el.shareCopy.textContent = t('コピー'); }, 1600);
}

// ---------- 設定 ----------
function openSettings() {
  el.optSound.checked = settings.sound;
  el.optVibe.checked = settings.vibe;
  el.optBgm.checked = settings.bgm;
  el.optGimmick.value = settings.gimmick || 'auto';
  el.optLang.value = settings.lang || 'auto';
  const rows = [
    [t('累計プレイ回数'), stats.plays],
    [t('累計スコア'), stats.totalScore],
    [t('最高スコア'), stats.best],
    [t('PERFECT累計'), stats.perfectTotal],
    [t('最大コンボ'), stats.maxCombo],
    [t('最高連続PERFECT'), stats.bestPerfectStreak],
  ];
  el.records.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v.toLocaleString()}</dd>`).join('');
  const got = new Set(unlockedTitles(stats).map((t) => t.id));
  el.titles.innerHTML = TITLES.map((ti) =>
    `<li class="${got.has(ti.id) ? 'got' : ''}"><span>${got.has(ti.id) ? '★' : '☆'} ${t(ti.name)}</span><span>${t(ti.desc)}</span></li>`).join('');
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
  if (e.code === 'Escape') { if (game.paused) resumeFromPause(); else pauseGame(); return; }
  if (e.code === 'Space' || e.code === 'Enter') {
    if (game.mode === 'play') { e.preventDefault(); onTap(); }
  }
});
el.btnStart.addEventListener('click', play);
el.btnHowto.addEventListener('click', openHowto);
el.btnHowtoPlay.addEventListener('click', play);
el.btnHowtoBack.addEventListener('click', backToTitle);
el.btnPause.addEventListener('click', pauseGame);
el.btnResume.addEventListener('click', resumeFromPause);
el.btnPauseHome.addEventListener('click', backToTitle);
el.btnCont.addEventListener('click', watchContinue);
el.btnContSkip.addEventListener('click', skipContinue);
el.btnShare.addEventListener('click', onShare);
el.shareCopy.addEventListener('click', copyShare);
el.btnRetry.addEventListener('click', retry);
el.btnHome.addEventListener('click', backToTitle);
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
el.optLang.addEventListener('change', () => {
  settings.lang = el.optLang.value;
  store.set('kakoon.settings', settings);
  setLang(detectLang(settings.lang));
  applyDom();
  updatePrivacyLink();
  updateTitleScreen();
  updateHud();
  openSettings();
});
el.optGimmick.addEventListener('change', () => {
  settings.gimmick = el.optGimmick.value;
  store.set('kakoon.settings', settings);
  if (game.mode === 'title') showTitleGarden();
});
el.btnReset.addEventListener('click', () => {
  if (!confirm(t('記録と称号をすべてリセットしますか？'))) return;
  stats = emptyStats();
  store.set('kakoon.stats', stats);
  openSettings();
  updateTitleScreen();
});
// タイトル画面でも最初の操作で音を有効化（自動再生制限への対応）
el.title.addEventListener('pointerdown', () => sound.unlock(), { once: true });

window.addEventListener('resize', () => renderer.resize());
// 別のアプリに切り替えたら自動で一時停止して音を止める（広告の表示中は広告側が音を止めている）
document.addEventListener('visibilitychange', () => {
  lastTs = performance.now();
  if (document.hidden) {
    pauseGame();
    sound.suspend();
  } else if (!Ads.showing && !game.paused) {
    sound.resume();
  }
});
Ads.setSoundHooks({ suspend: () => sound.suspend(), resume: () => { if (!game.paused) sound.resume(); } });

// Android の戻るボタン：プレイ中は一時停止（一時停止中なら再開）、あそびかたではタイトルへ、
// タイトル・結果画面ではアプリを終了
if (plugin('App')) {
  plugin('App').addListener('backButton', () => {
    if (el.settings.classList.contains('active')) { el.settings.classList.remove('active'); return; }
    if (game.mode === 'howto') backToTitle();
    else if (game.mode === 'continue') skipContinue();
    else if (game.mode === 'title' || game.mode === 'result') plugin('App').exitApp();
    else if (game.paused) resumeFromPause();
    else if (game.mode === 'play') pauseGame();
  });
}

// タイトル画面の下：バージョン（アプリ版）・プライバシーポリシー・広告の設定（EU など）
if (window.APP_VERSION && window.APP_VERSION !== 'dev') el.buildInfo.textContent = window.APP_VERSION;
else el.buildInfo.hidden = true;
const updatePrivacyLink = () => { el.privacyLink.href = PRIVACY_URL[getLang()] || PRIVACY_URL.ja; };
updatePrivacyLink();
Ads.initDone.then(() => { if (Ads.privacyOptionsRequired) el.adPrivacy.hidden = false; });
el.adPrivacyLink.addEventListener('click', (e) => { e.preventDefault(); Ads.showPrivacyOptions(); });

updateTitleScreen();
showScreen('loading');
requestAnimationFrame(frame);

renderer.load((p) => { el.progress.style.width = `${Math.round(p * 100)}%`; })
  .catch((err) => {
    console.error(err);
    el.loadingText.textContent = t('3D表示を準備できませんでした。ページを再読み込みしてください。');
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
