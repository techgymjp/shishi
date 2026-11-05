// 3D の日本庭園と鹿威し（Three.js）
// 実写由来の素材（Poly Haven / CC0）と、プログラムで作る竹の質感を組み合わせる。
// 単位はメートル。鹿威しの竹筒は X 軸方向、支点を Z 軸まわりに回転させる。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { ANGLE_REST } from './shishi.js';
import { buildTeahouse, buildDistantScenery, buildKaresansui, buildPine } from './landscape.js';

// ---------- 寸法 ----------
const PIVOT = new THREE.Vector3(0, 0.46, 0);
const TUBE_R = 0.045;          // 竹筒の半径（直径9cm）
const TUBE_WALL = 0.006;
const TUBE_BACK = -0.36;       // 石に当たる側（節で閉じている）
const TUBE_FRONT = 0.44;       // 水を受ける口
const TUBE_CUT = 0.11;         // 口を斜めに切った長さ
const SEPTUM_X = 0.03;         // 支点の少し前にある節（水はここから口までに溜まる）
const SPOUT_POST = new THREE.Vector3(0.68, 0, -0.17);  // 筧の支柱
const BASIN = new THREE.Vector3(0.45, 0, 0.02);   // 手水鉢（竹筒からこぼれた水が落ちる位置）
const BASIN_WATER_Y = 0.155;
const BASIN_WATER_R = 0.128;
const G = 9.8;

const ASSET = 'assets/';

// ---------- 小さな道具 ----------
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

/** 竹の表皮（u：円周方向、v：長さ方向） */
function bambooTexture(seed, base, aged = 0) {
  return canvasTexture(256, 1024, (g, w, h) => {
    const rnd = seeded(seed);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, base[0]); grad.addColorStop(0.5, base[1]); grad.addColorStop(1, base[0]);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // 縦方向の細かい繊維
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w;
      const light = rnd() < 0.5;
      g.fillStyle = light ? `rgba(255,255,220,${0.03 + rnd() * 0.05})` : `rgba(30,40,10,${0.03 + rnd() * 0.06})`;
      g.fillRect(x, rnd() * h, 0.6 + rnd() * 1.4, 40 + rnd() * 400);
    }
    // くすみ・しみ
    for (let i = 0; i < 40 + aged * 120; i++) {
      const x = rnd() * w, y = rnd() * h;
      const r = 2 + rnd() * (6 + aged * 14);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${aged ? '90,70,40' : '70,80,30'},${0.12 + aged * 0.15})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, r * 0.6, r * 1.6, 0, 0, Math.PI * 2); g.fill();
    }
  });
}

function radialAlpha(inner = 0.6) {
  return canvasTexture(256, 256, (g, w) => {
    const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    rg.addColorStop(0, '#fff'); rg.addColorStop(inner, '#fff'); rg.addColorStop(1, '#000');
    g.fillStyle = rg; g.fillRect(0, 0, w, w);
  }, { srgb: false });
}

/** さざ波の法線マップ（高さマップから生成） */
function rippleNormal() {
  const N = 256;
  const rnd = seeded(11);
  const waves = Array.from({ length: 14 }, () => ({
    kx: Math.round((rnd() - 0.5) * 16), ky: Math.round((rnd() - 0.5) * 16), p: rnd() * 6.28, a: 0.3 + rnd(),
  }));
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const wv of waves) v += wv.a * Math.sin(((wv.kx * x + wv.ky * y) / N) * Math.PI * 2 + wv.p);
    hgt[y * N + x] = v;
  }
  return canvasTexture(N, N, (g) => {
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hL = hgt[y * N + ((x - 1 + N) % N)], hR = hgt[y * N + ((x + 1) % N)];
      const hD = hgt[((y - 1 + N) % N) * N + x], hU = hgt[((y + 1) % N) * N + x];
      const nx = (hL - hR) * 0.5, ny = (hD - hU) * 0.5, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
}

/** 流れる水の筋（不透明度マップ） */
function streamTexture() {
  return canvasTexture(64, 256, (g, w, h) => {
    const rnd = seeded(5);
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.2 + rnd() * 0.5})` : `rgba(40,40,40,${0.2 + rnd() * 0.4})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 10 + rnd() * 60);
    }
  }, { srgb: false });
}

function glowTexture(color) {
  return canvasTexture(128, 128, (g, w) => {
    const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    rg.addColorStop(0, color); rg.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.5)')); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, w);
  });
}

/**
 * 竹筒のジオメトリ：外皮・内側・切り口・閉じた節（4グループ）
 * cut > 0 なら口を斜めに切る（上側が長い）
 */
function bambooTubeGeometry({ r, wall, xb, xf, cut = 0, radial = 40, segs = 24, closedBack = true }) {
  const pos = [], nor = [], uv = [], idx = [];
  const groups = [];
  // 上側を短く、下側を長く切る → 開口部が上を向いて水を受ける（実物の鹿威しと同じ）
  const front = (cos) => xf - ((1 + cos) / 2) * cut;
  const cutN = new THREE.Vector3(1, cut / (2 * r), 0).normalize();
  const len = xf - xb;
  const circ = 2 * Math.PI * r;

  const addSurface = (radius, inward) => {
    const start = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      for (let j = 0; j <= radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const x = xb + (front(c) - xb) * (i / segs);
        pos.push(x, c * radius, s * radius);
        nor.push(0, inward ? -c : c, inward ? -s : s);
        uv.push(j / radial, ((x - xb) / circ) * 0.25);
      }
    }
    const istart = idx.length;
    for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
      const a = start + i * (radial + 1) + j, b = a + radial + 1;
      if (inward) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    return [istart, idx.length - istart];
  };
  groups.push(addSurface(r, false));
  groups.push(addSurface(r - wall, true));

  // 切り口
  let start = pos.length / 3;
  for (let j = 0; j <= radial; j++) {
    const th = (j / radial) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    for (const rr of [r, r - wall]) {
      pos.push(front(c), c * rr, s * rr); nor.push(cutN.x, cutN.y, cutN.z); uv.push(j / radial, rr === r ? 0 : 1);
    }
  }
  let istart = idx.length;
  for (let j = 0; j < radial; j++) {
    const a = start + j * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  groups.push([istart, idx.length - istart]);

  // 節（閉じた後端）
  istart = idx.length;
  if (closedBack) {
    start = pos.length / 3;
    pos.push(xb, 0, 0); nor.push(-1, 0, 0); uv.push(0.5, 0.5);
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      pos.push(xb, Math.cos(th) * r, Math.sin(th) * r); nor.push(-1, 0, 0);
      uv.push(0.5 + Math.cos(th) * 0.5, 0.5 + Math.sin(th) * 0.5);
    }
    for (let j = 0; j < radial; j++) idx.push(start, start + j + 2, start + j + 1);
  }
  groups.push([istart, idx.length - istart]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  groups.forEach(([s, c], i) => geo.addGroup(s, c, i));
  return geo;
}

function nodeRing(r, x, mat) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.0012, 0.0035, 8, 40), mat);
  ring.rotation.y = Math.PI / 2;
  ring.position.x = x;
  ring.castShadow = true;
  return ring;
}


/** 臨界減衰のばね：x を goal へ、速度も連続になめらかに近づける（カメラの急な動き出しを防ぐ） */
function spring(state, key, goal, dt, w = 1.6) {
  const vk = key + 'V';
  if (state[key] === undefined) { state[key] = goal; state[vk] = 0; return goal; }
  const v = state[vk] || 0;
  const a = (goal - state[key]) * w * w - 2 * w * v;
  state[vk] = v + a * dt;
  state[key] += state[vk] * dt;
  return state[key];
}

// 2本目の鹿威しを置く位置（ギミック「2本の鹿威し」）
const UNIT_ORIGINS = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-1.0, 0, -0.38)];
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const lerp = (a, b, k) => a + (b - a) * k;

// ======================================================================
// 鹿威し1基（竹筒・支柱・筧・手水鉢・打ち石・水流・光）
// すべて unit.group の中に作り、group を origin へ置く（回転はしない）
// ======================================================================
class ShishiUnit {
  constructor(scene3d, origin, seed) {
    this.s3 = scene3d;
    this.origin = origin.clone();
    this.group = new THREE.Group();
    this.group.position.copy(origin);
    scene3d.scene.add(this.group);
    this.seed = seed;
    this.size = 1;          // 竹筒の太さ（ギミック「竹筒のサイズ」）
    this.sizeTarget = 1;
    this.visibleK = 1;      // 表示の度合い（出入りのフェード用）
    this.nudge = null;
    this.buildTube();
    this.buildSpout();
    this.buildBasin();
    this.buildStrikeStone();
    this.buildEffects();
  }

  get pivotW() { return PIVOT.clone().add(this.origin); }
  get basinW() { return BASIN.clone().add(this.origin); }
  /** 竹筒が石に当たる点（ワールド座標） */
  get contactW() { return this.contactL.clone().add(this.origin); }

  add(obj) { this.group.add(obj); return obj; }

