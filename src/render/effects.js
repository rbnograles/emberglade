import * as THREE from 'three';

const dummy = new THREE.Object3D();

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
      f.g.visible = !!fire;
      if (!fire) return;
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
      l.intensity = (night ? 11 : 3) * (1 + Math.sin(t * 13 + i * 3) * 0.08);
    });
  }
}
