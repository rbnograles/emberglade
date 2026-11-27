import * as THREE from 'three';
import { toGeometry } from './chunks.js';
import { keeperModel } from './keeper-models.js';
import { inWarning, gearHint } from '../game/encounters.js';

export class KeeperView {
  constructor(scene, game, hud) {
    this.scene = scene;
    this.game = game;
    this.hud = hud;
    this.cache = new Map();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.body = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.body.castShadow = true;
    this.body.visible = false;
    scene.add(this.body);
    // Small tiles follow terrain steps so attack footprints remain readable on ledges.
    const tile = new THREE.PlaneGeometry(0.36, 0.36);
    tile.rotateX(-Math.PI / 2);
    this.warning = new THREE.InstancedMesh(tile, new THREE.MeshBasicMaterial({ color: 0xff9450, transparent: true, opacity: 0.7, depthWrite: false }), 1800);
    this.warning.renderOrder = 4;
    this.warning.frustumCulled = false;
    this.warning.count = 0;
    scene.add(this.warning);
    this.matrix = new THREE.Matrix4();
  }

  showWarnings(warnings) {
    if (this.lastWarnings === warnings) return;
    this.lastWarnings = warnings;
    let n = 0;
    const used = new Set();
    for (const w of warnings ?? []) {
      const r = w.radius ?? Math.hypot(w.width, w.length) / 2;
      for (let i = Math.floor((w.x-r)/0.36); i <= Math.ceil((w.x+r)/0.36); i++) {
        for (let j = Math.floor((w.z-r)/0.36); j <= Math.ceil((w.z+r)/0.36); j++) {
          const x = i*0.36, z = j*0.36, key = i+','+j;
          if (used.has(key) || !inWarning({x,z}, w)) continue;
          used.add(key);
          const t = this.game.gen.tile(Math.floor(x), Math.floor(z));
          this.matrix.makeTranslation(x, (t.water ? t.bed : t.h) + 0.06, z);
          this.warning.setMatrixAt(n++, this.matrix);
        }
      }
    }
    this.warning.count = n;
    this.warning.instanceMatrix.needsUpdate = true;
  }

  update(clock) {
    const b = this.game.encounters.active;
    this.showWarnings(b?.warnings);
    this.body.visible = !!b;
    this.hud.hidden = !b;
    if (!b) return;
    const k = b.spec;
    if (!this.cache.has(k.id)) this.cache.set(k.id, toGeometry(keeperModel(k)));
    this.body.geometry = this.cache.get(k.id);
    const windup = b.warnings.length > 0;
    this.body.rotation.y = Math.atan2(this.game.player.x-b.x, this.game.player.z-b.z);
    this.body.rotation.x = b.hit > 0 ? -b.hit * 0.8 : windup ? -0.14 : Math.sin(clock*1.7)*0.024;
    this.body.position.set(b.x, b.y + Math.abs(Math.sin(clock*(windup ? 8 : 1.6))) * (windup ? 0.16 : 0.035), b.z);
    this.material.emissive.setHex(b.hit ? 0xbd7561 : windup ? 0x6e3221 : 0);
    const text = b.engaged ? k.name + '  ' + b.hp + ' / ' + k.hp + (windup ? '  ·  ' + k.attack : '') :
      k.name + ' sleeps at ' + k.site + '. Wake with ' + gearHint(k) + '.';
    if (this.hud.textContent !== text) this.hud.textContent = text;
  }
}
