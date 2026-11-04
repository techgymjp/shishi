// 鹿威しカコーン（Japan Garden KAKOON!） メインゲーム
import { AdPolicy, MockAdProvider } from './ads.js';

const TUBE_COUNT = 3;
const MAX_LIVES = 3;
const PERFECT_MIN = 0.72;   // 金色ゾーン
const PERFECT_MAX = 0.94;
const GOOD_MIN = 0.45;
const TIP_MS = 380;          // 傾いてから戻るまで

const $ = (id) => document.getElementById(id);
const el = {
  score: $('score'), combo: $('combo'), lives: $('lives'), best: $('best'),
  tubes: $('tubes'), popups: $('popups'),
  title: $('title-screen'), gameover: $('gameover-screen'), ad: $('ad-overlay'),
  finalScore: $('final-score'), newBest: $('new-best'),
  btnStart: $('btn-start'), btnContinue: $('btn-continue'), btnRetry: $('btn-retry'),
  adKind: $('ad-kind'), adCount: $('ad-count'), btnAdClose: $('btn-ad-close'),
};

// ---------- 保存（失敗しても動くように） ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* noop */ } },
};

// ---------- サウンド（Web Audio で「カコーン」を合成） ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; }
  }
  if (audioCtx?.state === 'suspended') audioCtx.resume();
}
function playKakoon(strength = 1) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  // 竹が石を打つ「カッ」＋余韻の「コーン」
  [[1250, 0.06, 0.5], [620, 0.5, 0.35], [930, 0.35, 0.15]].forEach(([freq, dur, vol]) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.92, t + dur);
    g.gain.setValueAtTime(vol * strength, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  });
}
function playSplash() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const len = Math.floor(audioCtx.sampleRate * 0.3);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource();
  const f = audioCtx.createBiquadFilter();
  const g = audioCtx.createGain();
  f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.value = 0.35;
  src.buffer = buf;
  src.connect(f).connect(g).connect(audioCtx.destination);
  src.start(t);
}

// ---------- 鹿威し ----------
const tubes = [];
function buildTubes() {
  el.tubes.innerHTML = '';
  tubes.length = 0;
  for (let i = 0; i < TUBE_COUNT; i++) {
    const unit = document.createElement('div');
    unit.className = 'unit';
    unit.innerHTML = `
      <div class="spout"></div><div class="drip"></div>
      <div class="tube">
        <div class="zone" style="bottom:${PERFECT_MIN * 100}%;height:${(PERFECT_MAX - PERFECT_MIN) * 100}%"></div>
        <div class="water"></div>
      </div>
      <div class="pivot"></div><div class="stone"></div>`;
    const tube = { unit, tubeEl: unit.querySelector('.tube'), waterEl: unit.querySelector('.water'), fill: 0, rate: 0, tipping: false };
    unit.addEventListener('pointerdown', (e) => { e.preventDefault(); tapTube(tube); });
    el.tubes.appendChild(unit);
    tubes.push(tube);
  }
}

// ---------- 状態 ----------
const state = {
  running: false, score: 0, combo: 0, lives: MAX_LIVES, elapsed: 0, lastTs: 0,
  best: store.get('kakoon.best', 0),
};

const policy = new AdPolicy();
const ads = new MockAdProvider({ fillRate: 0.9, overlay: showAdOverlay });

// 時間経過で水の勢いが増す
function baseRate() {
  return 0.16 + Math.min(state.elapsed, 120) * 0.0045; // 1秒あたりの満水率
}
function resetTube(t, initial = false) {
  t.fill = initial ? Math.random() * 0.35 : 0;
  t.rate = baseRate() * (0.7 + Math.random() * 0.6);
}

function tapTube(t) {
  if (!state.running || t.tipping) return;
  ensureAudio();
  const f = t.fill;
  const rect = t.unit.getBoundingClientRect();
  const garden = el.popups.getBoundingClientRect();
  const x = rect.left - garden.left + rect.width / 2;
  const y = rect.top - garden.top + rect.height * 0.15;

  if (f < GOOD_MIN) {
    // 早すぎ：鳴らない。コンボだけ切れる
    state.combo = 0;
    popup('はやい…', 'early', x, y);
    t.tubeEl.classList.remove('shake'); void t.tubeEl.offsetWidth; t.tubeEl.classList.add('shake');
    updateHud();
    return;
  }
  const perfect = f >= PERFECT_MIN && f <= PERFECT_MAX;
  if (perfect) {
    state.combo += 1;
    state.score += 100 + Math.min(state.combo - 1, 20) * 10;
    popup(state.combo > 1 ? `カコーン！ ×${state.combo}` : 'カコーン！', 'perfect', x, y);
  } else {
    state.combo = 0;
    state.score += 30;
    popup('コーン', 'good', x, y);
  }
  playKakoon(perfect ? 1 : 0.6);
  tip(t);
  updateHud();
}

function tip(t) {
  t.tipping = true;
  t.tubeEl.classList.add('tip');
  t.fill = 0;
  setTimeout(() => {
    t.tubeEl.classList.remove('tip');
    t.tipping = false;
    resetTube(t);
  }, TIP_MS);
}

function overflow(t) {
  const rect = t.unit.getBoundingClientRect();
  const garden = el.popups.getBoundingClientRect();
  popup('あふれた！', 'miss', rect.left - garden.left + rect.width / 2, rect.top - garden.top + rect.height * 0.15);
  playSplash();
  state.combo = 0;
  state.lives -= 1;
  if (navigator.vibrate) navigator.vibrate(120);
  tip(t);
  updateHud();
  if (state.lives <= 0) gameOver();
}

