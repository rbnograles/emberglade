import * as THREE from 'three';
import { toGeometry } from './chunks.js';

const SIZE = 112; // pixels per icon

// Photograph each sculpture when its icon first appears. Inventory and crafting share the cache.
export function renderItemIcons(itemModels) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a78, 1.25));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.3);
  sun.position.set(-2, 5, 4);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const icons = new Map();
  const box = new THREE.Box3(), centre = new THREE.Vector3(), size = new THREE.Vector3();

  return (id) => {
    if (icons.has(id)) return icons.get(id);
    const model = itemModels.get(id);
    const mesh = new THREE.Mesh(toGeometry(model), material);
    mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox);
    box.getCenter(centre);
    box.getSize(size);
    // flat things (tools drawn in one plane) face the camera more squarely; chunky things turn further
    const flat = size.z < Math.max(size.x, size.y) * 0.3;
    const pivot = new THREE.Group();
    mesh.position.copy(centre).negate();
    pivot.add(mesh);
    pivot.rotation.set(0, flat ? -0.35 : -0.72, flat ? -0.5 : 0);
    scene.add(pivot);
    // frame it: the camera looks down a little, and the view is just wide enough for the model
    const reach = Math.max(size.x, size.y, size.z) * (flat ? 0.6 : 0.78) + 0.02;
    camera.left = camera.bottom = -reach;
    camera.right = camera.top = reach;
    camera.updateProjectionMatrix();
    camera.position.set(0, flat ? 2 : 7, 10);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    icons.set(id, renderer.domElement.toDataURL('image/png'));
    scene.remove(pivot);
    mesh.geometry.dispose();
    return icons.get(id);
  };
}
