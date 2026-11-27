import * as THREE from 'three';

const EDGE = 0.86; // how close to the screen edge an off-screen pointer sits (1 = the very edge)

// The player's map markers, shown in the world: a tall beam of light and a turning gem at each spot,
// plus a tag on screen with the distance. When the spot is out of view the tag slides to the edge of
// the screen and an arrow points the way to walk.
export class Waypoints {
  constructor(scene, game, root) {
    this.scene = scene;
    this.game = game;
    this.root = root;
    this.beam = new THREE.CylinderGeometry(0.16, 0.16, 60, 6, 1, true);
    this.beam.translate(0, 30, 0);
    this.gem = new THREE.OctahedronGeometry(0.42);
    this.shown = new Map(); // marker -> { group, gemMesh, tag, arrow, text }
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
  }

  add(marker) {
    const color = new THREE.Color(marker.color);
    const group = new THREE.Group();
    const light = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const gemMesh = new THREE.Mesh(this.gem, new THREE.MeshBasicMaterial({ color, fog: false }));
    group.add(new THREE.Mesh(this.beam, light), gemMesh);
    this.scene.add(group);
    const tag = document.createElement('div');
    tag.className = 'waypoint';
    tag.style.setProperty('--c', marker.color);
    const arrow = document.createElement('i'), text = document.createElement('b');
    tag.append(arrow, text);
    this.root.append(tag);
    const entry = { group, gemMesh, tag, arrow, text };
    this.shown.set(marker, entry);
    return entry;
  }

  update(camera, clock) {
    const g = this.game, p = g.player;
    for (const [marker, e] of this.shown) {
      if (g.markers.includes(marker)) continue;
      this.scene.remove(e.group);
      e.group.children[0].material.dispose();
      e.gemMesh.material.dispose();
      e.tag.remove();
      this.shown.delete(marker);
    }
    for (const marker of g.markers) {
      const e = this.shown.get(marker) ?? this.add(marker);
      const y = g.ground(marker.x, marker.z);
      e.group.position.set(marker.x, y, marker.z);
      e.gemMesh.position.y = 2.3 + Math.sin(clock * 2.2) * 0.22;
      e.gemMesh.rotation.y = clock * 1.6;

      const dx = marker.x - p.x, dz = marker.z - p.z, dist = Math.hypot(dx, dz);
      // where the gem is on screen, and where the player is
      this.v.set(marker.x, y + 2.3, marker.z).project(camera);
      this.w.set(p.x, p.y + 1, p.z).project(camera);
      const inView = this.v.z < 1 && Math.abs(this.v.x) < EDGE && Math.abs(this.v.y) < EDGE;
      let sx = this.v.x, sy = this.v.y;
      if (!inView) {
        // the way to walk, as a direction on screen: taken from a point a few steps toward the marker,
        // which is always in front of the camera even when the marker itself is far behind it
        const k = 3 / Math.max(dist, 0.001);
        this.v.set(p.x + dx * k, p.y + 1, p.z + dz * k).project(camera);
        let ux = this.v.x - this.w.x, uy = this.v.y - this.w.y;
        const len = Math.hypot(ux, uy) || 1;
        ux /= len;
        uy /= len;
        // slide from the player along that direction until the edge of the screen
        const tx = ux ? ((ux > 0 ? EDGE : -EDGE) - this.w.x) / ux : Infinity;
        const ty = uy ? ((uy > 0 ? EDGE : -EDGE) - this.w.y) / uy : Infinity;
        const t = Math.max(0, Math.min(tx, ty));
        sx = this.w.x + ux * t;
        sy = this.w.y + uy * t;
        e.arrow.style.transform = `rotate(${Math.atan2(-uy, ux)}rad)`;
      }
      e.tag.classList.toggle('far', !inView);
      e.tag.style.left = ((sx + 1) / 2) * 100 + '%';
      e.tag.style.top = ((1 - sy) / 2) * 100 + '%';
      const label = Math.round(dist) + ' m';
      if (e.text.textContent !== label) e.text.textContent = label;
    }
  }
}
