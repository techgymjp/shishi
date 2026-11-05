// 大正琴風のゆっくりした BGM（すべてプログラムで合成。音源ファイル不要）
//
// - 音色：弦の振動を再現する Karplus-Strong 法。金属弦らしい明るい響きにするため減衰を小さくし、
//   わずかにずらした2本の弦を重ねる（大正琴は同じ音に複数の弦を張っている）。
// - 旋律：陽音階（レ・ミ・ソ・ラ・シ）で、その場で少しずつ作るオリジナルの旋律。
//   長い音は大正琴らしいトレモロ（細かく弾き続ける奏法）で伸ばす。
// - 低音で静かに支え、短い残響で庭の空気感を出す。

const SCALE = [-12, -10, -7, -5, -3, 0, 2, 5, 7, 9, 12, 14]; // 陽音階（D を 0 とした半音）
const BASE_FREQ = 293.66;   // D4
const BEAT = 0.95;          // 1拍の長さ（秒）：ゆっくり

const freqOf = (semi) => BASE_FREQ * 2 ** (semi / 12);

export class TaishoKotoBGM {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.cache = new Map();
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    // 金属弦の「シャリッ」とした張りを少し強調
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
    const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 2600; peak.Q.value = 1.2; peak.gain.value = 4;
    this.input = hp;
    hp.connect(peak);
    // 残響
    const rev = ctx.createConvolver();
    rev.buffer = this.makeImpulse(2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    const dry = ctx.createGain(); dry.gain.value = 0.85;
    peak.connect(dry).connect(this.out);
    peak.connect(rev).connect(wet).connect(this.out);
    this.out.connect(destination);
    this.playing = false;
    this.timer = null;
    this.queue = [];
  }

  makeImpulse(seconds) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return buf;
  }

  /** Karplus-Strong で弦をはじいた音を作る（音程ごとにキャッシュ） */
  pluck(freq) {
    const key = freq.toFixed(2);
    if (this.cache.has(key)) return this.cache.get(key);
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 2.8);
    const buf = this.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const voice = (f, gain, decay) => {
      const n = Math.max(2, Math.round(sr / f));
      const line = new Float32Array(n);
      // 爪（ピック）ではじく：明るめのノイズ
      let prev = 0;
      for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; line[i] = r * 0.7 + prev * 0.3; prev = r; }
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const a = line[idx];
        const b = line[(idx + 1) % n];
        const v = decay * (0.5 * a + 0.5 * b);
        line[idx] = v;
        out[i] += a * gain;
        idx = (idx + 1) % n;
      }
    };
    voice(freq, 0.5, 0.9965);
    voice(freq * 1.0035, 0.42, 0.996);      // わずかにずらした2本目の弦
    // 立ち上がりのクリックを和らげる
    for (let i = 0; i < 64; i++) out[i] *= i / 64;
    this.cache.set(key, buf);
    return buf;
  }

  note(time, semi, vol, len = 2.8) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.pluck(freqOf(semi));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.setTargetAtTime(0, time + len, 0.15);
    src.connect(g).connect(this.input);
    src.start(time);
    src.stop(time + len + 0.8);
  }

  /** 長い音：大正琴のトレモロ（細かく弾き続ける） */
  tremolo(time, semi, dur, vol) {
    const step = 0.085;
    const n = Math.max(1, Math.floor(dur / step));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const env = Math.sin(Math.PI * Math.min(1, k * 1.15)) * (0.75 + 0.25 * Math.random());
      this.note(time + i * step + Math.random() * 0.01, semi, vol * (0.35 + 0.65 * env) * 0.6, step * 2.5);
    }
  }

  // ---------- 旋律づくり ----------
  phrase(startTime) {
    const ev = [];
    const rhythms = [[1, 1, 2], [2, 1, 1], [1, 1, 1, 1], [3, 1], [2, 2], [1.5, 0.5, 2]];
    let t = startTime;
    let deg = this.deg ?? 5;
    const bars = 4;
    for (let bar = 0; bar < bars; bar++) {
      // 低音（小節の頭にそっと）
      const bass = [-12, -5, -7, -12][bar];
      ev.push({ t, kind: 'bass', semi: bass });
      const last = bar === bars - 1;
      const r = last ? (Math.random() < 0.5 ? [1, 3] : [2, 2]) : rhythms[Math.floor(Math.random() * rhythms.length)];
      r.forEach((beats, i) => {
        const finalNote = last && i === r.length - 1;
        if (finalNote) {
          // 句の終わりはレ（主音）かラに落ち着く
          deg = Math.random() < 0.6 ? (deg > 7 ? 10 : 5) : 8;
        } else {
          const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
          deg = Math.min(10, Math.max(4, deg + step));
        }
        const dur = beats * BEAT;
        // 3拍以上の長い音と句の終わりは、大正琴らしいトレモロで伸ばす
        ev.push({ t, kind: dur >= 2.8 || finalNote ? 'trem' : 'note', semi: SCALE[deg], dur });
        t += dur;
      });
    }
    this.deg = deg;
    // 句と句の間に少し間をとる
    return { ev, end: t + (Math.random() < 0.6 ? BEAT * 2 : BEAT) };
  }

  schedule() {
    const now = this.ctx.currentTime;
    while (this.nextPhrase < now + 1.5) {
      const { ev, end } = this.phrase(this.nextPhrase);
      for (const e of ev) {
        if (e.kind === 'bass') this.note(e.t, e.semi, 0.22, 3);
        else if (e.kind === 'trem') this.tremolo(e.t, e.semi, e.dur, 0.5);
        else this.note(e.t, e.semi, 0.5, Math.max(e.dur, 1.2));
      }
      this.nextPhrase = end;
    }
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.nextPhrase = this.ctx.currentTime + 0.6;
    this.out.gain.setTargetAtTime(0.32, this.ctx.currentTime, 1.5);
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 400);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }
}
