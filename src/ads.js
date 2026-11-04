// 広告まわりのロジック（KAKOON! 企画書「インタースティシャル広告」準拠）
// UI から切り離した純粋なロジックなので Node のテストからも読み込めます。

export const DEFAULT_AD_RULES = {
  interstitialEveryNPlays: 3,      // 3プレイに1回程度
  minSecondsSinceLaunch: 60,       // アプリ起動直後には表示しない
  minSecondsBetweenAds: 60,        // 連続して広告を表示しない
  maxContinuesPerPlay: 1,          // コンティニューは1プレイにつき1回まで
};

/**
 * 広告を出すかどうかを決めるポリシー。
 * 時刻は引数で受け取る（テストしやすくするため）。
 */
export class AdPolicy {
  constructor(rules = {}, launchedAt = Date.now()) {
    this.rules = { ...DEFAULT_AD_RULES, ...rules };
    this.launchedAt = launchedAt;
    this.lastAdAt = null;          // 種類を問わず最後に広告を表示した時刻
    this.playsSinceInterstitial = 0;
    this.inPlay = false;
    this.continuesThisPlay = 0;
  }

  startPlay() {
    this.inPlay = true;
    this.continuesThisPlay = 0;
  }

  /** ゲームオーバー（リザルト画面）に入ったとき */
  endPlay() {
    this.inPlay = false;
  }

  /** コンティニューして再開したとき */
  resumePlay() {
    this.inPlay = true;
  }

  canContinue(rewardedLoaded) {
    return rewardedLoaded && this.continuesThisPlay < this.rules.maxContinuesPerPlay;
  }

  recordContinue(now = Date.now()) {
    this.continuesThisPlay += 1;
    this.lastAdAt = now;
  }

  /**
   * 1プレイが終わって次に進むとき（「もう一度遊ぶ」押下時）に呼ぶ。
   * プレイ回数を数えたうえで、インタースティシャルを出すべきか返す。
   */
  onResultTransition(interstitialLoaded, now = Date.now()) {
    this.playsSinceInterstitial += 1;
    return this.shouldShowInterstitial(interstitialLoaded, now);
  }

  shouldShowInterstitial(interstitialLoaded, now = Date.now()) {
    const r = this.rules;
    if (this.inPlay) return false;                                   // プレイ中は絶対に出さない
    if (!interstitialLoaded) return false;                           // 未読み込みならスキップ
    if (this.playsSinceInterstitial < r.interstitialEveryNPlays) return false;
    if ((now - this.launchedAt) / 1000 < r.minSecondsSinceLaunch) return false;
    if (this.lastAdAt !== null && (now - this.lastAdAt) / 1000 < r.minSecondsBetweenAds) return false;
    return true;
  }

  recordInterstitial(now = Date.now()) {
    this.playsSinceInterstitial = 0;
    this.lastAdAt = now;
  }
}

/** 月間広告収益の試算（仮定に基づく計算例） */
export function estimateRevenue({ dau, adsPerUser, ecpm, days = 30 }) {
  const dailyImpressions = dau * adsPerUser;
  const daily = (dailyImpressions / 1000) * ecpm;
  return { dailyImpressions, daily, monthly: daily * days };
}

/**
 * デモ用の広告プロバイダ。本番では AdMob / AdSense 等の SDK に差し替える。
 * fillRate で「広告が読み込まれていない」状況も再現する。
 */
export class MockAdProvider {
  constructor({ fillRate = 0.9, overlay } = {}) {
    this.fillRate = fillRate;
    this.overlay = overlay;
    this.loaded = { rewarded: false, interstitial: false };
    this.preload('rewarded');
    this.preload('interstitial');
  }

  preload(kind) {
    this.loaded[kind] = false;
    setTimeout(() => {
      this.loaded[kind] = Math.random() < this.fillRate;
    }, 800);
  }

  isLoaded(kind) {
    return this.loaded[kind];
  }

  /** 広告を表示。完了したら resolve(true)。報酬型は途中で閉じると false。 */
  show(kind) {
    if (!this.loaded[kind] || !this.overlay) return Promise.resolve(false);
    this.loaded[kind] = false;
    return this.overlay(kind).finally(() => this.preload(kind));
  }
}
