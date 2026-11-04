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

  /** 筧（かけい）から流れ続ける水音 */
  startWater() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 3.1; lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(bp).connect(g).connect(this.master);
    src.start(); lfo.start();
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

  pour() {
    if (!this.ready) return;
    this.burst(900, 0.6, 0.55, 0.22, 'lowpass');
  }

  splash(size = 1) {
    if (!this.ready) return;
    this.burst(1800, 0.8, 0.25 + size * 0.15, 0.25 * size);
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
