// 3D の日本庭園と鹿威し（Three.js）
// 実写由来の素材（Poly Haven / CC0）と、プログラムで作る竹の質感を組み合わせる。
// 単位はメートル。鹿威しの竹筒は X 軸方向、支点を Z 軸まわりに回転させる。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { ANGLE_REST } from './shishi.js';

// ---------- 寸法 ----------
const PIVOT = new THREE.Vector3(0, 0.46, 0);
const TUBE_R = 0.045;          // 竹筒の半径（直径9cm）
const TUBE_WALL = 0.006;
const TUBE_BACK = -0.36;       // 石に当たる側（節で閉じている）
const TUBE_FRONT = 0.44;       // 水を受ける口
const TUBE_CUT = 0.11;         // 口を斜めに切った長さ
const SPOUT = new THREE.Vector3(0.375, 0.86, 0);   // 筧（かけい）の出口
const BASIN = new THREE.Vector3(0.36, 0, 0.02);   // 手水鉢
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
  const front = (cos) => xf - ((1 - cos) / 2) * cut;
  const cutN = new THREE.Vector3(1, -cut / (2 * r), 0).normalize();
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

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a3a2c');
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
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

    const [hdr, bg, ground, pebbles, rock, rocks, ferns, moss] = await Promise.all([
      new Promise((res) => hdrLoader.load(`${ASSET}hdri/mossy_forest_1k.hdr`, res, undefined, () => res(null))),
      new Promise((res) => texLoader.load(`${ASSET}hdri/mossy_forest_bg.jpg`, res, undefined, () => res(null))),
      pbr('aerial_grass_rock'), pbr('clean_pebbles'), pbr('mossy_rock'),
      gltf('rock_moss_set_02'), gltf('fern_02'), gltf('moss_01'),
    ]);
    this.assets = { hdr, bg, ground, pebbles, rock, rocks, ferns, moss };
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

  // ---------- シーン構築 ----------
  build() {
    const { scene, assets } = this;
    const pmrem = new THREE.PMREMGenerator(this.renderer);

    // 環境光（HDRI）と背景（実写の森を地面に投影）
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
    }
    scene.fog = new THREE.Fog(0x55684f, 9, 40);

    // 木漏れ日（影を落とす光）
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(-1.6, 3.2, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -1.8; sun.shadow.camera.right = 1.8;
    sun.shadow.camera.top = 1.8; sun.shadow.camera.bottom = -1.8;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 8;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    scene.add(sun);
    this.sun = sun;

    // 地面：苔
    const groundMat = this.pbrMaterial(assets.ground, 7, { alphaMap: radialAlpha(0.55), transparent: true, depthWrite: true });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 手水鉢のまわりの玉砂利
    const pebMat = this.pbrMaterial(assets.pebbles, 1.6, { color: 0xb8b4a8, alphaMap: radialAlpha(0.7), transparent: true, polygonOffset: true, polygonOffsetFactor: -1 });
    const peb = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), pebMat);
    peb.rotation.x = -Math.PI / 2;
    peb.position.set(BASIN.x + 0.02, 0.002, BASIN.z + 0.05);
    peb.receiveShadow = true;
    scene.add(peb);

    this.rockMat = this.pbrMaterial(assets.rock, 1.5);
    this.buildShishi();
    this.buildSpout();
    this.buildBasin();
    this.buildStrikeStone();
    this.buildLantern();
    this.buildFence();
    this.buildPlants();
    this.buildEffects();
    pmrem.dispose();
  }

  bambooMaterials(seed, base, aged = 0) {
    const outer = new THREE.MeshPhysicalMaterial({
      map: bambooTexture(seed, base, aged), roughness: 0.55 + aged * 0.2, clearcoat: 0.15, clearcoatRoughness: 0.5,
      envMapIntensity: 0.45, specularIntensity: 0.35,
    });
    const inner = new THREE.MeshStandardMaterial({ color: aged ? 0x8a7a55 : 0xb7ab78, roughness: 0.9, side: THREE.FrontSide });
    const rim = new THREE.MeshStandardMaterial({ color: aged ? 0xb9a77a : 0xdcd3a2, roughness: 0.8 });
    return { outer, inner, rim };
  }

  buildShishi() {
    const m = this.bambooMaterials(3, ['#6a8a2c', '#86a23c']);
    this.bamboo = m;
    const geo = bambooTubeGeometry({ r: TUBE_R, wall: TUBE_WALL, xb: TUBE_BACK, xf: TUBE_FRONT, cut: TUBE_CUT });
    const tube = new THREE.Mesh(geo, [m.outer, m.inner, m.rim, m.outer]);
    tube.castShadow = true;
    tube.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.position.copy(PIVOT);
    pivot.add(tube);
    for (const x of [-0.14, 0.17]) pivot.add(nodeRing(TUBE_R, x, m.outer));
    // 筒の中の水面
    this.innerWater = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshPhysicalMaterial({ color: 0x5a7f80, roughness: 0.05, transparent: true, opacity: 0.85 }),
    );
    this.innerWater.visible = false;
    this.scene.add(this.innerWater);
    // 支点の軸
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b2f22, roughness: 0.6 }));
    pin.rotation.x = Math.PI / 2;
    pin.position.copy(PIVOT);
    pin.castShadow = true;
    this.scene.add(pin);
    this.scene.add(pivot);
    this.pivot = pivot;

    // 支柱（古びた太めの竹）
    const postMat = this.bambooMaterials(23, ['#8d8a55', '#a19a62'], 0.6).outer;
    for (const z of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.023, 0.56, 16), postMat);
      post.position.set(0, 0.28, z * (TUBE_R + 0.03));
      post.castShadow = true; post.receiveShadow = true;
      this.scene.add(post);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), new THREE.MeshStandardMaterial({ color: 0xcbbd8c, roughness: 0.9 }));
      cap.rotation.x = -Math.PI / 2; cap.position.set(0, 0.5601, z * (TUBE_R + 0.03));
      this.scene.add(cap);
    }
  }

  buildSpout() {
    // 筧：右奥から流れてくる竹
    const m = this.bambooMaterials(9, ['#8a9a4a', '#a0a85c'], 0.35);
    const len = 1.5;
    // 口（開口部）が x=0、閉じた節が x=-len。Y軸で180°回して口から右へ伸ばす
    const geo = bambooTubeGeometry({ r: 0.022, wall: 0.004, xb: -len, xf: 0, cut: 0, radial: 24, segs: 8 });
    const pipe = new THREE.Mesh(geo, [m.outer, m.inner, m.rim, m.outer]);
    pipe.rotation.y = Math.PI;
    pipe.castShadow = true;
    const grp = new THREE.Group();
    grp.add(pipe);
    grp.position.set(SPOUT.x, SPOUT.y + 0.006, SPOUT.z);
    grp.rotation.y = 0.35;      // 右奥へ伸びる
    grp.rotation.z = 0.03;      // 口に向かってわずかに下る
    this.scene.add(grp);
    // 支え（交差した竹）
    const legMat = m.outer;
    const base = new THREE.Vector3(SPOUT.x + 0.6 * Math.cos(0.35), 0, -0.6 * Math.sin(0.35));
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 1.0, 12), legMat);
      leg.position.set(base.x + s * 0.09, 0.45, base.z);
      leg.rotation.z = s * 0.2;
      leg.castShadow = true;
      this.scene.add(leg);
    }
    // 結び縄
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.9 }));
    rope.position.set(base.x, 0.87, base.z);
    rope.rotation.y = Math.PI / 2 + 0.35;
    this.scene.add(rope);
  }

  buildBasin() {
    // 手水鉢（石をくり抜いた鉢）
    const prof = [
      [0.0, 0.0], [0.19, 0.0], [0.215, 0.04], [0.21, 0.11], [0.195, 0.16], [0.18, 0.178],
      [0.155, 0.182], [0.138, 0.172], [0.13, 0.14], [0.11, 0.1], [0.06, 0.085], [0.0, 0.082],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 64);
    const p = geo.attributes.position;
    const rnd = seeded(21);
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
    const basinMat = this.pbrMaterial(this.assets.rock, 1);
    basinMat.aoMap = null;
    for (const t of [basinMat.map, basinMat.normalMap, basinMat.roughnessMap]) if (t) t.repeat.set(2, 0.8);
    const basin = new THREE.Mesh(geo, basinMat);
    basin.position.copy(BASIN);
    basin.castShadow = true; basin.receiveShadow = true;
    this.scene.add(basin);

    // 水面
    this.waterNormal = rippleNormal();
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x14241f, roughness: 0.1, metalness: 0, normalMap: this.waterNormal,
      normalScale: new THREE.Vector2(0.06, 0.06), envMapIntensity: 0.8,
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(BASIN_WATER_R + 0.012, 48), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(BASIN.x, BASIN_WATER_Y, BASIN.z);
    water.receiveShadow = true;
    this.scene.add(water);
  }

  buildStrikeStone() {
    // 竹筒の後端が石に乗る位置を計算し、そこへ石の上面を合わせる
    const contactLocal = new THREE.Vector3(TUBE_BACK + 0.03, -TUBE_R, 0);
    const contact = contactLocal.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -ANGLE_REST).add(PIVOT);
    this.contact = contact;
    const set = this.assets.rocks;
    let stone = null;
    if (set) {
      const src = set.scene.getObjectByName('rock_moss_set_02_rock11') || set.scene.children[0];
      const rock = src.clone();
      rock.position.set(0, 0, 0);   // セット内での配置位置を打ち消す
      rock.rotation.set(0, 0.6, 0);
      rock.scale.setScalar(1);
      rock.updateMatrixWorld(true);
      // 底面の中心が原点に来るよう子として配置し、外側のグループで拡大縮小する
      const box = new THREE.Box3().setFromObject(rock);
      const c = box.getCenter(new THREE.Vector3());
      rock.position.set(-c.x, -box.min.y, -c.z);
      stone = new THREE.Group();
      stone.add(rock);
      const sink = 0.03;            // 少し地面に埋める
      const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const hs = 0.34 / width;      // 横幅は約34cm
      stone.position.set(contact.x - 0.03, 0, contact.z);
      stone.scale.set(hs, 1, hs);
      stone.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(contact.x, 5, contact.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(stone, true)[0];
      const h1 = hit ? hit.point.y : box.max.y - box.min.y;
      stone.scale.y = (contact.y + sink) / h1;
      stone.position.y = -sink;
    } else {
      stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 1), this.rockMat);
      stone.scale.set(1.2, 1, 1);
      stone.position.set(contact.x, contact.y - 0.16, contact.z);
    }
    stone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(stone);
  }

  buildLantern() {
    // 石灯籠（春日型を簡略化）
    const mat = this.rockMat;
    const grp = new THREE.Group();
    const add = (geo, y, rotY = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y; m.rotation.y = rotY;
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m); return m;
    };
    add(new THREE.CylinderGeometry(0.2, 0.23, 0.08, 6), 0.04);
    add(new THREE.CylinderGeometry(0.15, 0.2, 0.06, 6), 0.11);
    add(new THREE.CylinderGeometry(0.065, 0.075, 0.55, 16), 0.41);
    add(new THREE.CylinderGeometry(0.19, 0.11, 0.09, 6), 0.73);
    // 火袋
    const box = add(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 6), 0.875);
    box.scale.set(1, 1, 1);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xffc77a, transparent: true, opacity: 0.85 }));
    light.position.set(0, 0.875, 0.114);
    grp.add(light);
    // 笠
    const roof = add(new THREE.ConeGeometry(0.33, 0.2, 6, 1), 1.06);
    roof.scale.set(1, 1, 1);
    add(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 6), 0.975);
    add(new THREE.SphereGeometry(0.05, 16, 12), 1.19);
    add(new THREE.ConeGeometry(0.04, 0.07, 12), 1.25);
    grp.position.set(-0.82, 0, -1.05);
    grp.rotation.y = 0.5;
    this.scene.add(grp);
    const lamp = new THREE.PointLight(0xffb560, 0.25, 1.4, 2);
    lamp.position.set(-0.82, 0.88, -0.9);
    this.scene.add(lamp);
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
    // 黒い棕櫚縄の結び目
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
    grp.position.set(0.1, 0, -1.55);
    this.scene.add(grp);
  }

  buildPlants() {
    const rnd = seeded(33);
    const { rocks, ferns, moss } = this.assets;

    // 庭石
    if (rocks) {
      const names = ['rock_moss_set_02_rock08', 'rock_moss_set_02_rock09', 'rock_moss_set_02_rock12', 'rock_moss_set_02_rock10', 'rock_moss_set_02_rock07'];
      const spots = [[0.78, -0.02, 0.15, 0.2], [-0.72, 0.22, 0.13, 1.4], [-1.45, -0.6, 0.3, 2.2], [1.25, -0.9, 0.28, 0.8], [0.15, -0.95, 0.2, 2.6]];
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

    // シダ
    if (ferns) {
      const spots = [[-0.55, -0.45, 0.7], [0.95, -0.45, 0.8], [-1.3, 0.2, 0.9], [1.5, -0.2, 0.75], [-0.15, -1.2, 0.9], [0.65, 0.55, 0.45]];
      spots.forEach(([x, z, s], i) => {
        const src = ferns.scene.children[i % ferns.scene.children.length];
        const f = src.clone();
        f.position.set(x, 0, z);
        f.rotation.y = rnd() * 6.28;
        f.scale.setScalar(s);
        f.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(f);
      });
    }

    // 苔の小さな株を石や鉢の根元に散らす
    if (moss) {
      const meshes = [];
      moss.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const centers = [
        [this.contact.x, 0, 0, 0.32, 70], [BASIN.x, BASIN.z, 0, 0.32, 70], [0, 0, 0, 0.16, 30],
        [-0.72, 0.22, 0, 0.25, 40], [0.78, -0.02, 0, 0.25, 40], [-0.82, -1.05, 0, 0.35, 50],
      ];
      const dummy = new THREE.Object3D();
      meshes.forEach((mesh, mi) => {
        const per = [];
        centers.forEach(([cx, cz, , rad, n]) => {
          for (let k = 0; k < Math.ceil(n / meshes.length) + 1; k++) {
            const a = rnd() * Math.PI * 2;
            const d = rad * (0.75 + rnd() * 0.45);
            per.push([cx + Math.cos(a) * d, cz + Math.sin(a) * d]);
          }
        });
        const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, per.length);
        per.forEach(([x, z], i) => {
          dummy.position.set(x, 0, z);
          dummy.rotation.set(0, rnd() * 6.28, 0);
          dummy.scale.setScalar(1.6 + rnd() * 2.2);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        });
        inst.receiveShadow = true;
        this.scene.add(inst);
        void mi;
      });
    }
  }

  // ---------- 水と演出 ----------
  buildEffects() {
    const sTex = streamTexture();
    sTex.repeat.set(1, 3);
    this.streamTex = sTex;
    this.streamMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff2ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.7,
      alphaMap: sTex, envMapIntensity: 1.6, clearcoat: 1, depthWrite: false,
    });
    this.spoutStream = new THREE.Mesh(new THREE.BufferGeometry(), this.streamMat);
    this.pourStream = new THREE.Mesh(new THREE.BufferGeometry(), this.streamMat);
    this.scene.add(this.spoutStream, this.pourStream);

    // 水滴
    this.dropMax = 260;
    this.drops = [];
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.02, transparent: true, opacity: 0.8, envMapIntensity: 2, clearcoat: 1 }),
      this.dropMax,
    );
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.scene.add(this.dropMesh);

    // 波紋
    this.ripples = [];
    const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
    for (let i = 0; i < 14; i++) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe9f6ff, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = BASIN_WATER_Y + 0.002;
      ring.visible = false;
      this.scene.add(ring);
      this.ripples.push({ mesh: ring, life: 1, max: 1, size: 0.1 });
    }

    // 光の粒（PERFECT など）
    this.sparkTex = glowTexture('rgba(255,225,150,1)');
    this.sparks = [];
    for (let i = 0; i < 40; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false;
      this.scene.add(sp);
      this.sparks.push({ sprite: sp, life: 1, max: 1, v: new THREE.Vector3() });
    }

    // タイミングが近づいたときの控えめな光
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,215,130,1)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    this.halo.scale.setScalar(0.45);
    this.halo.position.copy(this.contact).add(new THREE.Vector3(0, 0.02, 0.05));
    this.scene.add(this.halo);
    this.glowLight = new THREE.PointLight(0xffd27a, 0, 0.9, 2);
    this.glowLight.position.copy(this.contact).add(new THREE.Vector3(0.02, 0.12, 0.15));
    this.scene.add(this.glowLight);
  }

  streamGeometry(points, radius) {
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, Math.max(points.length * 2, 8), radius, 8, false);
  }

  /** 放物線の水流（x0,y0 から vx で流れ出て targetY まで落ちる） */
  arc(x0, y0, z0, vx, targetY, n = 10) {
    const pts = [];
    const tEnd = Math.sqrt(Math.max(2 * (y0 - targetY), 0.0001) / G);
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * tEnd;
      pts.push(new THREE.Vector3(x0 + vx * t, y0 - 0.5 * G * t * t, z0));
    }
    return pts;
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

  ripple(x, z, size = 0.1) {
    const r = this.ripples.find((q) => q.life >= q.max) || this.ripples[0];
    r.life = 0; r.max = 1.1 + Math.random() * 0.4; r.size = size;
    r.mesh.position.x = x; r.mesh.position.z = z;
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

  // ---------- main.js から呼ばれる演出 API ----------
  splash(size = 1) {
    if (!this.ready) return;
    const at = new THREE.Vector3(BASIN.x - 0.02, BASIN_WATER_Y, BASIN.z);
    this.spawnDrops(at, Math.round(16 * size), { speed: 0.9 * Math.sqrt(size), spread: 1.4, size: 0.0045 });
    this.ripple(at.x, at.z, 0.12);
  }

  impact(strength = 1) {
    if (!this.ready) return;
    this.shake = Math.max(this.shake, 0.004 * strength);
    this.spawnDrops(this.contact.clone().add(new THREE.Vector3(0.02, 0.01, 0)), 5, { speed: 0.6, size: 0.003 });
  }

  judgeEffect(result) {
    if (!this.ready) return;
    const at = this.contact.clone().add(new THREE.Vector3(0, 0.05, 0.03));
    if (result === 'PERFECT') {
      this.flash = 1;
      this.sparkle(at, 26);
      this.splash(1.6);
      this.shake = Math.max(this.shake, 0.008);
    } else if (result === 'GREAT') {
      this.sparkle(at, 12, 0xd8f5c8);
      this.splash(1.1);
    } else if (result === 'GOOD') {
      this.splash(0.6);
    } else {
      this.dark = 0.6;
    }
  }

  setMode(mode) { this.mode = mode; }

  // ---------- 毎フレーム ----------
  update(dt) {
    if (!this.ready) return;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.dark = Math.max(0, this.dark - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 0.03);

    // 水滴
    const m = new THREE.Matrix4();
    let n = 0;
    this.drops = this.drops.filter((d) => {
      d.life += dt;
      d.v.y -= G * dt;
      d.p.addScaledVector(d.v, dt);
      const inBasin = Math.hypot(d.p.x - BASIN.x, d.p.z - BASIN.z) < BASIN_WATER_R;
      if (d.v.y < 0 && inBasin && d.p.y < BASIN_WATER_Y) {
        if (Math.random() < 0.25) this.ripple(d.p.x, d.p.z, 0.05);
        return false;
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
      const s = Math.min(0.012 + k * r.size, BASIN_WATER_R);
      r.mesh.scale.setScalar(s);
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

    // 水面のさざ波
    this.waterNormal.offset.set(this.time * 0.013, this.time * 0.008);
    this.streamTex.offset.y = -this.time * 2.5;
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

  draw(shishi, { glow = 0 } = {}) {
    if (!this.ready) { this.renderer.clear(); return; }
    if (!document.hidden) this.adaptQuality();
    const rot = -shishi.angle;
    this.pivot.rotation.z = rot;

    // 竹筒の中の水面（口から見える）
    const fill = shishi.fill;
    if (fill > 0.15 && shishi.phase === 'fill') {
      const lx = TUBE_FRONT - TUBE_CUT * 0.75;
      const w = new THREE.Vector3(lx, -TUBE_R + 2 * TUBE_R * Math.min(fill, 0.9) * 0.6, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), rot).add(PIVOT);
      this.innerWater.position.copy(w);
      this.innerWater.rotation.set(-Math.PI / 2, 0, 0);
      this.innerWater.scale.set(TUBE_CUT * 0.45, (TUBE_R - TUBE_WALL) * 0.9, 1);
      this.innerWater.visible = true;
    } else this.innerWater.visible = false;

    // 筧からの水流：竹筒の口に落ちるか、傾いていれば鉢へ
    const cosR = Math.cos(rot), tanR = Math.tan(rot);
    const vx = -0.32;
    const sx = SPOUT.x - 0.005;
    const sy = SPOUT.y - 0.012;
    const hitX = sx + vx * 0.1;
    const localX = (hitX - PIVOT.x) / cosR;
    const centerY = PIVOT.y + tanR * (hitX - PIVOT.x);
    let target = BASIN_WATER_Y;
    if (localX > TUBE_FRONT - TUBE_CUT - 0.02 && localX < TUBE_FRONT + 0.01 && rot > 0) target = centerY;
    else if (localX > TUBE_BACK && localX < TUBE_FRONT) target = centerY + TUBE_R / cosR;
    const spoutPts = this.arc(sx, sy, SPOUT.z, vx, target, 8);
    this.spoutStream.geometry.dispose();
    this.spoutStream.geometry = this.streamGeometry(spoutPts, 0.0032);
    if (Math.random() < 0.35) {
      const end = spoutPts[spoutPts.length - 1];
      this.spawnDrops(end, 1, { speed: 0.35, size: 0.0025 });
    }

    // 竹筒からこぼれる水
    if (shishi.phase === 'pour' && fill > 0.02) {
      const lip = new THREE.Vector3(TUBE_FRONT - 0.02, -TUBE_R * 0.55, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rot).add(PIVOT);
      const pts = this.arc(lip.x, lip.y, 0, 0.55, BASIN_WATER_Y, 8);
      this.pourStream.geometry.dispose();
      this.pourStream.geometry = this.streamGeometry(pts, 0.006 + fill * 0.012);
      this.pourStream.visible = true;
      const end = pts[pts.length - 1];
      if (Math.random() < 0.8) this.spawnDrops(end, 2, { speed: 0.9, size: 0.004 });
      if (Math.random() < 0.3) this.ripple(end.x, end.z, 0.12);
    } else {
      this.pourStream.visible = false;
    }

    // 光
    this.halo.material.opacity = glow * 0.75;
    this.glowLight.intensity = glow * 0.9;

    // カメラ（タイトルではゆっくり回り込む）
    const az = this.mode === 'title' ? Math.sin(this.time * 0.12) * 0.25 + 0.25 : 0.22;
    const el = this.mode === 'title' ? 0.16 : 0.14;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const cam = this.camTarget.clone().addScaledVector(dir, this.camDist);
    cam.x += Math.sin(this.time * 0.7) * 0.004;
    cam.y += Math.sin(this.time * 0.5) * 0.003;
    if (this.shake > 0) {
      cam.x += (Math.random() - 0.5) * this.shake * this.camDist * 0.6;
      cam.y += (Math.random() - 0.5) * this.shake * this.camDist * 0.6;
    }
    this.camera.position.copy(cam);
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);

    // 画面効果（PERFECT のフラッシュ、MISS の暗転）
    if (this.fx) {
      const a = this.flash > 0 ? this.flash * 0.45 : 0;
      const d = this.dark * 0.55;
      this.fx.style.background = a > 0 ? `rgba(255,250,235,${a})` : d > 0 ? `rgba(0,0,0,${d})` : 'transparent';
    }
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 縦長の画面でも鹿威し・石・手水鉢が収まる距離
    const vHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hHalf = vHalf * this.camera.aspect;
    const needW = 0.6, needH = 0.42;
    this.camDist = Math.max(needW / hHalf, needH / vHalf);
    // 縦長では上下に余白ができるので、鹿威しを少し下げて HUD と重ならないようにする
    this.camTarget.x = 0.04;
    this.camTarget.y = this.camera.aspect < 0.8 ? 0.42 : 0.36;
    this.camera.updateProjectionMatrix();
  }
}
