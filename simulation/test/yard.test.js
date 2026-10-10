import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { buildYard } from '../src/world/yard.js';
import { LAYOUT } from '../src/world/environment.js';

test('yard fence encloses the frontage while leaving staff and delivery access clear', () => {
  const yard = new THREE.Group();
  buildYard(yard, LAYOUT);
  yard.updateMatrixWorld(true);
  const hits = (x, z, dx, dz, distance) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 0.58, z), new THREE.Vector3(dx, 0, dz), 0, distance);
    ray.params.Line.threshold = 0.04;
    return ray.intersectObject(yard, true);
  };
  for (const x of [-12, 0, 12, 20, 34, 42, 76]) assert.ok(hits(x, 14, 0, -1, 3).length, 'front fence must enclose the yard');
  for (const x of [5.8, 6.6, 7.4]) assert.equal(hits(x, 14, 0, -1, 5).length, 0, 'staff entrance must remain open');
  for (const z of [4.6, 5.8, 7]) assert.equal(hits(52, z, -1, 0, 39).length, 0, 'delivery truck route must remain open');
  assert.equal(hits(-20, 1, 1, 0, 5).length, 0, 'shared yard must remain open beside the factory');
  assert.equal(hits(0, -12, 0, 1, 4).length, 0, 'shared yard must remain open behind the factory');
  assert.equal(hits(24, 0, -1, 0, 4).length, 0, 'shared yard must remain open beside the dock');
});

test('delivery access joins the street with one level asphalt surface', () => {
  const yard = new THREE.Group();
  buildYard(yard, LAYOUT);
  yard.updateMatrixWorld(true);
  const surfaceAt = (x, z) => {
    const hits = new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0), 0, 3)
      .intersectObject(yard, true).filter(hit => hit.object.isMesh);
    assert.ok(hits.length, `missing pavement at ${x}, ${z}`);
    const top = hits.filter(hit => Math.abs(hit.point.y - hits[0].point.y) < 1e-6);
    assert.equal(new Set(top.map(hit => hit.object)).size, 1, `overlapping pavement at ${x}, ${z}`);
    return hits[0];
  };
  const street = surfaceAt(26, 17);
  for (const [x, z] of [[26, 10], [26, 13], [26, 15], [22, 13.8], [30, 13.8]]) {
    const access = surfaceAt(x, z);
    assert.ok(access.object.material === street.object.material, 'access road must use the street asphalt');
    assert.ok(Math.abs(access.point.y - street.point.y) < 1e-6, 'joined roads must have the same surface height');
  }
  const courtyard = surfaceAt(0, 0);
  for (const [x, z] of [[26, 5.8], [42, 5.8]]) {
    assert.ok(surfaceAt(x, z).object.material === courtyard.object.material, 'entrance must end in the courtyard without an internal road');
  }
});
