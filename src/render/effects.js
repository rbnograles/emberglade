import * as THREE from 'three';

const dummy = new THREE.Object3D();

// by the first word of the object's id: wood for trees, grey for stone, leaf green, earth, brick red, coral
const HIT_COLORS = { tree: 0x8a5a34, rock: 0x9a9fa6, boulder: 0x9a9fa6, pebble: 0x9a9fa6, stone: 0x9a9fa6, slate: 0x6f7c8c, soil: 0x8f633f, dirt: 0x8f633f, bush: 0x6cc257, tallgrass: 0x6cc257, flower: 0x6cc257, brick: 0xb86e50, tile: 0xc9603f, coral: 0xf0728a };

// Pure presentation choice shared by the renderer and tests.
export function hitEffect(object = '', destroyed = false) {
  const family = object.split('_')[0];
  return {
    color: HIT_COLORS[family] ?? 0xa8743c,
    cubes: destroyed ? 16 : 6,
    sparks: destroyed ? 10 : 4,
  };
}

// Little cubes that burst out when something is hit or picked.
export class Particles {
  constructor(scene, count = 96) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshLambertMaterial(), count);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: count }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.next = 0;
    this.color = new THREE.Color();
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, this.color);
    scene.add(this.mesh);
  }

  burst(x, y, z, hex, n = 8) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.items.length;
      const it = this.items[i];
      it.life = 0.5 + Math.random() * 0.3;
      it.p.set(x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.5);
      it.v.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
      this.mesh.setColorAt(i, this.color.setHex(hex));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    this.items.forEach((it, i) => {
      if (it.life > 0) {
        it.life -= dt;
        it.v.y -= 12 * dt;
        it.p.addScaledVector(it.v, dt);
      }
      dummy.position.copy(it.p);
      dummy.scale.setScalar(it.life > 0 ? Math.min(1, it.life * 4) : 0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const LIGHTS = 3, FLAMES = 8;

// Flickering flames on campfires, with point lights on the nearest few.
export class Fires {
  constructor(scene) {
    this.lights = [];
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 14, 1.4);
      scene.add(l);
      this.lights.push(l);
    }
    this.flames = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < FLAMES; i++) {
      const g = new THREE.Group();
      const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
      const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe27a }));
      g.add(outer, inner);
      g.visible = false;
      scene.add(g);
      this.flames.push({ g, outer, inner });
    }
  }

  update(fires, px, pz, t, night) {
    fires.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    this.flames.forEach((f, i) => {
      const fire = fires[i];
      f.g.visible = !!fire && !fire.lantern; // lanterns glow without a flame
      if (!fire || fire.lantern) return;
      const flick = Math.sin(t * 11 + i * 2) * 0.5 + Math.sin(t * 17 + i) * 0.5;
      f.g.position.set(fire.x, fire.y + 0.3, fire.z);
      f.outer.scale.set(0.3, 0.45 + flick * 0.08, 0.3);
      f.outer.position.y = 0.2 + flick * 0.04;
      f.inner.scale.set(0.16, 0.3 + flick * 0.1, 0.16);
      f.inner.position.y = 0.16;
      f.g.rotation.y = t * 1.5 + i;
    });
    this.lights.forEach((l, i) => {
      const fire = fires[i];
      if (!fire) {
        l.intensity = 0;
        return;
      }
      l.position.set(fire.x, fire.y + 1.1, fire.z);
      l.color.setHex(fire.lantern ? 0xbfefff : 0xff8a3a);
      l.intensity = (fire.lantern ? 0.8 : 1) * (night ? 11 : 3) * (1 + Math.sin(t * 13 + i * 3) * 0.08);
    });
  }
}

const SQUARE_URL = new URL('../../assets/kenney_voxel-pack/PNG/Particles/square_white.png', import.meta.url).href;
const SWIRL_URL = new URL('../../assets/kenney_voxel-pack/PNG/Particles/swirl_white.png', import.meta.url).href;

