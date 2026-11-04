import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdPolicy, estimateRevenue } from '../src/ads.js';

const T0 = 1_000_000;
const sec = (s) => T0 + s * 1000;

function finishPlays(policy, n, loaded, now) {
  let shown = false;
  for (let i = 0; i < n; i++) {
    policy.startPlay();
    policy.endPlay();
    shown = policy.onResultTransition(loaded, now);
  }
  return shown;
}

test('3プレイに1回だけインタースティシャルを出す', () => {
  const p = new AdPolicy({}, T0);
  assert.equal(finishPlays(p, 2, true, sec(300)), false);
  assert.equal(finishPlays(p, 1, true, sec(300)), true);
  p.recordInterstitial(sec(300));
  assert.equal(finishPlays(p, 2, true, sec(500)), false);
  assert.equal(finishPlays(p, 1, true, sec(500)), true);
});

test('プレイ中は絶対に出さない', () => {
  const p = new AdPolicy({}, T0);
  p.playsSinceInterstitial = 10;
  p.startPlay();
  assert.equal(p.shouldShowInterstitial(true, sec(300)), false);
});

test('起動直後は出さない', () => {
  const p = new AdPolicy({}, T0);
  assert.equal(finishPlays(p, 3, true, sec(30)), false);
});

test('読み込まれていなければスキップ', () => {
  const p = new AdPolicy({}, T0);
  assert.equal(finishPlays(p, 3, false, sec(300)), false);
});

test('動画コンティニュー直後は連続して出さない', () => {
  const p = new AdPolicy({}, T0);
  finishPlays(p, 2, true, sec(300));
  p.startPlay();
  p.endPlay();
  p.recordContinue(sec(290));
  p.resumePlay();
  p.endPlay();
  assert.equal(p.onResultTransition(true, sec(300)), false);
});

test('コンティニューは1プレイにつき1回まで', () => {
  const p = new AdPolicy({}, T0);
  p.startPlay();
  assert.equal(p.canContinue(true), true);
  p.recordContinue(sec(100));
  assert.equal(p.canContinue(true), false);
  p.startPlay();
  assert.equal(p.canContinue(true), true);
  assert.equal(p.canContinue(false), false);
});

test('収益試算: DAU1,000・1人2回・eCPM200円 → 日400円 / 月12,000円', () => {
  const r = estimateRevenue({ dau: 1000, adsPerUser: 2, ecpm: 200 });
  assert.equal(r.dailyImpressions, 2000);
  assert.equal(r.daily, 400);
  assert.equal(r.monthly, 12000);
});