function popup(text, cls, x, y) {
  const p = document.createElement('div');
  p.className = `popup ${cls}`;
  p.textContent = text;
  p.style.left = `${x}px`;
  p.style.top = `${y}px`;
  el.popups.appendChild(p);
  // 画面端で切れないように位置を補正
  const half = p.offsetWidth / 2 + 8;
  p.style.left = `${Math.max(half, Math.min(el.popups.clientWidth - half, x))}px`;
  setTimeout(() => p.remove(), 900);
}

function render() {
  for (const t of tubes) {
    t.waterEl.style.height = `${Math.min(t.fill, 1) * 100}%`;
    t.waterEl.classList.toggle('warn', t.fill > PERFECT_MAX);
  }
}

function loop(ts) {
  if (!state.running) return;
  const dt = Math.min((ts - state.lastTs) / 1000, 0.05);
  state.lastTs = ts;
  state.elapsed += dt;
  for (const t of tubes) {
    if (t.tipping) continue;
    t.fill += t.rate * dt;
    if (t.fill >= 1) {
      overflow(t);
      if (!state.running) break;
    }
  }
  render();
  if (state.running) requestAnimationFrame(loop);
}

function updateHud() {
  el.score.textContent = state.score.toLocaleString();
  el.combo.textContent = state.combo;
  el.lives.textContent = '●'.repeat(Math.max(state.lives, 0)) + '○'.repeat(Math.max(MAX_LIVES - state.lives, 0));
  el.best.textContent = state.best.toLocaleString();
}

function showScreen(screen) {
  for (const s of [el.title, el.gameover]) s.classList.toggle('active', s === screen);
}

function run() {
  state.running = true;
  state.lastTs = performance.now();
  requestAnimationFrame(loop);
}

// ---------- ゲームの流れ ----------
function startGame() {
  ensureAudio();
  Object.assign(state, { score: 0, combo: 0, lives: MAX_LIVES, elapsed: 0 });
  tubes.forEach((t) => resetTube(t, true));
  policy.startPlay();
  updateHud();
  render();
  showScreen(null);
  run();
}

function gameOver() {
  state.running = false;
  policy.endPlay();
  const isBest = state.score > state.best;
  if (isBest) { state.best = state.score; store.set('kakoon.best', state.best); }
  el.finalScore.textContent = state.score.toLocaleString();
  el.newBest.hidden = !isBest;
  updateHud();
  refreshContinueButton();
  showScreen(el.gameover);
}

// 広告の読み込み状況に合わせてコンティニューボタンを更新
function refreshContinueButton() {
  const used = policy.continuesThisPlay >= policy.rules.maxContinuesPerPlay;
  const ok = policy.canContinue(ads.isLoaded('rewarded'));
  el.btnContinue.disabled = !ok;
  el.btnContinue.hidden = used;
  el.btnContinue.querySelector('.btn-sub').textContent = ok
    ? '広告視聴後、残機を1回回復して再開'
    : '広告を読み込み中…';
}
setInterval(() => { if (el.gameover.classList.contains('active')) refreshContinueButton(); }, 500);

async function onContinue() {
  if (!policy.canContinue(ads.isLoaded('rewarded'))) return;
  const rewarded = await ads.show('rewarded');
  if (!rewarded) { refreshContinueButton(); return; } // 途中で閉じたら報酬なし
  policy.recordContinue();
  state.lives = 1;
  state.combo = 0;
  tubes.forEach((t) => { t.tipping = false; t.tubeEl.classList.remove('tip'); resetTube(t); });
  policy.resumePlay();
  updateHud();
  render();
  showScreen(null);
  run();
}

async function onRetry() {
  // リザルト画面の区切りでのみインタースティシャル判定
  if (policy.onResultTransition(ads.isLoaded('interstitial'))) {
    const shown = await ads.show('interstitial');
    if (shown) policy.recordInterstitial();
  }
  startGame();
}

// ---------- 広告オーバーレイ（デモ） ----------
function showAdOverlay(kind) {
  return new Promise((resolve) => {
    const rewardedAd = kind === 'rewarded';
    let remain = rewardedAd ? 5 : 3;
    el.adKind.textContent = rewardedAd ? '動画広告（最後まで見るとコンティニュー）' : 'インタースティシャル広告';
    el.adCount.textContent = remain;
    el.btnAdClose.hidden = !rewardedAd; // 報酬型は途中で閉じられる（報酬なし）
    el.ad.classList.add('active');
    const finish = (ok) => {
      clearInterval(timer);
      el.btnAdClose.onclick = null;
      el.ad.classList.remove('active');
      resolve(ok);
    };
    const timer = setInterval(() => {
      remain -= 1;
      el.adCount.textContent = remain > 0 ? remain : '';
      if (remain <= 0) {
        if (rewardedAd) finish(true);
        else { el.btnAdClose.hidden = false; el.btnAdClose.onclick = () => finish(true); clearInterval(timer); }
      }
    }, 1000);
    if (rewardedAd) el.btnAdClose.onclick = () => finish(false);
  });
}

// タブを離れたら一時停止の代わりに経過時間を飛ばさない
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.running) state.lastTs = performance.now();
});

el.btnStart.addEventListener('click', startGame);
el.btnContinue.addEventListener('click', onContinue);
el.btnRetry.addEventListener('click', onRetry);

buildTubes();
updateHud();
render();
