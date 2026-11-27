import * as THREE from 'three';
import { hash2 } from '../core/noise.js';

// [time, light colour, light intensity, ambient intensity, horizon colour, zenith colour, stars]; time 0 = 6:00.
// Night eases into morning over roughly a fifth of the day: night -> pre-dawn glow -> sunrise -> day.
const KEYS = [
  [0.0, 0xffc08a, 1.6, 0.85, 0xf6c9a4, 0x86a8dc, 0.0],
  [0.07, 0xfff3dd, 2.4, 1.0, 0xbfe6f7, 0x5aa9e6, 0.0],
  [0.43, 0xfff3dd, 2.4, 1.0, 0xbfe6f7, 0x5aa9e6, 0.0],
  [0.5, 0xff9a5c, 1.4, 0.8, 0xf2a878, 0x5d6fb5, 0.1],
  [0.57, 0x8a94d6, 0.55, 0.42, 0x3d4474, 0x161c40, 0.75],
  [0.64, 0x7f93d9, 0.45, 0.32, 0x1c2542, 0x0a0f24, 1.0],
  [0.86, 0x7f93d9, 0.45, 0.32, 0x1c2542, 0x0a0f24, 1.0],
  [0.94, 0x9aa0d8, 0.6, 0.5, 0x6d719e, 0x28315e, 0.45],
  [1.0, 0xffc08a, 1.6, 0.85, 0xf6c9a4, 0x86a8dc, 0.0],
];

const SUN_URL = new URL('../../assets/kenney_voxel-pack/PNG/Other/sun.png', import.meta.url).href;
const MOON_URL = new URL('../../assets/kenney_voxel-pack/PNG/Other/moon.png', import.meta.url).href;

const smooth = (t) => t * t * (3 - 2 * t);
const a = new THREE.Color(), b = new THREE.Color();
const dummy = new THREE.Object3D();
const CLOUD_AREA = 320, CLOUD_Y = 72; // above all but the very highest peaks

