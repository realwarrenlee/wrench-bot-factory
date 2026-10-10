import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { buildWarehouse } from '../src/world/environment.js';

test('warehouse encloses the factory shell with a roof, walls and closed doors', () => {
  const previousDocument = globalThis.document;
  const context = {
    scale() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {},
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    const shell = new THREE.Group();
    buildWarehouse(shell);
    shell.updateMatrixWorld(true);
    const hit = (origin, direction, distance) => new THREE.Raycaster(
      new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, distance,
    ).intersectObject(shell, true)[0];
    for (const [origin, direction, distance] of [
      [[0, 10, 1], [0, -1, 0], 6],
      [[0, 3.5, 12], [0, 0, -1], 5],
      [[0, 3.5, -8], [0, 0, 1], 4],
      [[-15, 3.5, 0], [1, 0, 0], 4],
      [[15, 3.5, 0], [-1, 0, 0], 4],
      [[6.6, 1, 12], [0, 0, -1], 5],
      [[15, 1, 5.8], [-1, 0, 0], 4],
      [[0, -0.45, 12], [0, 0, -1], 5],
    ]) assert.ok(hit(origin, direction, distance), `shell opening at ${origin}`);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
