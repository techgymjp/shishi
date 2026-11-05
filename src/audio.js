// サウンド（Web Audio で合成。外部音源ファイル不要）
// 本番では録音した「カコーン！」に差し替える想定（企画書「グラフィック素材」）。

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.noise = null;
  }

  /** ユーザー操作の中で呼ぶ（ブラウザの自動再生制限のため） */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 1 : 0;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(2);
      this.startWater();
      if (this.weather) this.setWeather(this.weather);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * 筧から竹筒へ落ちる水音。
   * 水音の正体は細かな泡がはじける音なので、短く音程が上がる正弦波（泡）を
   * ランダムに重ねて合成する。竹筒に水が溜まるほど共鳴が高くなる。
   */
  startWater() {
    this.waterFill = 0;      // 0〜1：竹筒の水量
    this.waterTarget = 'tube'; // 'tube'（竹筒に落ちる）| 'stone'（竹筒の背や鉢に落ちる）
    // ごく弱い流れのざわめき（低めのノイズ）
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.value = 0.012;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    // 泡の音を少し先まで予約していく
    this.nextBubble = this.ctx.currentTime + 0.1;
    this.bubbleTimer = setInterval(() => this.scheduleBubbles(), 60);
  }

  /** 天候の環境音（雨・風）。ギミックに合わせてゆっくり音量を変える */
  setWeather({ rain = false, wind = false } = {}) {
    this.weather = { rain, wind };
    if (!this.ctx) return;
    if (!this.rainGain) {
      // 雨：高めの帯域のノイズ＋ときどき葉に当たるパラパラ音
      const r = this.ctx.createBufferSource();
      r.buffer = this.noise; r.loop = true;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      this.rainGain = this.ctx.createGain(); this.rainGain.gain.value = 0;
      r.connect(hp).connect(lp).connect(this.rainGain).connect(this.master);
      r.start();
      // 風：低いノイズ。フィルターをゆっくり動かして「ヒュー」とうねらせる
      const w = this.ctx.createBufferSource();
      w.buffer = this.noise; w.loop = true; w.playbackRate.value = 0.5;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 1.6;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(bp.frequency);
      this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
      w.connect(bp).connect(this.windGain).connect(this.master);
      w.start(); lfo.start();
    }
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain ? 0.05 : 0, t, 1.2);
    this.windGain.gain.setTargetAtTime(wind ? 0.07 : 0, t, 1.2);
  }

  setWater(fill, target) {
    this.waterFill = fill;
    this.waterTarget = target;
  }

  bubble(t, freq, dur, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * (1.6 + Math.random() * 0.8), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  scheduleBubbles() {
    if (!this.ready || !this.enabled) { this.nextBubble = this.ctx ? this.ctx.currentTime + 0.1 : 0; return; }
    const horizon = this.ctx.currentTime + 0.15;
    if (this.nextBubble < this.ctx.currentTime) this.nextBubble = this.ctx.currentTime + 0.01;
    const inTube = this.waterTarget === 'tube';
    // 竹筒の中：水が溜まるほど音程が上がる（ボトルに水を注ぐのと同じ）
    const base = inTube ? 380 + this.waterFill * 520 : 900;
    if (this.weather?.rain) {
      for (let k = 0; k < 6; k++) {
        const t = this.ctx.currentTime + Math.random() * 0.15;
        this.bubble(t, 1500 + Math.random() * 2500, 0.008 + Math.random() * 0.012, 0.008 + Math.random() * 0.01);
      }
    }
    while (this.nextBubble < horizon) {
      const t = this.nextBubble;
      const f = base * (0.75 + Math.random() * 0.6);
      const dur = inTube ? 0.03 + Math.random() * 0.05 : 0.015 + Math.random() * 0.025;
      const vol = (inTube ? 0.035 : 0.02) * (0.4 + Math.random() * 0.8);
      this.bubble(t, f, dur, vol);
      this.nextBubble += 0.018 + Math.random() * 0.05;
    }
  }

  tone(freq, dur, vol, type = 'sine', when = 0, drop = 0.96) {
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * drop, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(freq, q, dur, vol, type = 'bandpass') {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** 竹筒が石を打つ「カッ」＋中空の竹が響く「コーン」 */
  kakoon(strength = 1) {
    if (!this.ready) return;
    const s = Math.min(Math.max(strength, 0.3), 1.2);
    this.burst(2600, 1.5, 0.03, 0.9 * s);
    this.tone(690, 0.85, 0.42 * s, 'sine', 0, 0.97);
    this.tone(1720, 0.28, 0.20 * s, 'triangle', 0, 0.95);
    this.tone(2650, 0.12, 0.10 * s, 'sine');
    this.tone(345, 0.5, 0.12 * s, 'sine', 0.005, 0.98);
  }

  /** 竹筒から水がこぼれる「ザバッ」 */
  pour() {
    if (!this.ready) return;
    this.burst(800, 0.7, 0.5, 0.18, 'lowpass');
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 26; i++) {
      const t = t0 + Math.random() * 0.45;
      this.bubble(t, 250 + Math.random() * 500, 0.04 + Math.random() * 0.06, 0.03 + Math.random() * 0.04);
    }
  }

  splash(size = 1) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime;
    const n = Math.round(6 + size * 8);
    for (let i = 0; i < n; i++) {
      this.bubble(t0 + Math.random() * 0.2, 500 + Math.random() * 900, 0.02 + Math.random() * 0.04, 0.025 * size);
    }
  }

  judge(result) {
    if (!this.ready) return;
    if (result === 'PERFECT') {
      this.tone(1568, 0.35, 0.10, 'sine');
      this.tone(2093, 0.45, 0.08, 'sine', 0.06);
    } else if (result === 'GREAT') {
      this.tone(1319, 0.3, 0.08, 'sine');
    } else if (result === 'GOOD') {
      this.tone(988, 0.2, 0.06, 'sine');
    } else {
      this.tone(160, 0.3, 0.18, 'triangle', 0, 0.8);
    }
  }
}