  buildTube() {
    const s3 = this.s3;
    const m = s3.bambooMaterials(3 + this.seed, ['#6a8a2c', '#86a23c']);
    const geo = bambooTubeGeometry({ r: TUBE_R, wall: TUBE_WALL, xb: TUBE_BACK, xf: TUBE_FRONT, cut: TUBE_CUT });
    const tube = new THREE.Mesh(geo, [m.outer, m.inner, m.rim, m.outer]);
    tube.castShadow = true;
    tube.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.position.copy(PIVOT);
    // 太さを変えるための入れ物（長さは変えず、Y・Z だけ拡大縮小する）
    const body = new THREE.Group();
    body.add(tube);
    for (const x of [-0.14, SEPTUM_X]) body.add(nodeRing(TUBE_R, x, m.outer));
    const ri = TUBE_R - TUBE_WALL;
    const septum = new THREE.Mesh(new THREE.CircleGeometry(ri + 0.0005, 32), m.inner);
    septum.rotation.y = Math.PI / 2;
    septum.position.x = SEPTUM_X;
    body.add(septum);
    // 溜まった水：節から口までの円柱を水平な面で切り取って水面にする
    this.waterPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x2f5550, roughness: 0.06, metalness: 0, envMapIntensity: 1.2, clearcoat: 1, clearcoatRoughness: 0.08,
      side: THREE.DoubleSide, clippingPlanes: [this.waterPlane], clipShadows: true,
    });
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const wgeo = bambooTubeGeometry({ r: ri - 0.0008, wall: 0.001, xb: SEPTUM_X + 0.001, xf: TUBE_FRONT - 0.002, cut: TUBE_CUT, radial: 32, segs: 12 });
    this.tubeWater = new THREE.Mesh(wgeo, [waterMat, hidden, hidden, waterMat]);
    body.add(this.tubeWater);
    pivot.add(body);
    this.body = body;
    this.add(pivot);
    this.pivot = pivot;

    // 支点の軸
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b2f22, roughness: 0.6 }));
    pin.rotation.x = Math.PI / 2;
    pin.position.copy(PIVOT);
    pin.castShadow = true;
    this.add(pin);

    // 支柱（古びた太めの竹）
    const postMat = s3.bambooMaterials(23 + this.seed, ['#8d8a55', '#a19a62'], 0.6).outer;
    const capMat = new THREE.MeshStandardMaterial({ color: 0xcbbd8c, roughness: 0.9 });
    this.posts = [];
    for (const z of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.023, 0.56, 16), postMat);
      post.position.set(0, 0.28, z * (TUBE_R + 0.03));
      post.castShadow = true; post.receiveShadow = true;
      this.add(post);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), capMat);
      cap.rotation.x = -Math.PI / 2; cap.position.set(0, 0.5601, z * (TUBE_R + 0.03));
      this.add(cap);
      this.posts.push(post, cap);
    }
  }

  /** 静止時の竹筒の口の中（水を受ける点、ローカル座標） */
  mouthTarget() {
    return new THREE.Vector3(TUBE_FRONT - TUBE_CUT * 0.4, 0, 0).applyAxisAngle(Z_AXIS, -ANGLE_REST).add(PIVOT);
  }

  buildSpout() {
    const m = this.s3.bambooMaterials(9 + this.seed, ['#9a8a4c', '#ad9c5c'], 0.6);
    const post = SPOUT_POST;
    const top = 0.96;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, top, 16), m.outer);
    pole.position.set(post.x, top / 2, post.z);
    pole.castShadow = true; pole.receiveShadow = true;
    this.add(pole);
    for (const y of [0.35, 0.7]) {
      const ring = nodeRing(0.026, 0, m.outer);
      ring.rotation.set(Math.PI / 2, 0, 0);
      ring.position.set(post.x, y, post.z);
      this.add(ring);
    }
    // 上部の横木（T字）
    const head = new THREE.Mesh(bambooTubeGeometry({ r: 0.03, wall: 0.005, xb: -0.12, xf: 0.12, cut: 0, radial: 24, segs: 4 }),
      [m.outer, m.inner, m.rim, m.outer]);
    head.rotation.y = Math.PI / 2 - 0.35;
    head.position.set(post.x, top + 0.02, post.z);
    head.castShadow = true;
    this.add(head);

    // 斜めに下りる筧：出口は竹筒の口の真上（約11cm上）
    const target = this.mouthTarget();
    const mouth = new THREE.Vector3(target.x + 0.012, target.y + 0.115, target.z);
    const start = new THREE.Vector3(post.x, top + 0.02, post.z);
    const dir = mouth.clone().sub(start);
    const len = dir.length();
    dir.normalize();
    const pipe = new THREE.Mesh(
      bambooTubeGeometry({ r: 0.018, wall: 0.0035, xb: -len - 0.02, xf: 0, cut: 0.02, radial: 24, segs: 8 }),
      [m.outer, m.inner, m.rim, m.outer],
    );
    pipe.rotation.x = Math.PI; // 口の切り口を下向き寄りに
    pipe.castShadow = true;
    const grp = new THREE.Group();
    grp.add(pipe);
    grp.position.copy(mouth);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    this.add(grp);
    this.spoutMouthL = mouth;
    this.spoutDir = dir;

    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.005, 6, 20), new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.9 }));
    rope.position.set(post.x, top - 0.03, post.z);
    rope.rotation.x = Math.PI / 2;
    this.add(rope);
  }

  buildBasin() {
    // 手水鉢（石をくり抜いた鉢）
    const prof = [
      [0.0, 0.0], [0.19, 0.0], [0.215, 0.04], [0.21, 0.11], [0.195, 0.16], [0.18, 0.178],
      [0.155, 0.182], [0.138, 0.172], [0.13, 0.14], [0.11, 0.1], [0.06, 0.085], [0.0, 0.082],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 64);
    const p = geo.attributes.position;
    const rnd = seeded(21 + this.seed);
    const bumps = Array.from({ length: 6 }, () => ({ f: 1 + Math.floor(rnd() * 5), ph: rnd() * 6.28, a: 0.004 + rnd() * 0.006 }));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const th = Math.atan2(z, x);
      let d = 0;
      for (const b of bumps) d += b.a * Math.sin(b.f * th + b.ph + y * 12);
      const k = (r + d * (y > 0.17 ? 0.5 : 1)) / r;
      p.setXYZ(i, x * k, y, z * k);
    }
    geo.computeVertexNormals();
    const basin = new THREE.Mesh(geo, this.s3.basinMat);
    basin.position.copy(BASIN);
    basin.castShadow = true; basin.receiveShadow = true;
    this.add(basin);
    const water = new THREE.Mesh(new THREE.CircleGeometry(BASIN_WATER_R + 0.012, 48), this.s3.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(BASIN.x, BASIN_WATER_Y, BASIN.z);
    water.receiveShadow = true;
    this.add(water);
    // 玉砂利
    const peb = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), this.s3.pebbleMat);
    peb.rotation.x = -Math.PI / 2;
    peb.position.set(BASIN.x + 0.02, 0.002 + this.seed * 0.0005, BASIN.z + 0.05);
    peb.receiveShadow = true;
    this.add(peb);
  }

  buildStrikeStone() {
    // 竹筒の後端が石に乗る位置を計算し、そこへ石の上面を合わせる
    const contactL = new THREE.Vector3(TUBE_BACK + 0.03, -TUBE_R, 0).applyAxisAngle(Z_AXIS, -ANGLE_REST).add(PIVOT);
    this.contactL = contactL;
    const set = this.s3.assets.rocks;
    let stone;
    if (set) {
      const src = set.scene.getObjectByName('rock_moss_set_02_rock11') || set.scene.children[0];
      const rock = src.clone();
      rock.position.set(0, 0, 0);   // セット内での配置位置を打ち消す
      rock.rotation.set(0, 0.6 + this.seed * 1.3, 0);
      rock.scale.setScalar(1);
      rock.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rock);
      const c = box.getCenter(new THREE.Vector3());
      rock.position.set(-c.x, -box.min.y, -c.z);
      stone = new THREE.Group();
      stone.add(rock);
      const sink = 0.03;
      const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const hs = 0.34 / width;
      stone.scale.set(hs, 1, hs);
      stone.position.set(contactL.x - 0.03, 0, contactL.z);
      stone.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(contactL.x, 5, contactL.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(stone, true)[0];
      const h1 = hit ? hit.point.y : box.max.y - box.min.y;
      stone.scale.y = (contactL.y + sink) / h1;
      stone.position.y = -sink;
    } else {
      stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 1), this.s3.rockMat);
      stone.position.set(contactL.x, contactL.y - 0.16, contactL.z);
    }
    stone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.add(stone);
    this.stone = stone;
    this.stoneBaseY = stone.position.y;
  }

  buildEffects() {
    const s3 = this.s3;
    this.spoutStream = this.add(new THREE.Mesh(new THREE.BufferGeometry(), s3.streamMat));
    this.pourStream = this.add(new THREE.Mesh(new THREE.BufferGeometry(), s3.streamMat));
    this.spoutStream.frustumCulled = false;
    this.pourStream.frustumCulled = false;
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: s3.haloTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    this.halo.scale.setScalar(0.45);
    this.halo.position.copy(this.contactL).add(new THREE.Vector3(0, 0.02, 0.05));
    this.add(this.halo);
    this.glowLight = new THREE.PointLight(0xffd27a, 0, 0.9, 2);
    this.glowLight.position.copy(this.contactL).add(new THREE.Vector3(0.02, 0.12, 0.15));
    this.add(this.glowLight);
  }

  /** タップへの反応（見た目だけ。衝突時刻＝判定の基準は変えない） */
  nudgeTube(kind, strength = 1, fill = 0) { this.nudge = { kind, strength, fill, t: 0 }; }

  nudgeOffset(dt) {
    const n = this.nudge;
    if (!n) return 0;
    n.t += dt;
    const t = n.t;
    if (n.kind === 'dip') {
      const dur = 1.0 - 0.65 * n.fill;              // 水が少ないとゆっくり、満水近くで速く
      const amp = (0.035 + 0.11 * n.fill) * n.strength;
      if (t > dur * 1.6) { this.nudge = null; return 0; }
      if (t < dur) return -amp * Math.sin(Math.PI * t / dur);
      return amp * 0.15 * Math.sin(Math.PI * (t - dur) / (dur * 0.6));
    }
    if (t > 0.6) { this.nudge = null; return 0; }
    const decay = Math.exp(-t * 7);
    if (n.kind === 'push') return 0.07 * n.strength * Math.exp(-t * 14) * Math.sin(Math.min(t * 30, Math.PI / 2));
    if (n.kind === 'bounce') return -0.05 * n.strength * decay * Math.abs(Math.sin(t * 22));
    return -0.025 * n.strength * decay * Math.sin(t * 38);
  }

  /** 毎フレームの更新（sim: ShishiOdoshi） */
  draw(sim, glow, dt) {
    const s3 = this.s3;
    // 出入りのフェード（2本目の鹿威し）
    this.group.visible = this.visibleK > 0.01;
    if (!this.group.visible) return;
    const sc = 0.6 + 0.4 * this.visibleK;
    this.group.scale.setScalar(sc);
    this.group.position.set(this.origin.x, (1 - this.visibleK) * -0.3, this.origin.z);

    // 竹筒の太さ
    this.size += (this.sizeTarget - this.size) * Math.min(dt * 2, 1);
    this.body.scale.set(1, this.size, this.size);
    this.stone.position.y = this.stoneBaseY - (this.size - 1) * TUBE_R * Math.cos(ANGLE_REST);
    const R = TUBE_R * this.size;
    const ri = (TUBE_R - TUBE_WALL) * this.size;

    // 風で竹筒がわずかに揺れる
    const wind = s3.windK * (Math.sin(s3.time * 2.3 + this.seed) * 0.012 + Math.sin(s3.time * 5.1 + this.seed * 2) * 0.004);
    const rot = Math.min(-sim.angle + this.nudgeOffset(dt) + wind, -ANGLE_REST + 0.002);
    this.pivot.rotation.z = rot;

    // ワールド座標（group の拡大縮小を考慮）
    const P = PIVOT.clone().multiplyScalar(sc).add(this.group.position);
    const toW = (x, y) => new THREE.Vector3(x, y, 0).applyAxisAngle(Z_AXIS, rot).multiplyScalar(sc).add(P);
    const basinY = BASIN_WATER_Y * sc + this.group.position.y;

    // 竹筒に溜まった水：節から口の下端までの範囲で、水量に応じて水位を決める
    const fill = sim.fill;
    const septumLow = Math.min(toW(SEPTUM_X, -ri).y, toW(SEPTUM_X, ri).y);
    const lip = toW(TUBE_FRONT, -ri);
    const lipTop = toW(TUBE_FRONT - TUBE_CUT, ri);
    const spill = Math.min(lip.y, lipTop.y);
    let level = -10;
    if (fill > 0.005) {
      if (septumLow < spill) level = septumLow + (spill - septumLow) * Math.min(fill, 1) * 0.97;
      else level = spill + 0.004 * fill;
    }
    this.waterPlane.constant = level;
    this.tubeWater.visible = level > -10;

    // 筧からの水流（ローカル座標で計算）
    const m0 = this.spoutMouthL;
    const sx = m0.x, sy = m0.y - 0.014, sz = m0.z;
    const vx = this.spoutDir.x * 0.25 * s3.flowK;
    const vz = this.spoutDir.z * 0.25 * s3.flowK;
    const tFall = (yEnd) => Math.sqrt(Math.max(2 * (sy - yEnd), 0) / G);
    const cosR = Math.cos(rot), tanR = Math.tan(rot);
    const probeX = sx + vx * tFall(PIVOT.y);
    const localX = (probeX - PIVOT.x) / cosR;
    const centerY = PIVOT.y + tanR * (probeX - PIVOT.x);
    const levelL = level > -10 ? (level - this.group.position.y) / sc : -10;
    let target = BASIN_WATER_Y;
    if (localX > SEPTUM_X && localX < TUBE_FRONT + 0.005 && (localX > TUBE_FRONT - TUBE_CUT || rot < 0)) {
      const bottom = centerY - ri / cosR;
      target = rot < 0 ? centerY + R / cosR : Math.max(levelL, bottom);
    } else if (localX > TUBE_BACK && localX < TUBE_FRONT) {
      target = centerY + R / cosR;
    }
    const pts = [];
    const tEnd = tFall(target);
    for (let k = 0; k <= 10; k++) {
      const t = (k / 10) * tEnd;
      pts.push(new THREE.Vector3(sx + vx * t, sy - 0.5 * G * t * t, sz + vz * t));
    }
    this.spoutStream.geometry.dispose();
    this.spoutStream.geometry = s3.streamGeometry(pts, 0.0042 * (0.8 + 0.4 * s3.flowK));
    if (Math.random() < 0.5) {
      const end = this.group.localToWorld(pts[pts.length - 1].clone());
      s3.spawnDrops(end, 1, { speed: 0.3, size: 0.002 });
    }

    // 竹筒からこぼれる水（口の縁が中の水面より低くなってから）
    this.lastPourEnd = null;
    if (sim.phase === 'pour' && fill > 0.02 && lip.y < septumLow + 0.004) {
      const lipL = new THREE.Vector3(TUBE_FRONT, -(TUBE_R - TUBE_WALL) * this.size, 0).applyAxisAngle(Z_AXIS, rot).add(PIVOT);
      const dirOut = new THREE.Vector3(1, 0, 0).applyAxisAngle(Z_AXIS, rot);
      const v = 0.22 + fill * 0.3;   // 縁からあふれ出るように、勢いは弱め
      const a = 0.5 * G, b = -dirOut.y * v, c = BASIN_WATER_Y - lipL.y;
      const ty = (-b + Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
      const pp = [];
      for (let k = 0; k <= 10; k++) {
        const t = (k / 10) * ty;
        pp.push(new THREE.Vector3(lipL.x + dirOut.x * v * t, lipL.y + dirOut.y * v * t - 0.5 * G * t * t, 0));
      }
      this.pourStream.geometry.dispose();
      this.pourStream.geometry = s3.streamGeometry(pp, (0.006 + fill * 0.012) * this.size);
      this.pourStream.visible = true;
      const pend = this.group.localToWorld(pp[pp.length - 1].clone());
      this.lastPourEnd = pend;
      if (Math.random() < 0.8) s3.spawnDrops(pend, 2, { speed: 0.9, size: 0.004 });
      if (Math.random() < 0.3) s3.ripple(pend.x, pend.z, 0.12, basinY);
    } else {
      this.pourStream.visible = false;
    }

    // タイミングの光
    this.halo.material.opacity = glow * 0.75;
    this.glowLight.intensity = glow * 0.9;
  }
}

