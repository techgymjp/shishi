// 鹿威しの動き（企画書「鹿威しの物理演算」）
// 判定と見た目を分離するため、衝突予定時刻をここで一元管理する。
//
//  fill   : 水が溜まる。後半は水の重みで、口側（右）がゆっくり下がっていく
//  pour   : 口側がゆっくり沈みきり、水がこぼれる
//  return : 水が抜けて口側が急に軽くなり、石側（左）が重力で一気に落ちて石を打つ → カコーン！

export const ANGLE_REST = -0.30; // 竹筒の後端が石に乗っている角度（rad）
export const ANGLE_POUR = 0.55;  // 水をこぼす角度
const FILL_LIFT = 0.24;          // 満水までに水の重みで傾く角度
const FILL_LIFT_FROM = 0.45;     // 水量がこの割合を超えると傾き始める
const BOUNCE_TIME = 0.16;

export class ShishiOdoshi {
  constructor(params) {
    this.params = { ...params };
    this.reset();
  }

  reset() {
    this.phase = 'fill';
    this.t = 0;          // 現在フェーズの経過時間
    this.time = 0;       // ゲーム内時刻（秒）
    this.cycle = 0;
    this.sinceImpact = Infinity;
  }

  /** 次のサイクルから使うパラメーター（判定中のサイクルは変えない） */
  setParams(params) {
    this.nextParams = { ...params };
  }

  get fill() {
    const p = this.params;
    if (this.phase === 'fill') return Math.min(this.t / p.fillDuration, 1);
    if (this.phase === 'pour') return Math.max(1 - this.t / p.pourDuration, 0);
    return 0;
  }

  /** このサイクルで石に当たる予定のゲーム内時刻 */
  get impactTime() {
    const p = this.params;
    if (this.phase === 'fill') return this.time + (p.fillDuration - this.t) + p.pourDuration + p.returnDuration;
    if (this.phase === 'pour') return this.time + (p.pourDuration - this.t) + p.returnDuration;
    return this.time + (p.returnDuration - this.t);
  }

  get angle() {
    const p = this.params;
    if (this.phase === 'fill') {
      const f = this.t / p.fillDuration;
      const k = f > FILL_LIFT_FROM ? (f - FILL_LIFT_FROM) / (1 - FILL_LIFT_FROM) : 0;
      const lift = k * k * FILL_LIFT; // 水が増えるほど、ゆっくり下がる
      const bounce = this.t < BOUNCE_TIME ? Math.sin((Math.PI * this.t) / BOUNCE_TIME) * 0.05 : 0;
      return ANGLE_REST + lift + bounce;
    }
    if (this.phase === 'pour') {
      // こぼれる間もゆっくり沈む（なめらかに加速・減速）
      const k = Math.min(this.t / p.pourDuration, 1);
      const ease = k * k * (3 - 2 * k);
      const from = ANGLE_REST + FILL_LIFT;
      return from + (ANGLE_POUR - from) * ease;
    }
    const k = Math.min(this.t / p.returnDuration, 1);
    return ANGLE_POUR + (ANGLE_REST - ANGLE_POUR) * k * k; // 軽くなって重力で一気に落ちる
  }

  /** 時間を進め、発生したイベント（'pour' | 'impact'）を返す */
  update(dt) {
    const events = [];
    this.time += dt;
    this.t += dt;
    this.sinceImpact += dt;
    // 大きな dt でもフェーズを取りこぼさない
    for (let guard = 0; guard < 4; guard++) {
      const p = this.params;
      if (this.phase === 'fill' && this.t >= p.fillDuration) {
        this.t -= p.fillDuration;
        this.phase = 'pour';
        events.push('pour');
      } else if (this.phase === 'pour' && this.t >= p.pourDuration) {
        this.t -= p.pourDuration;
        this.phase = 'return';
      } else if (this.phase === 'return' && this.t >= p.returnDuration) {
        this.t -= p.returnDuration;
        this.phase = 'fill';
        this.cycle += 1;
        this.sinceImpact = this.t;
        if (this.nextParams) { this.params = this.nextParams; this.nextParams = null; }
        events.push('impact');
      } else break;
    }
    return events;
  }
}
