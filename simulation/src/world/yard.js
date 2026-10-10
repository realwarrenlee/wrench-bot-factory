import * as THREE from 'three';
import { box, cyl, lam } from './palette.js';

export function buildYard(parent, layout) {
  const yard = new THREE.Group();
  yard.name = 'industrial-yard';
  parent.add(yard);
  const y = layout.ground;
  const concrete = lam('#929ba3');
  const grass = lam('#728653');
  const asphalt = lam('#58616c');
  box(yard, 160, 0.04, 44, concrete, 0, y - 0.04, -10, false);
  box(yard, 160, 0.02, 8, asphalt, 0, y, 18, false);
  for (const [a, b] of [[-80, 20.5], [31.5, 80]]) {
    box(yard, b - a, 0.14, 0.14, concrete, (a + b) / 2, y, 14, false);
  }
  box(yard, 160, 0.12, 2, concrete, 0, y, 23, false);
  for (let x = -76; x < 80; x += 6) {
    box(yard, 2.8, 0.012, 0.12, lam('#d7dad5'), x, y + 0.025, 18, false, false);
  }
  // Adjacent surfaces meet at their edges to avoid flickering at the junction.
  const entrance = new THREE.Shape()
    .moveTo(22.5, -9.4).lineTo(29.5, -9.4).lineTo(29.5, -12)
    .quadraticCurveTo(29.5, -14, 31.5, -14).lineTo(20.5, -14)
    .quadraticCurveTo(22.5, -14, 22.5, -12).closePath();
  const leftPavement = new THREE.Shape()
    .moveTo(-80, -11.6).lineTo(22.5, -11.6).lineTo(22.5, -12)
    .quadraticCurveTo(22.5, -14, 20.5, -14).lineTo(-80, -14).closePath();
  const rightPavement = new THREE.Shape()
    .moveTo(29.5, -11.6).lineTo(80, -11.6).lineTo(80, -14).lineTo(31.5, -14)
    .quadraticCurveTo(29.5, -14, 29.5, -12).closePath();
  for (const [shape, material, height] of [[entrance, asphalt, 0.02], [leftPavement, concrete, 0.12], [rightPavement, concrete, 0.12]]) {
    const surface = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2), material);
    surface.position.y = y + height;
    surface.receiveShadow = true;
    yard.add(surface);
  }
  for (const [edge, mouth] of [[22.5, 20.5], [29.5, 31.5]]) {
    const curve = new THREE.CurvePath();
    curve.add(new THREE.LineCurve3(new THREE.Vector3(edge, y + 0.07, 11.6), new THREE.Vector3(edge, y + 0.07, 12)));
    curve.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(edge, y + 0.07, 12), new THREE.Vector3(edge, y + 0.07, 14), new THREE.Vector3(mouth, y + 0.07, 14)));
    yard.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.07, 4, false), concrete));
  }
  box(yard, 2.4, 0.04, 3.8, concrete, layout.staffDoor.x, y, 10.1, false);
  for (const [a, b] of [[-80, 5.1], [8.1, 22.5], [29.5, 80]]) {
    box(yard, b - a, 0.06, 2, grass, (a + b) / 2, y, 10.4, false);
    fence(yard, a, 11.4, b, 11.4, y);
  }

  const leaves = new THREE.IcosahedronGeometry(1, 0);
  for (const [x, z, size] of [[-15, 9.8, 1], [-15, -7, 1.2], [-31, -14, 1.3], [20, -8, 1.1], [19.5, 10, 0.9], [34, -17, 1.3]]) {
    cyl(yard, 0.16, 1.9 * size, lam('#88745d'), x, y + 0.95 * size, z, 'y', 4);
    const crown = new THREE.Mesh(leaves, lam('#8ca65e'));
    crown.position.set(x, y + 2.6 * size, z);
    crown.scale.set(1.05 * size, 1.45 * size, size);
    crown.castShadow = true;
    yard.add(crown);
  }
  for (const [x, z] of [[-12, 10.2], [-7, 10.2], [1, 10.2], [10.5, 10.2], [17, 10.2], [-23, -10], [27, -12]]) {
    const bush = new THREE.Mesh(leaves, grass);
    bush.position.set(x, y + 0.35, z);
    bush.scale.set(0.7, 0.5, 0.6);
    bush.castShadow = true;
    yard.add(bush);
  }
}

function fence(parent, x0, z0, x1, z1, y) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const group = new THREE.Group();
  group.position.set(x0, y, z0);
  group.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  parent.add(group);
  const steel = lam('#727f8a');
  const panels = Math.ceil(length / 3);
  for (let i = 0; i <= panels; i++) {
    box(group, 0.1, 1.6, 0.1, steel, i * length / panels, 0, 0);
  }
  for (const h of [0.12, 1.45]) box(group, length, 0.08, 0.06, steel, length / 2, h, 0, false);
  const vertices = [];
  for (let x = 0; x <= length; x += 0.25) vertices.push(x, 0.15, 0, x, 1.45, 0);
  for (let h = 0.15; h <= 1.45; h += 0.22) vertices.push(0, h, 0, length, h, 0);
  const wire = new THREE.BufferGeometry();
  wire.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  group.add(new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: '#87969c', transparent: true, opacity: 0.65 })));
}