// ======================================================================

export class Scene3D {
  constructor(canvas, fxEl) {
    this.canvas = canvas;
    this.fx = fxEl;
    this.time = 0;
    this.flash = 0;
    this.dark = 0;
    this.shake = 0;
    this.mode = 'title';
    this.ready = false;
    this.camAz = 0.25;
    // ギミックの効き具合（0〜1、なめらかに変化）
    this.gimmicks = { rain: false, wind: false, night: false, size: 1, twin: false };
    this.rainK = 0; this.windK = 0; this.nightK = 0; this.twinK = 0; this.flowK = 1;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a3a2c');
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    this.camTarget = new THREE.Vector3(0.06, 0.4, 0);
    this.resize();
  }

  // ---------- 読み込み ----------
  async load(onProgress = () => {}) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, done, total) => onProgress(done / total);
    const texLoader = new THREE.TextureLoader(manager);
    const gltfLoader = new GLTFLoader(manager);
    const hdrLoader = new HDRLoader(manager);

    const tex = (name, srgb = false) => new Promise((res) => texLoader.load(`${ASSET}textures/${name}.jpg`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      res(t);
    }, undefined, () => res(null)));
    const pbr = async (name) => {
      const [map, normalMap, arm] = await Promise.all([tex(`${name}_diff`, true), tex(`${name}_nor`), tex(`${name}_arm`)]);
      return { map, normalMap, arm };
    };
    const gltf = (name) => new Promise((res) => gltfLoader.load(`${ASSET}models/${name}/${name}.gltf`, res, undefined, () => res(null)));

    const [hdr, bg, ground, pebbles, rock, rocks, ferns] = await Promise.all([
      new Promise((res) => hdrLoader.load(`${ASSET}hdri/mossy_forest_1k.hdr`, res, undefined, () => res(null))),
      new Promise((res) => texLoader.load(`${ASSET}hdri/mossy_forest_bg.jpg`, res, undefined, () => res(null))),
      pbr('aerial_grass_rock'), pbr('clean_pebbles'), pbr('mossy_rock'),
      gltf('rock_moss_set_02'), gltf('fern_02'),
    ]);
    this.assets = { hdr, bg, ground, pebbles, rock, rocks, ferns };
    this.build();
    this.ready = true;
    this.resize();
  }

  pbrMaterial(set, repeat, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, ...extra });
    if (!set) return m;
    for (const key of ['map', 'normalMap', 'arm']) {
      const t = set[key];
      if (!t) continue;
      const tt = t.clone();
      tt.repeat.set(repeat, repeat);
      tt.needsUpdate = true;
      if (key === 'arm') { m.aoMap = tt; m.roughnessMap = tt; } else m[key] = tt;
    }
    return m;
  }

  bambooMaterials(seed, base, aged = 0) {
    const outer = new THREE.MeshPhysicalMaterial({
      map: bambooTexture(seed, base, aged), roughness: 0.55 + aged * 0.2, clearcoat: 0.15, clearcoatRoughness: 0.5,
      envMapIntensity: 0.45, specularIntensity: 0.35,
    });
    const inner = new THREE.MeshStandardMaterial({ color: aged ? 0x8a7a55 : 0xb7ab78, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: aged ? 0xb9a77a : 0xdcd3a2, roughness: 0.8 });
    return { outer, inner, rim };
  }

  // ---------- シーン構築 ----------
  build() {
    const { scene, assets } = this;
    const pmrem = new THREE.PMREMGenerator(this.renderer);

    if (assets.hdr) {
      assets.hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(assets.hdr).texture;
      scene.environmentIntensity = 0.85;
    }
    if (assets.bg) {
      assets.bg.mapping = THREE.EquirectangularReflectionMapping;
      assets.bg.colorSpace = THREE.SRGBColorSpace;
      const sky = new GroundedSkybox(assets.bg, 1.7, 60, 96);
      sky.position.y = 1.7 - 0.01;
      sky.rotation.y = 2.2;
      sky.material.fog = false;
      scene.add(sky);
      scene.background = null;
      this.sky = sky;
    }
    this.fogDay = new THREE.Color(0x55684f);
    this.fogNight = new THREE.Color(0x0a1220);
    this.fogRain = new THREE.Color(0x6d7a72);
    scene.fog = new THREE.Fog(this.fogDay.clone(), 9, 40);

    // 木漏れ日（夜は月明かり）
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(-1.6, 3.2, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -3.8; sun.shadow.camera.right = 3.8;
    sun.shadow.camera.top = 3.8; sun.shadow.camera.bottom = -3.8;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 14;
    sun.target.position.set(0.3, 0, -2.2);
    sun.position.set(-1.3, 3.6, 0.2);
    scene.add(sun.target);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    scene.add(sun);
    this.sun = sun;
    this.sunDay = new THREE.Color(0xfff1d6);
    this.sunNight = new THREE.Color(0x8fa8ff);

    const groundMat = this.pbrMaterial(assets.ground, 15, { alphaMap: radialAlpha(0.72), transparent: true });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 96), groundMat);
    ground.position.z = -1.2;
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    this.groundMat = groundMat;

    // 共有の素材
    this.rockMat = this.pbrMaterial(assets.rock, 1.5);
    this.basinMat = this.pbrMaterial(assets.rock, 1);
    this.basinMat.aoMap = null;
    for (const t of [this.basinMat.map, this.basinMat.normalMap, this.basinMat.roughnessMap]) if (t) t.repeat.set(2, 0.8);
    this.pebbleMat = this.pbrMaterial(assets.pebbles, 1.6, { color: 0xb8b4a8, alphaMap: radialAlpha(0.7), transparent: true, polygonOffset: true, polygonOffsetFactor: -1 });
    this.waterNormal = rippleNormal();
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x13221d, roughness: 0.2, metalness: 0, normalMap: this.waterNormal,
      normalScale: new THREE.Vector2(0.04, 0.04), envMapIntensity: 0.35,
    });
    this.streamTex = streamTexture();
    this.streamTex.repeat.set(1, 3);
    this.streamMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff2ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.75,
      alphaMap: this.streamTex, envMapIntensity: 1.6, clearcoat: 1, depthWrite: false,
    });
    this.haloTex = glowTexture('rgba(255,215,130,1)');

    this.buildParticles();
    this.buildPerfectFx();
    this.units = UNIT_ORIGINS.map((o, i) => new ShishiUnit(this, o, i));
    this.units[1].visibleK = 0;
    this.buildLantern();
    this.buildPlants();
    this.buildStreamAndPond();
    // 池の向こうの茶室と、遠景の竹林・もみじ
    this.teahouse = buildTeahouse(this, new THREE.Vector3(0.45, 0, -4.9));
    this.scenery = buildDistantScenery(this);
    this.buildSteppingStones();
    // B エリア（池と飛び石の右、茶室の横）に松。根元の庭石を添え石にする
    this.pine = buildPine(this, new THREE.Vector3(2.55, 0, -1.75));
    // 枯山水：茶室の縁側から見て鹿威しの向こう側（手前）。石は低めにして、打ち石を隠さない位置に
    buildKaresansui(this, new THREE.Vector3(0.15, 0, 2.3), 3.8, 1.6, [
      { name: 'rock_moss_set_02_rock11', x: 1.15, z: -0.1, w: 0.42, h: 0.26, ry: 0.4, ring: 0.42, moss: 0.3 },   // 主石
      { name: 'rock_moss_set_02_rock08', x: 1.5, z: 0.25, w: 0.24, h: 0.14, ry: 2.1, ring: 0.0, moss: 0.0 },     // 添え石
      { name: 'rock_moss_set_02_rock09', x: 0.78, z: 0.22, w: 0.22, h: 0.12, ry: 1.2, ring: 0.0, moss: 0.0 },    // 添え石
      { name: 'rock_moss_set_02_rock12', x: -1.25, z: 0.1, w: 0.3, h: 0.16, ry: 0.9, ring: 0.36, moss: 0.22 },
      { name: 'rock_moss_set_02_rock10', x: -0.2, z: 0.35, w: 0.26, h: 0.08, ry: 2.6, ring: 0.3, moss: 0.0 },   // 平たい石
    ]);
    this.buildWeather();
    pmrem.dispose();
  }

  buildLantern() {
    // 石灯籠（春日型を簡略化）
    const mat = this.rockMat;
    const grp = new THREE.Group();
    const add = (geo, y) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m); return m;
    };
    add(new THREE.CylinderGeometry(0.2, 0.23, 0.08, 6), 0.04);
    add(new THREE.CylinderGeometry(0.15, 0.2, 0.06, 6), 0.11);
    add(new THREE.CylinderGeometry(0.065, 0.075, 0.55, 16), 0.41);
    add(new THREE.CylinderGeometry(0.19, 0.11, 0.09, 6), 0.73);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 6), 0.875);
    this.lanternWindowMat = new THREE.MeshBasicMaterial({ color: 0xffc77a, transparent: true, opacity: 0.85 });
    for (const a of [0, Math.PI]) {
      const light = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.11), this.lanternWindowMat);
      light.position.set(Math.sin(a) * 0.114, 0.875, Math.cos(a) * 0.114);
      light.rotation.y = a;
      grp.add(light);
    }
    add(new THREE.ConeGeometry(0.33, 0.2, 6, 1), 1.06);
    add(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 6), 0.975);
    add(new THREE.SphereGeometry(0.05, 16, 12), 1.19);
    add(new THREE.ConeGeometry(0.04, 0.07, 12), 1.25);
    grp.position.set(-0.6, 0, -1.55);
    grp.rotation.y = 0.5;
    this.scene.add(grp);
    this.lamp = new THREE.PointLight(0xffb560, 0.25, 2.5, 1.6);
    this.lamp.position.set(-0.6, 0.88, -1.4);
    this.scene.add(this.lamp);
  }

  buildFence() {
    // 四つ目垣（竹垣）
    const m = this.bambooMaterials(17, ['#b6a46a', '#c4b27a'], 1);
    const grp = new THREE.Group();
    const vGeo = new THREE.CylinderGeometry(0.014, 0.015, 0.95, 12);
    for (let x = -2.6; x <= 2.6; x += 0.3) {
      const v = new THREE.Mesh(vGeo, m.outer);
      v.position.set(x, 0.475, 0);
      v.castShadow = true;
      grp.add(v);
    }
    const hGeo = new THREE.CylinderGeometry(0.012, 0.012, 5.4, 12);
    [[0.22, 1], [0.5, -1], [0.78, 1]].forEach(([y, side]) => {
      const h = new THREE.Mesh(hGeo, m.outer);
      h.rotation.z = Math.PI / 2;
      h.position.set(0, y, side * 0.026);
      h.castShadow = true;
      grp.add(h);
    });
    const knotMat = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.95 });
    const knotGeo = new THREE.SphereGeometry(0.018, 8, 6);
    for (let x = -2.6; x <= 2.6; x += 0.3) {
      for (const y of [0.22, 0.5, 0.78]) {
        const k = new THREE.Mesh(knotGeo, knotMat);
        k.position.set(x, y, 0);
        k.scale.set(1.2, 0.8, 1.6);
        grp.add(k);
      }
    }
    grp.position.set(0.4, 0, -5.4);
    this.scene.add(grp);
  }

  buildPlants() {
    const rnd = seeded(33);
    const { rocks, ferns } = this.assets;
    if (rocks) {
      const names = ['rock_moss_set_02_rock08', 'rock_moss_set_02_rock09', 'rock_moss_set_02_rock12', 'rock_moss_set_02_rock10', 'rock_moss_set_02_rock07'];
      const spots = [[1.05, 0.35, 0.12, 0.2], [-1.0, 0.3, 0.13, 1.4], [-1.7, -0.9, 0.3, 2.2], [1.95, -1.25, 0.28, 0.8], [2.35, 1.2, 0.2, 2.6]];
      spots.forEach(([x, z, s, ry], i) => {
        const src = rocks.scene.getObjectByName(names[i % names.length]);
        if (!src) return;
        const r = src.clone();
        r.position.set(x, -0.02, z);
        r.rotation.set(0, ry, 0);
        r.scale.setScalar(s);
        r.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(r);
      });
    }
    this.ferns = [];
    if (ferns) {
      const spots = [[-0.32, -0.62, 0.6], [1.3, -0.65, 0.6], [-1.6, 0.25, 0.9], [1.85, -0.45, 0.6], [-1.25, -1.35, 0.9], [2.4, 0.6, 0.6], [-2.3, 1.3, 0.6], [1.25, -1.45, 0.8]];
      spots.forEach(([x, z, s], i) => {
        const src = ferns.scene.children[i % ferns.scene.children.length];
        const f = src.clone();
        f.position.set(x, 0, z);
        f.rotation.y = rnd() * 6.28;
        f.scale.setScalar(s);
        f.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(f);
        this.ferns.push(f);
      });
    }
  }

  // ---------- 水しぶき・波紋・光の粒 ----------
  buildParticles() {
    this.dropMax = 300;
    this.drops = [];
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.02, transparent: true, opacity: 0.8, envMapIntensity: 2, clearcoat: 1 }),
      this.dropMax,
    );
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.scene.add(this.dropMesh);

    this.ripples = [];
    const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
    for (let i = 0; i < 24; i++) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe9f6ff, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.scene.add(ring);
      this.ripples.push({ mesh: ring, life: 1, max: 1, size: 0.1 });
    }

    this.sparkTex = glowTexture('rgba(255,225,150,1)');
    this.sparks = [];
    for (let i = 0; i < 80; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false;
      this.scene.add(sp);
      this.sparks.push({ sprite: sp, life: 1, max: 1, v: new THREE.Vector3() });
    }
  }

  // ---------- 小川と池：手水鉢からあふれた水が小川を流れ、奥の池へ ----------
  buildStreamAndPond() {
    const basin = this.units[0].basinW;
    const POND = new THREE.Vector3(0.38, 0, -1.2);
    this.pondCenter = POND;
    const rnd = seeded(77);

    // 手水鉢のふちからあふれる細い水
    this.overflowStart = new THREE.Vector3(basin.x - 0.01, 0.178, basin.z - 0.172);

    // 小川の道筋（手水鉢の右から、蛇行して奥の池へ）
    // 小川の道筋（手水鉢の奥から、ゆるく曲がって池へ）
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(basin.x - 0.02, 0, basin.z - 0.2),
      new THREE.Vector3(basin.x - 0.15, 0, basin.z - 0.4),
      new THREE.Vector3(basin.x - 0.05, 0, basin.z - 0.62),
      new THREE.Vector3(POND.x, 0, POND.z + 0.46),
      new THREE.Vector3(POND.x, 0, POND.z + 0.22),
    ]);
    const ribbon = (width, y, wobble = 0) => {
      const N = 90;
      const pos = [], uv = [], idx = [];
      let dist = 0, prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const n = new THREE.Vector3(-tan.z, 0, tan.x);
        if (prev) dist += p.distanceTo(prev);
        prev = p;
        const w = width * (0.85 + 0.25 * Math.sin(t * 17 + 1) + wobble * (rnd() - 0.5));
        const l = p.clone().addScaledVector(n, w / 2), r = p.clone().addScaledVector(n, -w / 2);
        pos.push(l.x, y, l.z, r.x, y, r.z);
        uv.push(0, dist / width, 1, dist / width);
        if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    // 川床（濡れた玉砂利）
    const bedMat = this.pbrMaterial(this.assets.pebbles, 1, { color: 0x6d6a5f, roughness: 0.6 });
    for (const t of [bedMat.map, bedMat.normalMap, bedMat.roughnessMap, bedMat.aoMap]) if (t) t.repeat.set(1, 1);
    const bed = new THREE.Mesh(ribbon(0.2, 0.004, 0.2), bedMat);
    bed.receiveShadow = true;
    this.scene.add(bed);
    // 流れる水面
    this.streamNormal = rippleNormal();
    this.streamNormal.repeat.set(1, 1);
    this.flowMat = new THREE.MeshPhysicalMaterial({
      color: 0x22392f, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.62,
      normalMap: this.streamNormal, normalScale: new THREE.Vector2(0.28, 0.28), envMapIntensity: 0.85, depthWrite: false,
    });
    const flow = new THREE.Mesh(ribbon(0.12, 0.012), this.flowMat);
    flow.receiveShadow = true;
    this.scene.add(flow);
    // 岸の小石
    const set = this.assets.rocks;
    const names = set ? set.scene.children.map((c) => c.name) : [];
    const addStone = (x, z, s, ry) => {
      if (!set) return;
      const src = set.scene.getObjectByName(names[Math.floor(rnd() * names.length)]);
      const r = src.clone();
      r.position.set(x, -0.01, z);
      r.rotation.set(0, ry, 0);
      r.scale.setScalar(s);
      r.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(r);
    };
    for (let i = 0; i < 16; i++) {
      const t = 0.06 + (i / 16) * 0.78;
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const n = new THREE.Vector3(-tan.z, 0, tan.x);
      const side = i % 2 ? 1 : -1;
      const q = p.clone().addScaledVector(n, side * (0.12 + rnd() * 0.04));
      addStone(q.x, q.z, 0.035 + rnd() * 0.035, rnd() * 6.28);
    }

    // 池（ゆがんだ円形）
    const shape = new THREE.Shape();
    const R = 0.46;
    const radius = (th) => R * (1 + 0.12 * Math.sin(3 * th + 1) + 0.07 * Math.sin(5 * th + 2));
    for (let i = 0; i <= 64; i++) {
      const th = (i / 64) * Math.PI * 2;
      const r = radius(th);
      const x = Math.cos(th) * r, y = Math.sin(th) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    this.pondRadius = radius;
    const mk = (scale, y, mat) => {
      const g = new THREE.ShapeGeometry(shape, 1);
      g.scale(scale, scale, 1);
      const m = new THREE.Mesh(g, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(POND.x, y, POND.z);
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    // 縁の玉砂利・池の底・水面
    const rimMat = this.pbrMaterial(this.assets.pebbles, 2.5, { color: 0x9a968a });
    mk(1.18, 0.003, rimMat);
    mk(1.0, 0.006, new THREE.MeshStandardMaterial({ color: 0x24261c, roughness: 0.95 }));
    this.pondNormal = rippleNormal();
    this.pondNormal.repeat.set(2.5, 2.5);
    this.pondMat = new THREE.MeshPhysicalMaterial({
      color: 0x172b26, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.66,
      normalMap: this.pondNormal, normalScale: new THREE.Vector2(0.06, 0.06), envMapIntensity: 0.6, depthWrite: false,
    });
    mk(1.0, 0.04, this.pondMat);
    // 池のまわりの石
    for (let i = 0; i < 14; i++) {
      const th = (i / 14) * Math.PI * 2 + rnd() * 0.2;
      if (Math.abs(th - 4.71) < 0.4) continue; // 小川の流れ込む口（手前）はあける
      const r = radius(th) * 1.1;
      addStone(POND.x + Math.cos(th) * r, POND.z - Math.sin(th) * r, 0.06 + rnd() * 0.07, rnd() * 6.28);
    }
    // 睡蓮の葉
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3f6b2a, roughness: 0.55, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.045 + rnd() * 0.03, 20, 0.3, Math.PI * 2 - 0.3), padMat);
      pad.rotation.set(-Math.PI / 2, 0, rnd() * 6.28);
      const th = rnd() * 6.28, r = radius(th) * (0.35 + rnd() * 0.45);
      pad.position.set(POND.x + Math.cos(th) * r, 0.042, POND.z - Math.sin(th) * r);
      pad.receiveShadow = true;
      this.scene.add(pad);
    }
    // 鯉
    this.koi = [];
    const koiColors = [[0xf27a1a, 0xffffff], [0xffffff, 0xd8331f], [0xe8b23a, 0xffffff]];
    koiColors.forEach(([c1, c2], i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: c1, roughness: 0.4 }));
      body.scale.set(0.055, 0.014, 0.018);
      g.add(body);
      const spot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: c2, roughness: 0.4 }));
      spot.scale.set(0.022, 0.0145, 0.0135);
      spot.position.x = 0.012;
      g.add(spot);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.035, 4), body.material);
      tail.rotation.z = Math.PI / 2;
      tail.scale.set(1, 1, 0.25);
      tail.position.x = -0.065;
      g.add(tail);
      this.scene.add(g);
      this.koi.push({ g, tail, r: 0.14 + i * 0.07, sp: 0.25 + i * 0.07, ph: i * 2.1, dir: i % 2 ? 1 : -1 });
    });

    // あふれ出る水の筋（手水鉢のふち → 小川）
    this.overflow = new THREE.Mesh(new THREE.BufferGeometry(), this.streamMat);
    this.scene.add(this.overflow);
    const o = this.overflowStart;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector3(o.x - 0.004 * t, o.y - 0.17 * t * t, o.z - 0.035 * t));
    }
    this.overflow.geometry = this.streamGeometry(pts, 0.006);
  }

  updatePond(dt) {
    if (!this.streamNormal) return;
    this.streamNormal.offset.set(0, -this.time * 0.6 * this.flowK);   // 川の流れ
    this.pondNormal.offset.set(this.time * 0.01, this.time * 0.006);
    const P = this.pondCenter;
    for (const k of this.koi) {
      const a = this.time * k.sp * k.dir + k.ph;
      const wob = 1 + 0.18 * Math.sin(this.time * 0.4 + k.ph);
      const x = P.x + Math.cos(a) * k.r * wob, z = P.z + Math.sin(a) * k.r * 0.8 * wob;
      k.g.position.set(x, 0.022, z);
      k.g.rotation.y = -a - (k.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      k.tail.rotation.y = Math.sin(this.time * 8 + k.ph) * 0.4;
    }
    // 小川の水音のかわりに、池にときどき波紋
    if (Math.random() < dt * 0.8) {
      const th = Math.random() * 6.28, r = this.pondRadius(th) * Math.random() * 0.7;
      this.ripple(P.x + Math.cos(th) * r, P.z - Math.sin(th) * r, 0.08, 0.04);
    }
    // 小川が池に流れ込むところ
    if (Math.random() < dt * 4) {
      this.ripple(P.x, P.z + 0.4, 0.05, 0.04);
    }
  }

  /** 池のほとりから茶室の沓脱石へ続く飛び石 */
  buildSteppingStones() {
    const rnd = seeded(91);
    const pts = [[0.0, -1.95], [0.32, -2.22], [0.62, -2.48], [0.98, -2.7], [1.18, -2.98]];
    for (const [x, z] of pts) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 9);
      const st = new THREE.Mesh(g, this.rockMat);
      st.scale.set(0.15 + rnd() * 0.04, 0.05, 0.12 + rnd() * 0.04);
      st.position.set(x, 0.02, z);
      st.rotation.y = rnd() * 3;
      st.castShadow = true; st.receiveShadow = true;
      this.scene.add(st);
    }
  }

  // ---------- PERFECT の演出（光の柱・衝撃波・桜吹雪） ----------
  buildPerfectFx() {
    // 光の柱：下から上へ薄れる縦グラデーション
    const pillarTex = canvasTexture(64, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ax = Math.exp(-(((x + 0.5) / w - 0.5) ** 2) / 0.018);        // 横：中心ほど明るい
        const vy = 1 - y / h;                                              // 縦：下ほど明るい
        const ay = Math.min(1, vy * 1.4) * (1 - Math.max(0, 0.15 - vy) / 0.15 * 0.6);
        const a = ax * ay;
        const i = (y * w + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 236 + 19 * ax; img.data[i + 2] = 190 + 65 * ax; img.data[i + 3] = 255 * a;
      }
      g.putImageData(img, 0, 0);
    });
    this.pillar = new THREE.Sprite(new THREE.SpriteMaterial({ map: pillarTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.pillar.center.set(0.5, 0);
    this.pillar.visible = false;
    this.scene.add(this.pillar);
    // 地面を走る金色の衝撃波
    this.shocks = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64),
        new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      this.shocks.push({ mesh: m, life: 1, max: 1, delay: 0 });
    }
    this.fxLife = 1;
    // 桜吹雪
    this.petals = [];
    const geo = new THREE.CircleGeometry(0.015, 6);
    geo.scale(1, 0.65, 1);
    const cols = [0xffd7e2, 0xffc2d3, 0xfbe3ea, 0xffb3c8];
    for (let i = 0; i < 90; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.6, emissive: 0xff9fb8, emissiveIntensity: 0.45 }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.petals.push({ mesh, life: 1, max: 1, v: new THREE.Vector3(), spin: new THREE.Vector3(), ph: 0 });
    }
  }

  perfectBurst(at, streak = 1) {
    this.fxAt = at.clone();
    this.fxLife = 0;
    this.pillar.visible = true;
    this.pillar.position.set(at.x, at.y - 0.05, at.z);
    this.shocks.forEach((sh, k) => {
      sh.life = 0; sh.max = 0.8; sh.delay = k * 0.12;
      sh.mesh.position.set(at.x, 0.012, at.z);
    });
    const n = Math.min(30 + streak * 10, 90);
    let c = 0;
    for (const p of this.petals) {
      if (c >= n) break;
      if (p.life < p.max) continue;
      p.life = 0; p.max = 2.2 + Math.random() * 1.2;
      p.mesh.position.copy(at).add(new THREE.Vector3(0, 0.08, 0));
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.1;
      p.v.set(Math.cos(a) * sp * 0.6, 0.9 + Math.random() * 1.3, Math.sin(a) * sp * 0.6);
      p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      p.ph = Math.random() * 6.28;
      p.mesh.visible = true;
      c++;
    }
    this.punch = 1;
  }

  updatePerfectFx(dt) {
    if (this.fxLife < 1) {
      this.fxLife = Math.min(1, this.fxLife + dt / 0.9);
      const k = this.fxLife;
      const w = 0.08 + 0.32 * Math.sin(Math.min(k * 2.2, 1) * Math.PI / 2);
      this.pillar.scale.set(w * (1 - k * 0.4), 1.1 + k * 0.9, 1);
      this.pillar.material.opacity = 0.85 * (1 - k) ** 1.4;
      if (k >= 1) this.pillar.visible = false;
    }
    for (const sh of this.shocks) {
      if (sh.life >= sh.max) { sh.mesh.visible = false; continue; }
      if (sh.delay > 0) { sh.delay -= dt; continue; }
      sh.life += dt;
      const k = sh.life / sh.max;
      sh.mesh.visible = true;
      sh.mesh.scale.setScalar(0.05 + k * 0.9);
      sh.mesh.material.opacity = 0.85 * (1 - k);
    }
    for (const p of this.petals) {
      if (p.life >= p.max) { p.mesh.visible = false; continue; }
      p.life += dt;
      // ふわりと舞い上がってから、ひらひらと落ちる
      p.v.y -= 2.2 * dt;
      p.v.multiplyScalar(1 - 1.6 * dt);
      p.v.y = Math.max(p.v.y, -0.22);
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.position.x += Math.sin(this.time * 3 + p.ph) * 0.05 * dt;
      if (p.mesh.position.y < 0.005) { p.mesh.position.y = 0.005; p.v.set(0, 0, 0); }
      p.mesh.rotation.set(this.time * p.spin.x * 0.4, this.time * p.spin.y * 0.4, this.time * p.spin.z * 0.4);
      p.mesh.material.opacity = 1;
    }
    this.punch = Math.max(0, (this.punch || 0) - dt * 2.2);
  }

  // ---------- 天候（雨・風・夜） ----------
  buildWeather() {
    // 雨：落ちる線
    const N = 900;
    this.rainN = N;
    const pos = new Float32Array(N * 6);
    this.rainDrops = Array.from({ length: N }, () => ({
      x: (Math.random() - 0.5) * 4, y: Math.random() * 3.2, z: (Math.random() - 0.5) * 4, v: 5 + Math.random() * 2,
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xd8e6ef, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);

    // 風：舞う葉
    this.leaves = [];
    const leafGeo = new THREE.PlaneGeometry(0.03, 0.018);
    const colors = [0x6f8f2e, 0x9a8a3a, 0xb07a2a, 0x58752a];
    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.8 }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.leaves.push({ mesh, p: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 1.5, (Math.random() - 0.5) * 3), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), ph: Math.random() * 6.28 });
    }

    // 夜：蛍
    this.fireflies = [];
    const ffTex = glowTexture('rgba(210,255,140,1)');
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ffTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      sp.scale.setScalar(0.035);
      this.scene.add(sp);
      this.fireflies.push({ sp, c: new THREE.Vector3((Math.random() - 0.5) * 3, 0.2 + Math.random() * 0.8, (Math.random() - 0.5) * 2.4 - 0.3), ph: Math.random() * 6.28, sp2: 0.3 + Math.random() * 0.5 });
    }
  }

  /** ギミックの切り替え（main.js から） */
  setGimmicks(g) {
    this.gimmicks = { ...this.gimmicks, ...g };
    this.units[0].sizeTarget = this.gimmicks.size;
    this.units[1].sizeTarget = this.gimmicks.size;
  }

  updateWeather(dt) {
    const g = this.gimmicks;
    const k = Math.min(dt * 0.8, 1);
    this.rainK += ((g.rain ? 1 : 0) - this.rainK) * k;
    this.windK += ((g.wind ? 1 : 0) - this.windK) * k;
    this.nightK += ((g.night ? 1 : 0) - this.nightK) * k;
    this.twinK += ((g.twin ? 1 : 0) - this.twinK) * k;
    this.flowK = 1 + this.rainK * 0.6;
    this.units[1].visibleK = this.twinK;

    // 光と空気
    const day = 1 - this.nightK;
    this.scene.environmentIntensity = (0.1 + 0.75 * day) * (1 - 0.3 * this.rainK);
    this.sun.intensity = (0.35 + 1.25 * day) * (1 - 0.6 * this.rainK);
    this.sun.color.copy(this.sunDay).lerp(this.sunNight, this.nightK);
    if (this.sky) {
      const b = (0.18 + 0.82 * day) * (1 - 0.3 * this.rainK);
      this.sky.material.color.setRGB(b * (1 - 0.15 * this.nightK), b, b * (1 + 0.25 * this.nightK));
    }
    this.scene.fog.color.copy(this.fogDay).lerp(this.fogRain, this.rainK * day).lerp(this.fogNight, this.nightK);
    this.scene.fog.near = lerp(9, 3, Math.max(this.rainK, this.nightK * 0.6));
    this.scene.fog.far = lerp(40, 14, Math.max(this.rainK, this.nightK * 0.5));
    this.lamp.intensity = 0.25 + this.nightK * 2.2;
    this.lanternWindowMat.opacity = 0.6 + this.nightK * 0.4;
    this.renderer.toneMappingExposure = 1.05 + this.nightK * 0.25;

    // 雨
    this.rain.visible = this.rainK > 0.01;
    if (this.rain.visible) {
      this.rainMat.opacity = 0.35 * this.rainK;
      const pos = this.rain.geometry.attributes.position.array;
      const cx = this.camTarget.x, cz = this.camTarget.z;
      const windX = this.windK * 0.8;
      this.rainDrops.forEach((d, i) => {
        d.y -= d.v * dt;
        d.x += windX * dt;
        if (d.y < 0) {
          d.y = 3 + Math.random() * 0.4;
          d.x = cx + (Math.random() - 0.5) * 4;
          d.z = cz + (Math.random() - 0.5) * 4;
        }
        const o = i * 6;
        pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z;
        pos[o + 3] = d.x - windX * 0.02; pos[o + 4] = d.y + 0.07; pos[o + 5] = d.z;
      });
      this.rain.geometry.attributes.position.needsUpdate = true;
      // 手水鉢の水面に雨粒の波紋
      for (const u of this.units) {
        if (u.visibleK < 0.5) continue;
        if (Math.random() < this.rainK * dt * 14) {
          const b = u.basinW;
          const a = Math.random() * 6.28, r = Math.random() * BASIN_WATER_R * 0.85;
          this.ripple(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r, 0.035, BASIN_WATER_Y);
        }
      }
    }
    this.groundMat.roughness = 1 - this.rainK * 0.4;

    // 風：シダが揺れ、葉が舞う
    this.ferns.forEach((f, i) => {
      f.rotation.z = Math.sin(this.time * (1.6 + i * 0.13) + i) * 0.07 * this.windK;
      f.rotation.x = Math.sin(this.time * (1.2 + i * 0.1) + i * 2) * 0.04 * this.windK;
    });
    for (const l of this.leaves) {
      l.mesh.visible = this.windK > 0.05;
      if (!l.mesh.visible) continue;
      l.p.x += (0.5 + 0.4 * Math.sin(this.time + l.ph)) * dt * this.windK;
      l.p.y += Math.sin(this.time * 2 + l.ph) * 0.15 * dt - 0.05 * dt;
      l.p.z += Math.cos(this.time * 0.7 + l.ph) * 0.1 * dt;
      if (l.p.x > 2.2 || l.p.y < 0.02) { l.p.set(-2.2, 0.3 + Math.random() * 1.2, (Math.random() - 0.5) * 3); }
      l.mesh.position.copy(l.p);
      l.mesh.rotation.set(this.time * l.spin.x * 0.3, this.time * l.spin.y * 0.3, this.time * l.spin.z * 0.3);
    }

    // 夜：蛍
    for (const f of this.fireflies) {
      const t = this.time * f.sp2 + f.ph;
      f.sp.position.set(f.c.x + Math.sin(t) * 0.25, f.c.y + Math.sin(t * 1.7) * 0.1, f.c.z + Math.cos(t * 0.8) * 0.25);
      f.sp.material.opacity = this.nightK * (0.4 + 0.6 * Math.max(0, Math.sin(t * 3)));
      f.sp.visible = this.nightK > 0.02;
    }
  }

  streamGeometry(points, radius) {
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, Math.max(points.length * 2, 8), radius, 8, false);
  }

  spawnDrops(at, n, { speed = 0.8, spread = 1.2, up = 1, size = 0.004 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= this.dropMax) this.drops.shift();
      const a = Math.random() * Math.PI * 2;
      const h = speed * (0.3 + Math.random() * 0.7);
      this.drops.push({
        p: at.clone(),
        v: new THREE.Vector3(Math.cos(a) * h * spread * 0.5, up * speed * (0.6 + Math.random() * 0.8), Math.sin(a) * h * spread * 0.5),
        r: size * (0.5 + Math.random()),
        life: 0,
      });
    }
  }

  ripple(x, z, size = 0.1, y = BASIN_WATER_Y) {
    const r = this.ripples.find((q) => q.life >= q.max) || this.ripples[0];
    r.life = 0; r.max = 1.1 + Math.random() * 0.4; r.size = size;
    r.mesh.position.set(x, y + 0.002, z);
    r.mesh.visible = true;
  }

  sparkle(at, n, color = 0xffe39a) {
    let k = 0;
    for (const s of this.sparks) {
      if (k >= n) break;
      if (s.life < s.max) continue;
      s.life = 0; s.max = 0.6 + Math.random() * 0.5;
      s.sprite.position.copy(at);
      s.sprite.material.color.set(color);
      s.v.set((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.9, (Math.random() - 0.5) * 1.2);
      s.sprite.visible = true;
      k++;
    }
  }

  // ---------- main.js から呼ばれる演出 API（i：鹿威しの番号） ----------
  splash(size = 1, i = 0) {
    if (!this.ready) return;
    const b = this.units[i].basinW;
    const at = new THREE.Vector3(b.x - 0.02, BASIN_WATER_Y, b.z);
    this.spawnDrops(at, Math.round(16 * size), { speed: 0.9 * Math.sqrt(size), spread: 1.4, size: 0.0045 });
    this.ripple(at.x, at.z, 0.12);
  }

  impact(strength = 1, i = 0) {
    if (!this.ready) return;
    const u = this.units[i];
    u.nudgeTube('bounce', strength);
    this.shake = Math.max(this.shake, 0.004 * strength);
    this.spawnDrops(u.contactW.add(new THREE.Vector3(0.02, 0.01, 0)), 5, { speed: 0.6, size: 0.003 });
  }

  judgeEffect(result, i = 0, streak = 1) {
    if (!this.ready) return;
    const at = this.units[i].contactW.add(new THREE.Vector3(0, 0.05, 0.03));
    if (result === 'PERFECT') {
      this.flash = 1;
      this.sparkle(at, 60);
      this.splash(2.2, i);
      this.shake = Math.max(this.shake, 0.014);
      this.perfectBurst(this.units[i].contactW, streak);
    } else if (result === 'GREAT') {
      this.sparkle(at, 12, 0xd8f5c8);
      this.splash(1.1, i);
    } else if (result === 'GOOD') {
      this.splash(0.6, i);
    } else {
      this.dark = 0.6;
    }
  }

  nudgeTube(kind, strength = 1, fill = 0, i = 0) {
    if (this.ready) this.units[i].nudgeTube(kind, strength, fill);
  }

  setMode(mode) { this.mode = mode; }

  /** 竹筒が石に当たる点の画面座標（タイミングリング用） */
  contactScreen(i = 0) {
    if (!this.ready) return null;
    const v = this.units[i].contactW.project(this.camera);
    if (v.z > 1) return null;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
  }

  // ---------- 毎フレーム ----------
  update(dt) {
    if (!this.ready) return;
    this.frameDt = dt;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.dark = Math.max(0, this.dark - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 0.03);

    const m = new THREE.Matrix4();
    let n = 0;
    this.drops = this.drops.filter((d) => {
      d.life += dt;
      d.v.y -= G * dt;
      d.p.addScaledVector(d.v, dt);
      for (const u of this.units) {
        const b = u.basinW;
        if (d.v.y < 0 && d.p.y < BASIN_WATER_Y && Math.hypot(d.p.x - b.x, d.p.z - b.z) < BASIN_WATER_R) {
          if (Math.random() < 0.25) this.ripple(d.p.x, d.p.z, 0.05);
          return false;
        }
      }
      return d.p.y > 0 && d.life < 2;
    });
    for (const d of this.drops) {
      m.makeScale(d.r, d.r * 1.3, d.r).setPosition(d.p);
      this.dropMesh.setMatrixAt(n++, m);
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;

    for (const r of this.ripples) {
      if (r.life >= r.max) { r.mesh.visible = false; continue; }
      r.life += dt;
      const k = r.life / r.max;
      r.mesh.scale.setScalar(Math.min(0.012 + k * r.size, BASIN_WATER_R));
      r.mesh.material.opacity = 0.35 * (1 - k);
    }
    for (const s of this.sparks) {
      if (s.life >= s.max) { s.sprite.visible = false; continue; }
      s.life += dt;
      s.v.y -= 0.6 * dt;
      s.sprite.position.addScaledVector(s.v, dt);
      const k = s.life / s.max;
      s.sprite.material.opacity = 1 - k;
      s.sprite.scale.setScalar(0.05 * (1 - k * 0.5));
    }

    this.waterNormal.offset.set(this.time * 0.013, this.time * 0.008);
    this.streamTex.offset.y = -this.time * 2.5 * this.flowK;
    this.updateWeather(dt);
    this.updatePerfectFx(dt);
    this.updatePond(dt);
    this.scenery.update(this.time, this.windK);
  }

  /** 端末が重いときは解像度と影の精度を自動で下げる */
  adaptQuality() {
    const now = performance.now();
    if (this.lastFrame) {
      this.frameAcc = (this.frameAcc || 0) + (now - this.lastFrame);
      this.frameCount = (this.frameCount || 0) + 1;
    }
    this.lastFrame = now;
    if (this.frameCount < 90) return;
    const avg = this.frameAcc / this.frameCount;
    this.frameAcc = 0; this.frameCount = 0;
    if (avg < 26) return;
    const pr = this.renderer.getPixelRatio();
    if (pr > 1) {
      this.renderer.setPixelRatio(Math.max(1, pr - 0.5));
      this.resize();
    } else if (this.sun && this.sun.shadow.mapSize.x > 1024) {
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /**
   * sims: ShishiOdoshi の配列（1本目、2本目）
   * glows: それぞれのタイミングの光（0〜1）
   */
  draw(sims, { glows = [] } = {}) {
    if (!this.ready) { this.renderer.clear(); return; }
    if (!document.hidden) this.adaptQuality();
    const dt = this.frameDt || 0.016;
    this.units.forEach((u, i) => { if (sims[i]) u.draw(sims[i], glows[i] || 0, dt); else u.group.visible = false; });

    // カメラ：ショット（ゆっくり回る・下から・遠くから・上から・茶室を背景に）をランダムに切り替える
    const shot = this.updateShot(dt);
    const el = this.cam.el;
    const az = this.cam.az;
    // 注視点：鹿威し（2本のときは2基の中間）
    const target = this.camTarget.clone();
    target.x += -0.5 * this.twinK;
    target.z += -0.18 * this.twinK;
    target.y -= 0.08 * Math.max(0, Math.sin(el) - 0.4);
    const baseTarget = target.clone();
    const punch = Math.sin(Math.min(this.punch || 0, 1) * Math.PI / 2);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const base = this.camDist * (1 - 0.12 * Math.max(0, Math.sin(el) - 0.3));
    // 鹿威し（石・竹筒の口・手水鉢）がすべて画面に収まる距離
    let fit = this.fitDistance(target, dir, base, null);
    if (!Number.isFinite(fit)) fit = base * 3.5;
    let need = Math.max(fit, base * this.cam.dist);
    // 茶室を背景にするショットでは、視線を上げて屋根まで入れる（左右にはずらさない）
    let lift = 0;
    const roof = shot.roof && this.teahouse && this.teahouse.fade > 0.5 ? this.teahouse.roofPoint : null;
    if (roof) {
      let best = Infinity;
      for (const dy of [0, 0.25, 0.5, 0.75, 1.0, 1.25]) {
        const d = this.fitDistance(target.clone().add(new THREE.Vector3(0, dy, 0)), dir, base, roof, 2.2);
        // 前回とほぼ同じなら前回の高さを使い続ける（揺れ防止）
        const score = Math.abs(dy - (this.cam.liftGoal ?? 0)) < 0.01 ? d * 0.93 : d;
        if (score < best) { best = score; lift = dy; this.cam.liftD = d; }
      }
      if (Number.isFinite(this.cam.liftD) && this.cam.liftD <= fit * 1.9) need = Math.max(need, this.cam.liftD);
      else lift = 0;
    }
    this.cam.liftGoal = lift;
    spring(this.cam, 'lift', lift, dt, 1.0);
    // 収まりきらないときはすぐ引く（石が画面から出ないように）。寄るときはゆっくり
    if (this.fitDist === undefined || this.fitDist < fit) { this.fitDist = Math.max(this.fitDist ?? fit, fit); }
    spring(this, 'fitDist', need, dt, 1.3);
    if (this.fitDist < fit) { this.fitDist = fit; }
    target.y += this.cam.lift;
    const dist = this.fitDist * (1 - 0.14 * punch);
    const cam = target.clone().addScaledVector(dir, dist);
    // 茶室・松を消す判定は、揺れ（演出）や視線の上げ下げの影響を受けない位置で行う
    const stableCam = baseTarget.clone().addScaledVector(dir, this.fitDist);
    if (this.shake > 0) {
      cam.x += (Math.random() - 0.5) * this.shake * dist * 0.6;
      cam.y += (Math.random() - 0.5) * this.shake * dist * 0.6;
    }
    this.camera.position.copy(cam);
    this.camera.lookAt(target);
    this.teahouse.update(dt, this.nightK, stableCam, baseTarget);
    this.pine.update(dt, this.time, this.windK, stableCam, baseTarget);

    this.renderer.render(this.scene, this.camera);

    if (this.fx) {
      const a = this.flash > 0 ? this.flash * 0.6 : 0;
      const d = this.dark * 0.55;
      // PERFECT：中心から金色に光る
      this.fx.style.background = a > 0
        ? `radial-gradient(circle at 50% 50%, rgba(255,246,214,${a}) 0%, rgba(255,214,120,${a * 0.6}) 45%, rgba(255,190,80,${a * 0.25}) 100%)`
        : d > 0 ? `rgba(0,0,0,${d})` : 'transparent';
    }
  }

  /**
   * カメラの動き：一周（方位）は一定の速さで左まわり。
   * 高さ（ローアングル⇔ハイアングル）と距離（近景⇔遠景）は、それぞれ別の周期でゆっくり行き来する。
   * 周期がそろわない（90秒・41秒・59秒）ので、一周ごとに違う角度・高さ・距離の組み合わせになる。
   */
  updateShot(dt) {
    const LAP = 90, EL_PERIOD = 41, DIST_PERIOD = 59;
    if (!this.cam) this.cam = { az: 0.25, t: 0, lift: 0, liftGoal: 0 };
    const c = this.cam;
    c.t += dt;
    c.az += dt * (Math.PI * 2 / LAP);                                         // 左まわり（上から見て反時計回り）
    c.el = 0.52 - 0.47 * Math.cos((c.t / EL_PERIOD) * Math.PI * 2);           // 0.05（地面すれすれ）〜0.99（見下ろし）
    c.dist = 1 + 0.55 * (1 - Math.cos((c.t / DIST_PERIOD) * Math.PI * 2 + 1.3)); // 1.0（近景）〜2.1（遠景）
    return { roof: true };
  }

  /**
   * 見せたい点がすべて画面内（HUD・下部の文字を避けた範囲）に入る最小の距離を二分探索で求める。
   * 石はタイミングの輪が切れないよう、さらに内側に収める。
   */
  fitDistance(target, dir, base, roof = null, maxScale = 3.5) {
    const pts = [];
    this.units.forEach((u) => {
      if (u.visibleK < 0.05) return;
      const c = u.contactW;
      pts.push({ p: c, m: 0.2 }, { p: c.clone().add(new THREE.Vector3(0, 0.06, 0)), m: 0.2 });   // 石（輪の分の余白）
      const o = u.origin;
      pts.push({ p: new THREE.Vector3(o.x + 0.45, 0.6, o.z), m: 0.04 });                         // 竹筒の口
      const b = u.basinW;
      pts.push({ p: new THREE.Vector3(b.x + 0.1, 0.15, b.z), m: 0.02 });                         // 手水鉢
    });
    const cam = this.camera;
    const fits = (d) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      for (const { p, m } of pts) {
        const v = p.clone().project(cam);
        if (v.z > 1 || Math.abs(v.x) > 0.92 - m || v.y > 0.6 - m || v.y < -0.7 + m) return false;
      }
      if (roof) {
        // 屋根の棟：画面の上の方に入っていればよい（左右は多少はみ出してもよい）
        const v = roof.clone().project(cam);
        if (v.z > 1 || v.y > 0.88 || Math.abs(v.x) > 1.05) return false;
      }
      return true;
    };
    if (fits(base)) return base;
    if (!fits(base * maxScale)) return Infinity;   // この条件では収まらない
    let lo = base, hi = base * maxScale;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const vHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hHalf = vHalf * this.camera.aspect;
    // 回り込んでも鹿威し・石・手水鉢が収まる距離
    const needW = 0.62, needH = 0.45;
    this.camDist = Math.max(needW / hHalf, needH / vHalf);
    this.camTarget.set(0.06, this.camera.aspect < 0.8 ? 0.36 : 0.32, 0);
    this.camera.updateProjectionMatrix();
  }
}