// Flat pixel sprites that always face the camera: square sparks that fly out and fall, and swirls
// that drift upward turning. They mark the moments that matter (a level gained, a goal done, a blow
// landed, treasure opened, a keeper stirring) on top of the little cubes used for everyday hits.
export class Sparks {
  constructor(scene, count = 160) {
    const load = (url) => {
      const t = new THREE.TextureLoader().load(url);
      t.magFilter = t.minFilter = THREE.NearestFilter; // keep the pixels crisp
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    this.maps = { square: load(SQUARE_URL), swirl: load(SWIRL_URL) };
    this.items = Array.from({ length: count }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.maps.square, transparent: true, depthWrite: false, fog: false }));
      sprite.visible = false;
      sprite.renderOrder = 6;
      scene.add(sprite);
      return { sprite, life: 0, span: 1, v: new THREE.Vector3(), gravity: 0, spin: 0, size: 0.2 };
    });
    this.next = 0;
  }

  // One particle. kind: 'square' or 'swirl'. gravity pulls it down; spin turns the sprite as it flies.
  one(kind, x, y, z, hex, { vx = 0, vy = 0, vz = 0, life = 0.7, size = 0.22, gravity = 0, spin = 0 } = {}) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.sprite.material.map = this.maps[kind];
    it.sprite.material.color.setHex(hex);
    it.sprite.material.rotation = Math.random() * Math.PI * 2;
    it.sprite.position.set(x, y, z);
    it.sprite.visible = true;
    it.v.set(vx, vy, vz);
    it.life = it.span = life;
    it.size = size;
    it.gravity = gravity;
    it.spin = spin;
  }

  // Square sparks thrown outward from a point, falling back down: a blow landing.
  burst(x, y, z, hex, n = 10, force = 3.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, f = force * (0.4 + Math.random() * 0.6);
      this.one('square', x, y, z, hex, { vx: Math.cos(a) * f, vy: 1.5 + Math.random() * 3, vz: Math.sin(a) * f, life: 0.45 + Math.random() * 0.3, size: 0.14 + Math.random() * 0.12, gravity: 11, spin: (Math.random() - 0.5) * 10 });
    }
  }

  // Swirls rising in a ring around a point: something good has happened here.
  rise(x, y, z, hex, n = 14, radius = 0.7, height = 2.2) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = radius * (0.7 + Math.random() * 0.5);
      this.one('swirl', x + Math.cos(a) * r, y + Math.random() * 0.5, z + Math.sin(a) * r, hex, {
        vx: -Math.sin(a) * 0.9, vy: height * (0.5 + Math.random() * 0.5), vz: Math.cos(a) * 0.9,
        life: 0.9 + Math.random() * 0.6, size: 0.26 + Math.random() * 0.16, spin: 3 + Math.random() * 3,
      });
    }
  }

  // A single slow mote drifting up: a beacon, or a keeper gathering itself.
  mote(x, y, z, hex, spread = 0.4) {
    this.one('swirl', x + (Math.random() - 0.5) * spread * 2, y, z + (Math.random() - 0.5) * spread * 2, hex, {
      vy: 0.9 + Math.random() * 0.8, life: 1.1 + Math.random() * 0.7, size: 0.2 + Math.random() * 0.12, spin: 2.5,
    });
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) {
        it.sprite.visible = false;
        continue;
      }
      it.v.y -= it.gravity * dt;
      it.sprite.position.addScaledVector(it.v, dt);
      it.sprite.material.rotation += it.spin * dt;
      const k = it.life / it.span; // 1 -> 0
      // pop in quickly, then shrink and fade away
      const s = it.size * Math.min(1, (1 - k) * 8) * (0.45 + 0.55 * k);
      it.sprite.scale.set(s, s, 1);
      it.sprite.material.opacity = Math.min(1, k * 2.2);
    }
  }
}
