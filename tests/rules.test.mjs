import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  judge, comboMultiplier, pointsFor, levelFor, tierFor, cycleParams,
  currentTitle, unlockedTitles, emptyStats, commitPlay,
} from '../src/rules.js';
import { ShishiOdoshi, ANGLE_REST, ANGLE_POUR } from '../src/shishi.js';

test('判定幅: PERFECT 0.05 / GREAT 0.11 / GOOD 0.20 / それ以外 MISS', () => {
  assert.equal(judge(0), 'PERFECT');
  assert.equal(judge(-0.05), 'PERFECT');
  assert.equal(judge(0.08), 'GREAT');
  assert.equal(judge(-0.11), 'GREAT');
  assert.equal(judge(0.15), 'GOOD');
  assert.equal(judge(-0.2), 'GOOD');
  assert.equal(judge(-0.21), 'MISS');
  assert.equal(judge(1), 'MISS');
});

test('コンボ倍率と獲得点', () => {
  assert.deepEqual([1, 4, 5, 9, 10, 19, 20, 29, 30, 99].map(comboMultiplier),
    [1, 1, 1.2, 1.2, 1.5, 1.5, 2, 2, 3, 3]);
  assert.equal(pointsFor('PERFECT', 1), 100);
  assert.equal(pointsFor('PERFECT', 10), 150);
  assert.equal(pointsFor('GREAT', 5), 84);
  assert.equal(pointsFor('GOOD', 30), 120);
  assert.equal(pointsFor('MISS', 30), 0);
});

test('10回成功ごとにレベルアップ', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(9), 1);
  assert.equal(levelFor(10), 2);
  assert.equal(tierFor(1), 'チュートリアル');
  assert.equal(tierFor(6), '初級');
  assert.equal(tierFor(51), '超上級');
});

test('レベルが上がると水の流入・戻りが速くなる', () => {
  const a = cycleParams(1, 0, () => 0.5);
  const b = cycleParams(20, 0, () => 0.5);
  assert.ok(b.fillDuration < a.fillDuration);
  assert.ok(b.returnDuration < a.returnDuration);
  assert.ok(cycleParams(1, 20, () => 0.5).fillDuration < a.fillDuration); // 連続成功で速く
  const hi = [0, 1].map((r) => cycleParams(60, 0, () => r).fillDuration);
  assert.ok(hi[0] < hi[1]); // 51以上はランダム変化
});

test('称号', () => {
  const s = emptyStats();
  assert.equal(currentTitle(s), null);
  assert.equal(currentTitle({ ...s, plays: 1 }).name, '新米庭師');
  assert.equal(currentTitle({ ...s, plays: 3, totalScore: 1200 }).name, '鹿威し職人');
  assert.equal(unlockedTitles({ ...s, plays: 1, best: 5000, totalScore: 5000, perfectTotal: 60 }).length, 5);
});

test('記録: コンティニュー後の再ゲームオーバーで二重計上しない', () => {
  let { stats, committed } = commitPlay(emptyStats(), { score: 300, perfects: 2, maxCombo: 3, maxPerfectStreak: 2 });
  ({ stats, committed } = commitPlay(stats, { score: 800, perfects: 6, maxCombo: 7, maxPerfectStreak: 4 }, committed));
  assert.deepEqual(stats, { plays: 1, totalScore: 800, best: 800, perfectTotal: 6, maxCombo: 7, bestPerfectStreak: 4 });
  ({ stats } = commitPlay(stats, { score: 100, perfects: 1, maxCombo: 1, maxPerfectStreak: 1 }));
  assert.equal(stats.plays, 2);
  assert.equal(stats.totalScore, 900);
  assert.equal(stats.best, 800);
});

test('鹿威し: 水が溜まる → 傾く → 戻って石に当たる', () => {
  const s = new ShishiOdoshi({ fillDuration: 2, pourDuration: 0.4, returnDuration: 0.8 });
  assert.equal(s.impactTime, 3.2);
  assert.equal(s.angle, ANGLE_REST);
  let events = s.update(2.05);
  assert.deepEqual(events, ['pour']);
  assert.ok(Math.abs(s.impactTime - 3.2) < 1e-9);
  s.update(0.36);
  assert.equal(s.phase, 'return');
  assert.ok(Math.abs(s.angle - ANGLE_POUR) < 0.02);
  s.setParams({ fillDuration: 1, pourDuration: 0.3, returnDuration: 0.5 });
  events = s.update(0.8);
  assert.deepEqual(events, ['impact']);
  assert.equal(s.cycle, 1);
  assert.equal(s.params.fillDuration, 1); // 次のサイクルから新しい難易度
});

test('追加ギミック：レベルごとに登場し、7以降は組み合わせ', async () => {
  const { gimmicksForLevel, gimmicksForPractice } = await import('../src/rules.js');
  assert.equal(gimmicksForLevel(1).rain, false);
  assert.equal(gimmicksForLevel(2).rain, true);
  assert.equal(gimmicksForLevel(3).wind, true);
  assert.equal(gimmicksForLevel(4).night, true);
  assert.notEqual(gimmicksForLevel(5).size, 1);
  assert.equal(gimmicksForLevel(6).twin, true);
  const g = gimmicksForLevel(8, () => 0.3);
  const on = ['rain', 'wind', 'night', 'twin'].filter((k) => g[k]).length + (g.size !== 1 ? 1 : 0);
  assert.equal(on, 2);
  assert.equal(gimmicksForPractice('night', 1).night, true);
  assert.equal(gimmicksForPractice('none', 9).twin, false);
});

test('ギミックが鹿威しの動きに効く', () => {
  const base = cycleParams(1, 0, () => 0.5);
  const rain = cycleParams(1, 0, () => 0.5, { rain: true, size: 1 });
  assert.ok(rain.fillDuration < base.fillDuration);           // 雨：流入が速い
  const big = cycleParams(1, 0, () => 0.5, { size: 1.3 });
  assert.ok(big.fillDuration > base.fillDuration);            // 太い竹筒：溜まるのに時間がかかる
  const w = [0, 1].map((r) => cycleParams(1, 0, () => r, { wind: true, size: 1 }).returnDuration);
  assert.ok(w[0] < w[1]);                                      // 風：戻る速さが変わる
});
