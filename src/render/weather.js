import * as THREE from 'three';

const DROPS = 2600; // streaks in the air at full strength
const SPLASHES = 140;
const HALF = 30; // half-width of the box of rain that follows the player
const TOP = 26; // how far above the player the rain starts
const FALL = 24; // units per second
const WIND = 5; // sideways drift, units per second

const dummy = new THREE.Object3D();

// Rain as real geometry: thousands of slanted streaks falling around the player,
// with little rings that spread and fade where drops land.
export class Rain {
  constructor(scene) {
    this.level = 0; // 0 = dry, 1 = full downpour; eased toward the weather
    this.drops = Array.from({ length: DROPS }, () => ({
      x: (Math.random() * 2 - 1) * HALF, y: Math.random() * TOP, z: (Math.random() * 2 - 1) * HALF, speed: 0.8 + Math.random() * 0.4,
    }));
    this.streaks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.03, 1.1, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xd6e9ff, transparent: true, opacity: 0.5, depthWrite: false }),
      DROPS,
    );
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 3;
    // every streak leans the same way, with the wind
    this.lean = new THREE.Euler(0, 0, Math.atan2(WIND, FALL));
    scene.add(this.streaks);

    this.splashes = Array.from({ length: SPLASHES }, () => ({ life: 0, x: 0, y: 0, z: 0 }));
    this.rings = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.055, 0.085, 10).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xe6f2ff, transparent: true, opacity: 0.38, depthWrite: false }),
      SPLASHES,
    );
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 2;
    scene.add(this.rings);
    this.next = 0;
    this.carry = 0;
  }

  // raining: the weather right now. (cx, cy, cz): the player. surfaceAt(x, z): height a drop lands at.
  update(dt, raining, cx, cy, cz, surfaceAt) {
    this.level += ((raining ? 1 : 0) - this.level) * Math.min(1, dt * 0.5);
    const active = this.level < 0.01 ? 0 : Math.floor(DROPS * this.level);
    this.streaks.visible = this.rings.visible = active > 0;
    if (!active) return;

    this.streaks.count = active;
    for (let i = 0; i < active; i++) {
      const d = this.drops[i];
      d.y -= FALL * d.speed * dt;
      d.x += WIND * dt;
      if (d.y < -4) {
        d.y += TOP + 4;
        d.x = (Math.random() * 2 - 1) * HALF;
        d.z = (Math.random() * 2 - 1) * HALF;
      }
      if (d.x > HALF) d.x -= HALF * 2;
      dummy.position.set(cx + d.x, cy + d.y, cz + d.z);
      dummy.rotation.copy(this.lean);
      dummy.scale.set(1, d.speed, 1);
      dummy.updateMatrix();
      this.streaks.setMatrixAt(i, dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;

    // new splashes land at random spots near the player, on the ground or the water
    this.carry += dt * 220 * this.level;
    while (this.carry >= 1) {
      this.carry--;
      const s = this.splashes[this.next];
      this.next = (this.next + 1) % SPLASHES;
      s.x = cx + (Math.random() * 2 - 1) * 20;
      s.z = cz + (Math.random() * 2 - 1) * 20;
      s.y = surfaceAt(s.x, s.z) + 0.03;
      s.life = 1;
    }
    dummy.rotation.set(0, 0, 0);
    this.splashes.forEach((s, i) => {
      s.life = Math.max(0, s.life - dt * 2.6);
      const grow = s.life > 0 ? 0.5 + (1 - s.life) * 1.6 : 0; // spreads out as it fades
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.setScalar(grow * s.life > 0 ? grow : 0);
      dummy.updateMatrix();
      this.rings.setMatrixAt(i, dummy.matrix);
    });
    this.rings.instanceMatrix.needsUpdate = true;
    this.streaks.material.opacity = 0.5 * Math.min(1, this.level * 1.5);
  }
}

const FLAKES = 3200;

// Drifting flakes that follow the player: snow in the frozen region, ash over the volcanic lands.
// `level` (0..1) is how deep into the region the player is: a few lazy flakes at the edge,
// a driving blizzard at the heart.
export class Flurry {
  constructor(scene, color, size = 0.07) {
    this.level = 0;
    this.flakes = Array.from({ length: FLAKES }, () => ({
      x: (Math.random() * 2 - 1) * HALF, y: Math.random() * TOP, z: (Math.random() * 2 - 1) * HALF,
      drift: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.8,
    }));
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
      FLAKES,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  update(dt, target, cx, cy, cz, clock) {
    this.level += (target - this.level) * Math.min(1, dt * 0.8);
    // few flakes at the edge, the full count only near the heart
    const active = this.level < 0.01 ? 0 : Math.floor(FLAKES * (0.06 + 0.94 * this.level * this.level));
    this.mesh.visible = active > 0;
    if (!active) return;
    this.mesh.count = active;
    const fall = 1.6 + this.level * 7, wind = 0.6 + this.level * this.level * 15; // gentle, then driven sideways
    for (let i = 0; i < active; i++) {
      const f = this.flakes[i];
      f.y -= fall * f.speed * dt;
      f.x += (wind + Math.sin(clock * 1.3 + f.drift) * 0.8) * dt;
      f.z += Math.cos(clock * 1.1 + f.drift) * 0.6 * dt;
      if (f.y < -3) {
        f.y += TOP + 3;
        f.x = (Math.random() * 2 - 1) * HALF;
        f.z = (Math.random() * 2 - 1) * HALF;
      }
      if (f.x > HALF) f.x -= HALF * 2;
      dummy.position.set(cx + f.x, cy + f.y, cz + f.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.7 + f.speed * 0.5);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}