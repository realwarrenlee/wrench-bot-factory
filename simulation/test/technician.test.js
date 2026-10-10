import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TechCrew } from '../src/world/technician.js';
import { LAYOUT } from '../src/world/environment.js';

test('technician rides in, exits the stopped truck, walks through the door, and returns before departure', () => {
  const scene = new THREE.Scene();
  const crew = new TechCrew(scene, { burst() {} });
  const tech = crew.arrive({ id: 'sorter', x: 0, z: 0 });
  assert.ok(tech.truck, 'reuse the truck asset for technician transport');
  assert.equal(tech.root.visible, false, 'worker stays inside during the drive');
  const startX = tech.truck.group.position.x;
  let time = 0;
  let passedDoor = false;
  const advance = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      crew.update(1 / 60, time += 1 / 60);
      const p = tech.root.position;
      if (tech.root.visible && Math.abs(p.x - LAYOUT.staffDoor.x) < 0.1 && Math.abs(p.z - LAYOUT.staffDoor.z) < 0.2) passedDoor = true;
    }
  };
  advance(1);
  assert.ok(tech.truck.group.position.x > startX);
  assert.equal(tech.root.visible, false);
  assert.equal(tech.arrived, false);
  advance(2.1);
  const parked = tech.truck.group.position.clone();
  assert.equal(tech.root.visible, false, 'pause after parking before exiting');
  advance(0.6);
  assert.equal(tech.root.visible, true);
  assert.equal(tech.root.scale.x, 1, 'worker steps out at full size');
  assert.ok(tech.root.position.z > LAYOUT.staffDoor.z);
  advance(12);
  assert.equal(passedDoor, true, 'worker passes through the actual staff doorway');
  assert.equal(tech.arrived, true);
  assert.ok(tech.truck.group.position.equals(parked), 'truck waits throughout repair');
  crew.leave('sorter');
  advance(0.5);
  assert.ok(tech.truck.group.position.equals(parked), 'truck waits for returning worker');
  advance(15);
  assert.equal(crew.leaving.length, 0);
  assert.equal(scene.children.length, 0, 'worker, truck, and toolbox are removed after departure');
});

test('scenario reset clears transport, worker, and any toolbox on the floor', () => {
  for (const seconds of [1, 12]) {
    const scene = new THREE.Scene();
    const crew = new TechCrew(scene, { burst() {} });
    const machine = { id: 'sorter', x: 0, z: 0 };
    const tech = crew.arrive(machine);
    assert.equal(crew.arrive(machine), tech, 'duplicate arrival does not spawn another truck');
    for (let i = 0; i < seconds * 60; i++) crew.update(1 / 60, i / 60);
    crew.reset();
    assert.equal(scene.children.length, 0);
    assert.equal(crew.active.size, 0);
  }
});