const DOME_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DOME_FRAG = `
uniform vec3 horizon;
uniform vec3 zenith;
uniform float stars;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.65, d.y));
  // stars: one possible star per cell of a grid wrapped around the dome
  vec2 uv = vec2(atan(d.z, d.x) * 70.0, d.y * 110.0);
  vec2 cell = floor(uv);
  float r = hash(cell);
  float dotShape = smoothstep(0.22, 0.05, length(fract(uv) - 0.5));
  col += vec3(step(0.95, r) * dotShape * (0.5 + 0.5 * hash(cell + 7.0)) * stars * smoothstep(0.02, 0.2, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// Sky dome, sun, moon, stars, clouds, lights and fog for the day/night cycle.
export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb59a78, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -36;
    cam.right = cam.top = 36;
    cam.near = 1;
    cam.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.background = new THREE.Color();
    scene.fog = new THREE.Fog(0xffffff, 50, 95);
    scene.add(this.hemi, this.sun, this.sun.target);

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(260, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: { horizon: { value: new THREE.Color() }, zenith: { value: new THREE.Color() }, stars: { value: 0 } },
        vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      }),
    );
    this.dome.renderOrder = -2;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    const loader = new THREE.TextureLoader();
    const disc = (url, size) => {
      const tex = loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true }));
      s.scale.setScalar(size);
      s.renderOrder = -1;
      scene.add(s);
      return s;
    };
    this.sunDisc = disc(SUN_URL, 46);
    this.moonDisc = disc(MOON_URL, 34);

    // Clouds: clusters of flat boxes that drift and wrap around the camera.
    this.cloudBoxes = [];
    for (let c = 0; c < 22; c++) {
      const cx = hash2(c, 1, 5) * CLOUD_AREA, cz = hash2(c, 2, 5) * CLOUD_AREA, cy = CLOUD_Y + hash2(c, 3, 5) * 14;
      const parts = 3 + ((hash2(c, 4, 5) * 4) | 0);
      for (let i = 0; i < parts; i++) {
        this.cloudBoxes.push({
          x: cx + (hash2(c, i, 6) - 0.5) * 16, y: cy + hash2(c, i, 7) * 2, z: cz + (hash2(c, i, 8) - 0.5) * 10,
          sx: 8 + hash2(c, i, 9) * 9, sy: 2 + hash2(c, i, 10) * 1.5, sz: 6 + hash2(c, i, 11) * 6,
        });
      }
    }
    this.clouds = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ fog: false, transparent: true, opacity: 0.9 }),
      this.cloudBoxes.length,
    );
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);
  }

  // time: 0..1 of the day. (cx, cy, cz): player. cam: camera position. clock: seconds, for cloud drift.
  update(time, cx, cy, cz, camDist, cam, clock, raining = false) {
    // rain eases in and out, dimming the light and greying the sky
    this.rain = (this.rain ?? 0) + ((raining ? 1 : 0) - (this.rain ?? 0)) * 0.02;
    let i = 0;
    while (i < KEYS.length - 2 && time >= KEYS[i + 1][0]) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1];
    const f = smooth(Math.min(1, Math.max(0, (time - k0[0]) / (k1[0] - k0[0]))));
    const lerp = (n) => k0[n] + (k1[n] - k0[n]) * f;
    const u = this.dome.material.uniforms;
    u.horizon.value.copy(a.setHex(k0[4])).lerp(b.setHex(k1[4]), f);
    u.zenith.value.copy(a.setHex(k0[5])).lerp(b.setHex(k1[5]), f);
    u.stars.value = lerp(6);
    u.horizon.value.lerp(a.setHex(0x9aa7b3), this.rain * 0.7);
    u.zenith.value.lerp(b.setHex(0x7d8a98), this.rain * 0.7);
    this.scene.background.copy(u.horizon.value);
    this.scene.fog.color.copy(u.horizon.value);
    this.scene.fog.near = camDist + 18;
    this.scene.fog.far = camDist + 44;

    // The shadow light is the sun by day and the moon by night. It dims to almost nothing
    // at the two hand-overs (6:00 and 18:00) so the change of direction is never seen.
    const flip = smooth(Math.min(1, Math.min(time, Math.abs(time - 0.5), 1 - time) / 0.04));
    this.sun.color.copy(a.setHex(k0[1])).lerp(b.setHex(k1[1]), f);
    this.sun.intensity = lerp(2) * (0.12 + 0.88 * flip) * (1 - this.rain * 0.45);
    this.hemi.intensity = lerp(3) + (1 - flip) * 0.3;
    const ang = (time % 0.5) * 2 * Math.PI;
    const dx = Math.cos(ang) * 0.75, dy = Math.max(0.45, Math.min(0.8, Math.sin(ang))), dz = 0.5;
    this.sun.position.set(cx + dx * 60, cy + dy * 60, cz + dz * 60);
    this.sun.target.position.set(cx, cy, cz);

    // Sky bodies follow the true arc: sun up at 6:00, overhead at noon, down at 18:00; moon opposite.
    const arc = time * 2 * Math.PI;
    const sx = Math.cos(arc), sy = Math.sin(arc), sz = 0.35, len = Math.hypot(sx, sy, sz);
    this.dome.position.copy(cam);
    this.sunDisc.position.set(cam.x + (sx / len) * 230, cam.y + (sy / len) * 230, cam.z + (sz / len) * 230);
    this.moonDisc.position.set(cam.x - (sx / len) * 230, cam.y - (sy / len) * 230, cam.z + (sz / len) * 230);
    this.sunDisc.material.opacity = Math.min(1, Math.max(0, sy * 6 + 0.6));
    this.moonDisc.material.opacity = Math.min(1, Math.max(0, -sy * 6 + 0.6));

    // clouds
    const bright = Math.min(1, lerp(3));
    this.clouds.material.color.copy(a.set(0xffffff)).lerp(u.horizon.value, 0.3 + 0.5 * (1 - bright)).multiplyScalar(0.35 + 0.65 * bright);
    const drift = clock * 1.2;
    this.cloudBoxes.forEach((c, n) => {
      const wrap = (v, centre) => ((((v - centre) % CLOUD_AREA) + CLOUD_AREA * 1.5) % CLOUD_AREA) - CLOUD_AREA / 2 + centre;
      dummy.position.set(wrap(c.x + drift, cam.x), c.y, wrap(c.z, cam.z));
      dummy.scale.set(c.sx, c.sy, c.sz);
      dummy.updateMatrix();
      this.clouds.setMatrixAt(n, dummy.matrix);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}
