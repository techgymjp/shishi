// 日本庭園と鹿威しの描画（Canvas 2D）
// 論理座標は横幅 360 固定。縦は画面比率に合わせて伸縮する。

const W = 360;
const TUBE_BACK = -118;   // 竹筒の後端（石に当たる側）
const TUBE_FRONT = 122;   // 竹筒の口（水を受ける側）
const TUBE_R = 13;
const GRAVITY = 700;

// 再現性のある乱数（背景を毎回同じに描く）
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.particles = [];
    this.rings = [];
    this.ripples = [];
    this.flash = 0;
    this.dark = 0;
    this.time = 0;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.scale = this.canvas.width / W;
    this.H = this.canvas.height / this.scale;
    const py = Math.min(Math.max(this.H * 0.5, 250), this.H - 210);
    this.P = { x: 172, y: py };
    this.groundY = py + 108;
    this.stone = { x: this.P.x - 106, y: this.P.y + 74, rx: 38, ry: 28 };
    this.pool = { x: this.P.x + 116, y: this.groundY - 2, rx: 64, ry: 14 };
    this.spout = { x: this.P.x + 120, y: this.P.y - 128 };
    this.bg = this.renderBackground();
  }

  // ---------- 座標 ----------
  local(angle, x, y = 0) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: this.P.x + x * c - y * s, y: this.P.y + x * s + y * c };
  }
  get impactPoint() { return { x: this.stone.x, y: this.stone.y - this.stone.ry + 4 }; }

  // ---------- 演出 ----------
  spawn(x, y, n, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = (opt.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (opt.spread ?? 1.6);
      const v = (opt.speed ?? 160) * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0, max: (opt.life ?? 0.7) * (0.6 + Math.random() * 0.6),
        r: (opt.size ?? 2.2) * (0.5 + Math.random()),
        color: opt.color ?? 'rgba(190,230,255,', gravity: opt.gravity ?? GRAVITY,
      });
    }
  }

  splash(size = 1) {
    const p = this.pool;
    this.spawn(p.x - 10, p.y - 4, Math.round(14 * size), { speed: 170 * size, spread: 1.4, size: 2.4 });
    this.ripples.push({ x: p.x - 10, y: p.y, r: 4, life: 0, max: 1.1 });
  }

  impact(strength = 1) {
    const ip = this.impactPoint;
    this.rings.push({ x: ip.x, y: ip.y, life: 0, max: 0.9, strength });
    this.spawn(ip.x + 6, ip.y - 2, 6, { speed: 90, spread: 2.4, size: 1.6, life: 0.5 });
  }

  judgeEffect(result) {
    const ip = this.impactPoint;
    if (result === 'PERFECT') {
      this.flash = 1;
      this.spawn(ip.x, ip.y - 10, 26, { speed: 230, spread: 6.2, size: 2.6, color: 'rgba(255,215,110,', gravity: 120, life: 0.9 });
      this.splash(1.6);
    } else if (result === 'GREAT') {
      this.spawn(ip.x, ip.y - 10, 12, { speed: 170, spread: 6.2, size: 2.2, color: 'rgba(200,240,200,', gravity: 160 });
      this.splash(1.1);
    } else if (result === 'GOOD') {
      this.splash(0.6);
    } else {
      this.dark = 0.55;
    }
  }

  update(dt) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.dark = Math.max(0, this.dark - dt * 1.4);
    for (const p of this.particles) {
      p.life += dt; p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const r of this.ripples) { r.life += dt; r.r += dt * 50; }
    this.ripples = this.ripples.filter((r) => r.life < r.max);
  }

  // ---------- 背景（一度だけ描いてキャッシュ） ----------
  renderBackground() {
    const off = document.createElement('canvas');
    off.width = this.canvas.width;
    off.height = this.canvas.height;
    const g = off.getContext('2d');
    g.scale(this.scale, this.scale);
    const H = this.H;
    const rnd = seeded(7);

    // 空気感（朝もや）
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#16231d');
    sky.addColorStop(0.45, '#2c4335');
    sky.addColorStop(0.75, '#3f5a40');
    sky.addColorStop(1, '#1a2a1f');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    const light = g.createRadialGradient(W * 0.75, H * 0.12, 10, W * 0.75, H * 0.12, H * 0.6);
    light.addColorStop(0, 'rgba(255,244,214,0.22)');
    light.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = light;
    g.fillRect(0, 0, W, H);

    // 竹林（奥から手前へ）
    for (let layer = 0; layer < 3; layer++) {
      const n = 9 - layer * 2;
      for (let i = 0; i < n; i++) {
        const x = rnd() * W;
        const w = 6 + layer * 4 + rnd() * 4;
        const shade = 60 + layer * 25 + rnd() * 20;
        g.fillStyle = `rgba(${shade * 0.55 | 0},${shade | 0},${shade * 0.55 | 0},${0.25 + layer * 0.18})`;
        g.fillRect(x, 0, w, this.groundY - 30 + layer * 10);
        g.fillStyle = `rgba(20,35,20,${0.25 + layer * 0.1})`;
        for (let y = 30 + rnd() * 60; y < this.groundY - 40; y += 70 + rnd() * 30) g.fillRect(x - 1, y, w + 2, 2.5);
        // 笹の葉
        g.fillStyle = `rgba(${70 + layer * 20},${120 + layer * 25},${60 + layer * 10},${0.18 + layer * 0.12})`;
        for (let k = 0; k < 5; k++) {
          const ly = rnd() * (this.groundY * 0.7);
          const dir = rnd() < 0.5 ? -1 : 1;
          g.beginPath();
          g.ellipse(x + w / 2 + dir * 16, ly, 18, 3.5, dir * 0.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // もや
    const mist = g.createLinearGradient(0, this.groundY - 160, 0, this.groundY);
    mist.addColorStop(0, 'rgba(200,215,200,0)');
    mist.addColorStop(1, 'rgba(200,215,200,0.16)');
    g.fillStyle = mist;
    g.fillRect(0, this.groundY - 160, W, 160);

    // 石灯籠（左奥）
    this.drawLantern(g, 44, this.groundY - 8);

    // 地面：苔
    const moss = g.createLinearGradient(0, this.groundY - 20, 0, H);
    moss.addColorStop(0, '#4d6b33');
    moss.addColorStop(0.25, '#3a5528');
    moss.addColorStop(1, '#1d2d16');
    g.fillStyle = moss;
    g.beginPath();
    g.moveTo(0, this.groundY - 6);
    g.quadraticCurveTo(W * 0.3, this.groundY - 26, W * 0.55, this.groundY - 6);
    g.quadraticCurveTo(W * 0.8, this.groundY + 8, W, this.groundY - 10);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath();
    g.fill();
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = this.groundY - 10 + rnd() * (H - this.groundY);
      g.fillStyle = `rgba(${90 + rnd() * 50 | 0},${130 + rnd() * 50 | 0},${50 + rnd() * 30 | 0},0.35)`;
      g.beginPath(); g.arc(x, y, 1 + rnd() * 2.5, 0, Math.PI * 2); g.fill();
    }

    // 白砂利と砂紋
    const gy = this.groundY + 44;
    g.fillStyle = '#c9c6b8';
    g.beginPath();
    g.moveTo(0, gy + 10);
    g.quadraticCurveTo(W / 2, gy - 12, W, gy + 6);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(120,115,100,0.35)';
    g.lineWidth = 1.2;
    for (let k = 1; k < 30; k++) {
      const y = gy + k * 9;
      if (y > H) break;
      g.beginPath();
      g.moveTo(0, y + 6);
      g.quadraticCurveTo(W / 2, y - 10, W, y + 4);
      g.stroke();
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`;
      g.fillRect(rnd() * W, gy + rnd() * (H - gy), 1, 1);
    }

    // 飛び石
    for (const [x, y, rx] of [[70, gy + 40, 26], [150, gy + 80, 30], [250, gy + 52, 24]]) {
      if (y > H) continue;
      this.drawRock(g, x, y, rx, rx * 0.4, '#8b8f86', '#4c524a');
    }

    // 手水鉢の池（竹筒からこぼれた水を受ける）
    const p = this.pool;
    this.drawRock(g, p.x, p.y + 4, p.rx + 10, p.ry + 9, '#7b8078', '#3b403a');
    const water = g.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.rx);
    water.addColorStop(0, '#5f8fa0');
    water.addColorStop(1, '#203a44');
    g.fillStyle = water;
    g.beginPath(); g.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2); g.fill();

    // 筧（かけい）：右から水を運ぶ竹
    const s = this.spout;
    const pipe = g.createLinearGradient(0, s.y - 8, 0, s.y + 8);
    pipe.addColorStop(0, '#c4d48a'); pipe.addColorStop(0.5, '#86a046'); pipe.addColorStop(1, '#4b6624');
    g.fillStyle = pipe;
    g.fillRect(s.x - 6, s.y - 7, W - s.x + 6, 14);
    g.fillStyle = '#2f4718';
    g.beginPath(); g.ellipse(s.x - 6, s.y, 3, 7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(40,60,20,0.8)';
    g.fillRect(s.x + 60, s.y - 8, 3, 16);
    // 筧の支柱
    g.fillStyle = '#5a4630';
    g.fillRect(W - 54, s.y + 6, 7, this.groundY - s.y);
    g.fillRect(W - 62, s.y + 4, 22, 5);

    return off;
  }

  drawRock(g, x, y, rx, ry, light, dark) {
    const grad = g.createRadialGradient(x - rx * 0.3, y - ry * 0.5, 2, x, y, rx * 1.1);
    grad.addColorStop(0, light);
    grad.addColorStop(1, dark);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }

  drawLantern(g, x, y) {
    g.save();
    g.fillStyle = 'rgba(95,100,92,0.75)';
    g.fillRect(x - 6, y - 70, 12, 70);           // 竿
    g.fillRect(x - 16, y - 78, 32, 8);           // 中台
    g.fillRect(x - 13, y - 104, 26, 26);         // 火袋
    g.fillStyle = 'rgba(255,214,140,0.55)';
    g.fillRect(x - 7, y - 98, 14, 14);           // 灯り
    g.fillStyle = 'rgba(95,100,92,0.8)';
    g.beginPath();                               // 笠
    g.moveTo(x - 26, y - 104); g.lineTo(x + 26, y - 104); g.lineTo(x + 8, y - 120); g.lineTo(x - 8, y - 120);
    g.closePath(); g.fill();
    g.beginPath(); g.arc(x, y - 124, 5, 0, Math.PI * 2); g.fill(); // 宝珠
    g.fillRect(x - 20, y - 4, 40, 6);
    g.restore();
  }

  // ---------- 毎フレームの描画 ----------
  draw(shishi, { glow = 0 } = {}) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    const angle = shishi.angle;
    const P = this.P;

    // 池の波紋
    g.lineWidth = 1.2;
    for (const r of this.ripples) {
      g.strokeStyle = `rgba(210,235,245,${0.5 * (1 - r.life / r.max)})`;
      g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * 0.22, 0, 0, Math.PI * 2); g.stroke();
    }

    // 石（竹筒が当たる）
    const st = this.stone;
    this.drawRock(g, st.x, st.y, st.rx, st.ry, '#a3a99f', '#474d45');
    g.fillStyle = 'rgba(90,130,60,0.6)';
    g.beginPath(); g.ellipse(st.x + 8, st.y + st.ry - 6, st.rx * 0.8, 6, 0, 0, Math.PI * 2); g.fill();

    // タップのタイミングが近づくと控えめに光る
    if (glow > 0) {
      const ip = this.impactPoint;
      const rg = g.createRadialGradient(ip.x, ip.y, 2, ip.x, ip.y, 70);
      rg.addColorStop(0, `rgba(255,226,140,${0.55 * glow})`);
      rg.addColorStop(1, 'rgba(255,226,140,0)');
      g.fillStyle = rg;
      g.fillRect(ip.x - 80, ip.y - 80, 160, 160);
    }

    // 奥の支柱
    this.drawPost(g, P.x + 24, this.groundY, P.x - 14, P.y - 16, '#4a3a28');

    // 筧からの水流
    const s = this.spout;
    const mouth = this.local(angle, TUBE_FRONT - 8, -TUBE_R);
    const underSpout = Math.abs(mouth.x - (s.x - 4)) < 22 && mouth.y > s.y;
    const streamEnd = underSpout ? mouth.y : this.pool.y;
    this.drawStream(g, s.x - 6, s.y + 4, s.x - 4 + Math.sin(this.time * 9) * 0.6, streamEnd, 2.4, 0.75);
    if (Math.random() < 0.3) this.spawn(s.x - 4, streamEnd, 1, { speed: 60, size: 1.3, life: 0.35 });

    // こぼれる水
    if (shishi.phase === 'pour') {
      const lip = this.local(angle, TUBE_FRONT - 2, 4);
      const a = shishi.fill;
      this.drawStream(g, lip.x, lip.y, this.pool.x - 10, this.pool.y, 3 + a * 5, 0.45 + a * 0.4);
      if (Math.random() < 0.6) {
        this.spawn(this.pool.x - 10, this.pool.y - 2, 2, { speed: 110, spread: 1.6, size: 2 });
        if (Math.random() < 0.15) this.ripples.push({ x: this.pool.x - 10, y: this.pool.y, r: 3, life: 0, max: 1 });
      }
    }

    // 竹筒
    this.drawTube(g, angle, shishi.fill);

    // 手前の支柱と支点
    this.drawPost(g, P.x - 24, this.groundY, P.x + 14, P.y - 16, '#5e4a33');
    g.fillStyle = '#2e2418';
    g.beginPath(); g.arc(P.x, P.y, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a7556';
    g.beginPath(); g.arc(P.x - 1, P.y - 1, 2, 0, Math.PI * 2); g.fill();

    // 音の波紋（カコーン！）
    for (const r of this.rings) {
      const k = r.life / r.max;
      g.strokeStyle = `rgba(255,250,230,${(1 - k) * 0.6 * r.strength})`;
      g.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const rad = 10 + k * (60 + i * 30);
        g.beginPath(); g.arc(r.x, r.y, rad, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      }
    }

    // 水しぶき・光の粒
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      g.fillStyle = `${p.color}${(0.85 * a).toFixed(3)})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }

    // 画面効果
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,250,235,${this.flash * 0.45})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.dark > 0) {
      g.fillStyle = `rgba(0,0,0,${this.dark * 0.6})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  drawPost(g, x1, y1, x2, y2, color) {
    g.strokeStyle = color;
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x1 - 2, y1); g.lineTo(x2 - 2, y2); g.stroke();
  }

  drawStream(g, x1, y1, x2, y2, width, alpha) {
    if (y2 <= y1) return;
    const grad = g.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, `rgba(200,235,255,${alpha})`);
    grad.addColorStop(1, `rgba(160,210,240,${alpha * 0.6})`);
    g.strokeStyle = grad;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x1, y1);
    g.quadraticCurveTo(x1 + (x2 - x1) * 0.15, y1 + (y2 - y1) * 0.5, x2, y2);
    g.stroke();
  }

  drawTube(g, angle, fill) {
    g.save();
    g.translate(this.P.x, this.P.y);
    g.rotate(angle);
    const r = TUBE_R;
    // 影
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.moveTo(TUBE_BACK, -r + 4); g.lineTo(TUBE_FRONT, -r + 4); g.lineTo(TUBE_FRONT - 26, r + 4); g.lineTo(TUBE_BACK, r + 4);
    g.closePath(); g.fill();
    // 竹の胴
    const body = g.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, '#dbe8a2');
    body.addColorStop(0.25, '#a9c25e');
    body.addColorStop(0.7, '#6f8f34');
    body.addColorStop(1, '#3f5a1c');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(TUBE_BACK + 4, -r);
    g.lineTo(TUBE_FRONT, -r);          // 斜めに切った口
    g.lineTo(TUBE_FRONT - 26, r);
    g.lineTo(TUBE_BACK + 4, r);
    g.quadraticCurveTo(TUBE_BACK - 3, 0, TUBE_BACK + 4, -r);
    g.closePath();
    g.fill();
    // 口の中（水が見える）
    g.fillStyle = '#26361a';
    g.beginPath();
    g.moveTo(TUBE_FRONT - 3, -r + 2);
    g.lineTo(TUBE_FRONT - 24, r - 2);
    g.lineTo(TUBE_FRONT - 31, r - 2);
    g.lineTo(TUBE_FRONT - 10, -r + 2);
    g.closePath(); g.fill();
    if (fill > 0.05) {
      g.fillStyle = `rgba(120,190,230,${0.35 + fill * 0.5})`;
      g.beginPath();
      g.moveTo(TUBE_FRONT - 5 - (1 - fill) * 18, -r + 2 + (1 - fill) * (2 * r - 4));
      g.lineTo(TUBE_FRONT - 24, r - 2);
      g.lineTo(TUBE_FRONT - 30, r - 2);
      g.closePath(); g.fill();
    }
    // 節
    for (const x of [-62, 22]) {
      g.fillStyle = '#4e6a22';
      g.fillRect(x, -r - 1, 4, 2 * r + 2);
      g.fillStyle = 'rgba(240,250,210,0.5)';
      g.fillRect(x + 4, -r, 1.5, 2 * r);
    }
    // ハイライト
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(TUBE_BACK + 8, -r + 3, TUBE_FRONT - TUBE_BACK - 30, 3);
    g.restore();
  }
}
