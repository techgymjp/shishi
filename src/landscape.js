// 池の向こうの茶室と、遠景（竹林・紅葉）
// 素材はすべてプログラムで生成する（外部ファイル不要）。単位はメートル。

import * as THREE from 'three';

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(w, h, draw, { srgb = true, repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

// ---------- 質感 ----------
/** 土壁（藁すさ入り） */
function earthWallTex(seed = 1) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = seeded(seed);
    g.fillStyle = '#a88a63'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 120 + r() * 70;
      g.fillStyle = `rgba(${v + 20 | 0},${v | 0},${v * 0.72 | 0},${0.15 + r() * 0.25})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    // 藁すさ（細かい藁の筋）
    for (let i = 0; i < 700; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI, l = 4 + r() * 10;
      g.strokeStyle = `rgba(${200 + r() * 40 | 0},${170 + r() * 30 | 0},${110 + r() * 30 | 0},${0.35 + r() * 0.3})`;
      g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
}

/** 茅葺き（かやぶき）屋根 */
function thatchTex(seed = 2) {
  return canvasTex(256, 512, (g, w, h) => {
    const r = seeded(seed);
    g.fillStyle = '#5d4a33'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4200; i++) {
      const x = r() * w, y = r() * h, l = 10 + r() * 30;
      const v = 70 + r() * 80;
      g.strokeStyle = `rgba(${v + 25 | 0},${v + 5 | 0},${v * 0.6 | 0},${0.35 + r() * 0.4})`;
      g.lineWidth = 0.6 + r() * 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + l); g.stroke();
    }
    // 段々に葺いた刈り込みの線
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = 'rgba(30,22,14,0.35)'; g.fillRect(0, y, w, 3);
    }
  }, { repeat: [3, 1.5] });
}

/** 木（柱・板） */
function woodTex(seed = 3, base = '#6b4b30') {
  return canvasTex(128, 512, (g, w, h) => {
    const r = seeded(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = r() * w;
      g.fillStyle = r() < 0.5 ? `rgba(30,18,8,${0.08 + r() * 0.15})` : `rgba(200,160,110,${0.05 + r() * 0.08})`;
      g.fillRect(x, 0, 0.6 + r() * 2, h);
    }
  });
}

/** 障子（和紙と組子） */
function shojiTex(cols, rows) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#efe9da'; g.fillRect(0, 0, w, h);
    const r = seeded(9);
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(200,190,170,${r() * 0.15})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = '#6a5136';
    const t = 5;
    for (let c = 0; c <= cols; c++) g.fillRect((c / cols) * (w - t), 0, t, h);
    for (let rr = 0; rr <= rows; rr++) g.fillRect(0, (rr / rows) * (h - t), w, t);
  });
}

/** 竹林の稈（節つき） */
function culmTex() {
  return canvasTex(64, 512, (g, w, h) => {
    const r = seeded(12);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#5f7d2e'); grad.addColorStop(0.5, '#8aa646'); grad.addColorStop(1, '#55722a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(230,240,190,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 1, 30 + r() * 80); }
    for (let y = 40; y < h; y += 128) {
      g.fillStyle = 'rgba(60,70,30,0.9)'; g.fillRect(0, y, w, 4);
      g.fillStyle = 'rgba(230,235,200,0.5)'; g.fillRect(0, y + 4, w, 2);
    }
  });
}

/** 笹の葉の茂み（透過） */
function leafClusterTex(colors, seed, kind = 'bamboo') {
  return canvasTex(256, 256, (g, w, h) => {
    const r = seeded(seed);
    g.clearRect(0, 0, w, h);
    const n = kind === 'bamboo' ? 70 : 140;
    for (let i = 0; i < n; i++) {
      const cx = w / 2 + (r() - 0.5) * w * 0.8, cy = h / 2 + (r() - 0.5) * h * 0.8;
      if (Math.hypot(cx - w / 2, cy - h / 2) > w * 0.42) continue;
      g.save();
      g.translate(cx, cy);
      g.rotate(kind === 'bamboo' ? 0.4 + (r() - 0.5) * 1.6 : r() * Math.PI * 2);
      g.fillStyle = colors[Math.floor(r() * colors.length)];
      g.beginPath();
      if (kind === 'bamboo') {
        g.ellipse(0, 0, 4 + r() * 2, 22 + r() * 12, 0, 0, Math.PI * 2); // 細長い笹の葉
      } else {
        // もみじ：5つに裂けた葉
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          g.moveTo(0, 0);
          g.lineTo(Math.cos(a - 0.25) * 6, Math.sin(a - 0.25) * 6);
          g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
          g.lineTo(Math.cos(a + 0.25) * 6, Math.sin(a + 0.25) * 6);
        }
      }
      g.fill();
      g.restore();
    }
  });
}

// ======================================================================
// 茶室（草庵風）：池の向こう、正面（+Z）を池に向ける
// ======================================================================
export function buildTeahouse(s3, position) {
  const grp = new THREE.Group();
  grp.position.copy(position);
  const mats = [];
  const M = (m) => { mats.push(m); return m; };
  const wallMat = M(new THREE.MeshStandardMaterial({ map: earthWallTex(), roughness: 0.95 }));
  const postMat = M(new THREE.MeshStandardMaterial({ map: woodTex(3, '#5b3f27'), roughness: 0.8 }));
  const boardMat = M(new THREE.MeshStandardMaterial({ map: woodTex(4, '#7a5a3b'), roughness: 0.75 }));
  const thatchMat = M(new THREE.MeshStandardMaterial({ map: thatchTex(), roughness: 1 }));
  const ridgeMat = M(new THREE.MeshStandardMaterial({ color: 0x2f2a22, roughness: 0.9 }));
  const stoneMat = s3.rockMat.clone(); mats.push(stoneMat);
  const shojiBig = shojiTex(4, 6), shojiSmall = shojiTex(3, 3);
  const shojiMats = [
    M(new THREE.MeshStandardMaterial({ map: shojiBig, emissive: 0xffc77a, emissiveMap: shojiBig, emissiveIntensity: 0, roughness: 0.9 })),
    M(new THREE.MeshStandardMaterial({ map: shojiSmall, emissive: 0xffc77a, emissiveMap: shojiSmall, emissiveIntensity: 0, roughness: 0.9 })),
  ];
  const doorMat = M(new THREE.MeshStandardMaterial({ map: woodTex(5, '#4e3826'), roughness: 0.8 }));

  const W = 2.7, D = 2.7, FLOOR = 0.45, WALL_TOP = 2.35;
  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    grp.add(m);
    return m;
  };

  // 礎石と柱
  const postXs = [-W / 2, 0, W / 2], postZs = [-D / 2, 0, D / 2];
  for (const x of postXs) for (const z of postZs) {
    if (x === 0 && z === 0) continue;
    const st = add(new THREE.DodecahedronGeometry(0.13, 0), stoneMat, x, 0.04, z);
    st.scale.set(1.2, 0.45, 1.2);
    add(new THREE.CylinderGeometry(0.055, 0.065, WALL_TOP + 0.05, 10), postMat, x, (WALL_TOP + 0.05) / 2 + 0.06, z);
  }
  // 床（縁の下は暗く）
  add(new THREE.BoxGeometry(W, 0.08, D), boardMat, 0, FLOOR, 0);
  add(new THREE.BoxGeometry(W - 0.1, FLOOR - 0.06, D - 0.1), M(new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 })), 0, (FLOOR - 0.06) / 2, 0);

  // 壁：穴をあけた土壁（ExtrudeGeometry）
  const wallH = WALL_TOP - FLOOR - 0.04;
  const wall = (width, holes) => {
    const sh = new THREE.Shape();
    sh.moveTo(-width / 2, 0); sh.lineTo(width / 2, 0); sh.lineTo(width / 2, wallH); sh.lineTo(-width / 2, wallH); sh.closePath();
    for (const [x, y, w, h] of holes) {
      const p = new THREE.Path();
      p.moveTo(x - w / 2, y); p.lineTo(x - w / 2, y + h); p.lineTo(x + w / 2, y + h); p.lineTo(x + w / 2, y); p.closePath();
      sh.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false });
    g.translate(0, 0, -0.035);
    // 土壁の模様が大きくなりすぎないよう UV を縮める
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * 0.9);
    return g;
  };
  const y0 = FLOOR + 0.04;
  // 正面：左に貴人口（障子2枚）、右ににじり口と下地窓
  const front = [[-0.6, 0, 1.2, 1.75], [0.75, 0, 0.66, 0.72], [0.75, 1.0, 0.62, 0.52]];
  add(wall(W - 0.1, front), wallMat, 0, y0, D / 2 - 0.02);
  // 側面と背面：連子窓
  add(wall(D - 0.1, [[0.2, 0.75, 0.8, 0.55]]), wallMat, -W / 2 + 0.02, y0, 0, Math.PI / 2);
  add(wall(D - 0.1, [[-0.3, 0.85, 0.7, 0.5]]), wallMat, W / 2 - 0.02, y0, 0, -Math.PI / 2);
  add(wall(W - 0.1, [[0.3, 1.0, 0.9, 0.5]]), wallMat, 0, y0, -D / 2 + 0.02, Math.PI);

  // 障子・戸
  const panel = (w, h, mat, x, y, z, ry = 0) => add(new THREE.BoxGeometry(w, h, 0.02), mat, x, y, z, ry);
  panel(0.6, 1.75, shojiMats[0], -0.9, y0 + 0.875, D / 2 - 0.02);
  panel(0.6, 1.75, shojiMats[0], -0.3, y0 + 0.875, D / 2 - 0.02);
  panel(0.66, 0.72, doorMat, 0.75, y0 + 0.36, D / 2 - 0.01);          // にじり口（板戸）
  panel(0.62, 0.52, shojiMats[1], 0.75, y0 + 1.26, D / 2 - 0.02);    // 下地窓
  panel(0.8, 0.55, shojiMats[1], -W / 2 + 0.02, y0 + 1.025, -0.2, Math.PI / 2);   // 壁を+90°回すと穴の x は -z になる
  panel(0.7, 0.5, shojiMats[1], W / 2 - 0.02, y0 + 1.1, -0.3, -Math.PI / 2);
  panel(0.9, 0.5, shojiMats[1], -0.3, y0 + 1.25, -D / 2 + 0.02, Math.PI);
  // 連子（竹の格子）を側面の窓に
  const barMat = s3.bambooMaterials(31, ['#8f8a52', '#a29b62'], 0.7).outer; mats.push(barMat);
  for (let i = 0; i < 6; i++) {
    const b = add(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 6), barMat, -W / 2 - 0.02, y0 + 1.025, -0.2 - 0.35 + i * 0.14);
    b.castShadow = false;
  }
  // 鴨居・桁
  for (const z of [D / 2, -D / 2]) add(new THREE.BoxGeometry(W + 0.1, 0.1, 0.1), postMat, 0, WALL_TOP, z);
  for (const x of [W / 2, -W / 2]) add(new THREE.BoxGeometry(0.1, 0.1, D + 0.1), postMat, x, WALL_TOP, 0);

  // 茅葺きの切妻屋根（深い軒）
  const ridgeY = 3.35, eave = 0.55;
  const run = D / 2 + eave, rise = ridgeY - (WALL_TOP - 0.15);
  const slope = Math.atan2(rise, run), len = Math.hypot(run, rise);
  for (const side of [1, -1]) {
    const slab = add(new THREE.BoxGeometry(W + 1.0, 0.26, len + 0.12), thatchMat, 0, (ridgeY + WALL_TOP - 0.15) / 2, side * run / 2);
    slab.rotation.x = side * slope;
  }
  // 妻（三角形の壁）
  const tri = new THREE.Shape();
  tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, ridgeY - WALL_TOP); tri.closePath();
  for (const x of [W / 2, -W / 2]) {
    const g = new THREE.ShapeGeometry(tri);
    const m = add(g, wallMat, x, WALL_TOP, 0, Math.PI / 2);
    m.material = wallMat;
    m.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  // 棟（丸太と押さえ）
  const ridge = add(new THREE.CylinderGeometry(0.11, 0.11, W + 1.1, 12), ridgeMat, 0, ridgeY + 0.08, 0);
  ridge.rotation.z = Math.PI / 2;
  for (let i = -3; i <= 3; i++) {
    const k = add(new THREE.BoxGeometry(0.06, 0.08, 0.5), postMat, i * 0.5, ridgeY + 0.16, 0);
    k.castShadow = false;
  }

  // 縁側（池に面した濡れ縁）
  add(new THREE.BoxGeometry(W + 0.2, 0.05, 0.55), boardMat, 0, FLOOR - 0.03, D / 2 + 0.3);
  for (const x of [-W / 2, 0, W / 2]) add(new THREE.CylinderGeometry(0.035, 0.04, FLOOR - 0.05, 8), postMat, x, (FLOOR - 0.05) / 2, D / 2 + 0.52);
  // 沓脱石（くつぬぎいし）
  const kutsu = add(new THREE.DodecahedronGeometry(0.22, 0), stoneMat, 0.75, 0.08, D / 2 + 0.85);
  kutsu.scale.set(1.3, 0.4, 0.9);

  // 夜の室内の灯り
  const light = new THREE.PointLight(0xffbe70, 0, 4, 1.8);
  light.position.set(0, 1.3, D / 2 + 0.4);
  grp.add(light);

  s3.scene.add(grp);
  grp.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(grp).expandByScalar(0.25);

  let fade = 1;
  return {
    group: grp,
    box,
    /** 夜の灯り、カメラとの間に入ったときの半透明化 */
    update(dt, nightK, cam, target) {
      for (const m of shojiMats) m.emissiveIntensity = 0.05 + nightK * 1.1;
      light.intensity = nightK * 2.4;
      // カメラと鹿威しの間に茶室があれば、透かして見えるようにする
      const dir = target.clone().sub(cam);
      const distToTarget = dir.length();
      const ray = new THREE.Ray(cam, dir.normalize());
      const hit = box.containsPoint(cam) || (ray.intersectBox(box, new THREE.Vector3()) && ray.intersectBox(box, new THREE.Vector3()).distanceTo(cam) < distToTarget);
      const goal = hit ? 0 : 1;
      fade += (goal - fade) * Math.min(dt * 4, 1);
      const transparent = fade < 0.99;
      for (const m of mats) {
        if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
        m.opacity = fade;
        m.depthWrite = !transparent;
      }
      grp.visible = fade > 0.02;
      grp.traverse((o) => { if (o.isMesh) o.castShadow = fade > 0.5; });
    },
  };
}

// ======================================================================
// 遠景：竹林ともみじ（カメラの通り道より外側、半径10〜16m）
// ======================================================================
export function buildDistantScenery(s3) {
  const rnd = seeded(41);
  const culms = [];
  // 茶室の後ろと左右を中心に、ぐるりと竹林を置く（正面側は少しまばら）
  const N = 170;
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2;
    const front = Math.cos(a) > 0.6 && Math.sin(a) > -0.2;          // 手前側（+Z 方向）は控えめに
    if (front && rnd() < 0.6) continue;
    const r = 10 + rnd() * 6;
    culms.push({
      x: 0.4 + Math.sin(a) * r, z: -1.2 + -Math.cos(a) * r,
      h: 6 + rnd() * 4, rad: 0.035 + rnd() * 0.035,
      lean: (rnd() - 0.5) * 0.08, dir: rnd() * Math.PI * 2, ph: rnd() * 6.28,
    });
  }
  // 稈
  const culmMat = new THREE.MeshStandardMaterial({ map: culmTex(), roughness: 0.6 });
  culmMat.map.repeat.set(1, 6);
  const culmGeo = new THREE.CylinderGeometry(1, 1.1, 1, 8, 1, true);
  culmGeo.translate(0, 0.5, 0);
  const culmMesh = new THREE.InstancedMesh(culmGeo, culmMat, culms.length);
  culmMesh.frustumCulled = false;
  s3.scene.add(culmMesh);
  // 笹の葉（上部に茂る）
  const leafTex = leafClusterTex(['#3f6b25', '#4d7a2a', '#5f8c33', '#33591f', '#6f9a3a'], 5, 'bamboo');
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  const leafGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const leaves = [];
  culms.forEach((c, ci) => {
    const n = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      leaves.push({ ci, t: 0.55 + rnd() * 0.45, ry: rnd() * Math.PI * 2, tilt: (rnd() - 0.5) * 0.8, off: (rnd() - 0.5) * 0.6, s: 0.8 + rnd() * 0.7 });
    }
  });
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
  leafMesh.frustumCulled = false;
  s3.scene.add(leafMesh);

  // もみじ（竹林の間にところどころ）
  const maples = [];
  const trunkMat = new THREE.MeshStandardMaterial({ map: woodTex(8, '#4a3526'), roughness: 0.9 });
  const mapleTex = leafClusterTex(['#c2361f', '#d9502a', '#e0702c', '#b0281c', '#e89a3a'], 7, 'maple');
  const mapleMat = new THREE.MeshStandardMaterial({ map: mapleTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  const mapleSpots = [[-7, -9], [6.5, -10], [-10.5, -2], [10.5, -4], [-3, -13], [3.5, -13.5]];
  for (const [x, z] of mapleSpots) {
    const g = new THREE.Group();
    const h = 3 + rnd() * 1.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, h, 8), trunkMat);
    trunk.position.y = h / 2;
    g.add(trunk);
    for (let k = 0; k < 22; k++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mapleMat);
      const a = rnd() * Math.PI * 2, r = rnd() * 1.4;
      p.position.set(Math.cos(a) * r, h - 0.3 + rnd() * 1.4 - r * 0.3, Math.sin(a) * r);
      p.rotation.set((rnd() - 0.5) * 0.8, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.8);
      g.add(p);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rnd() * 6.28;
    s3.scene.add(g);
    maples.push({ g, ph: rnd() * 6.28 });
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const tops = culms.map(() => new THREE.Vector3());
  return {
    /** 風に揺れる（風のギミックで大きく） */
    update(time, windK) {
      culms.forEach((c, i) => {
        const sway = c.lean + Math.sin(time * 0.7 + c.ph) * (0.012 + 0.05 * windK) + Math.sin(time * 1.9 + c.ph * 2) * 0.006;
        e.set(Math.cos(c.dir) * sway, 0, Math.sin(c.dir) * sway);
        q.setFromEuler(e);
        v.set(c.x, 0, c.z);
        sc.set(c.rad, c.h, c.rad);
        m4.compose(v, q, sc);
        culmMesh.setMatrixAt(i, m4);
        tops[i].set(0, 1, 0).applyQuaternion(q);
      });
      culmMesh.instanceMatrix.needsUpdate = true;
      leaves.forEach((l, i) => {
        const c = culms[l.ci];
        const up = tops[l.ci];
        v.set(c.x + up.x * c.h * l.t + Math.cos(l.ry) * l.off, up.y * c.h * l.t, c.z + up.z * c.h * l.t + Math.sin(l.ry) * l.off);
        e.set(l.tilt + Math.sin(time * 1.3 + l.ry) * 0.05 * (1 + windK * 3), l.ry, 0);
        q.setFromEuler(e);
        sc.setScalar(l.s);
        m4.compose(v, q, sc);
        leafMesh.setMatrixAt(i, m4);
      });
      leafMesh.instanceMatrix.needsUpdate = true;
      for (const m of maples) m.g.rotation.z = Math.sin(time * 0.6 + m.ph) * (0.01 + 0.03 * windK);
    },
  };
}
