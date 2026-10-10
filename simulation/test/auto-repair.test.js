import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sim } from '../src/sim/engine.js';
import { AutoRepair } from '../src/sim/auto-repair.js';

function setup() {
  const actions = [];
  const repairs = [];
  const world = {
    place: null,
    techArrived: false,
    robotAt(id) { return this.place === id; },
    robotGoTo(id) { this.place = null; actions.push(['go', id]); },
    robotThinking(on) { actions.push(['think', on]); },
    spawnTruck(eta) { actions.push(['truck', eta]); },
    technicianArrive(id) { actions.push(['tech', id]); },
    technicianAt() { return this.techArrived; },
    technicianWork(on, id) { actions.push(['work', on, id]); },
    technicianLeave(id) { actions.push(['leave', id]); },
    partReplaced(id) { actions.push(['replaced', id]); },
  };
  const auto = new AutoRepair({
    completePreset: sim.completePreset,
    purchaseComponent: sim.purchaseComponent,
    replaceComponent(machineId, componentId) {
      repairs.push([machineId, componentId]);
      sim.replaceComponent(machineId, componentId);
    },
  }, world);
  const advance = (n) => auto.update(sim.step(n));
  const arrive = (id) => { world.place = id; advance(1); };
  const complete = (id) => {
    arrive(id);
    advance(3);
    arrive('terminal');
    advance(3);
    arrive(id);
    world.techArrived = true;
    advance(1);
    advance(3);
    advance(2);
  };
  return { auto, world, actions, repairs, advance, arrive, complete };
}

test('the full sequence waits for scanning, ordering, delivery, and human repair', () => {
  sim.loadPreset('first-failure');
  const { world, actions, repairs, advance, arrive } = setup();
  advance(3);
  assert.deepEqual(actions, [['go', 'sorter']]);
  advance(10);
  assert.equal(actions.length, 1);
  arrive('sorter');
  assert.deepEqual(actions.at(-1), ['think', true]);
  advance(2);
  assert.equal(actions.at(-1)[0], 'think');
  advance(1);
  assert.deepEqual(actions.at(-1), ['go', 'terminal']);
  advance(5);
  assert.equal(actions.some(([action]) => action === 'truck'), false);
  arrive('terminal');
  advance(2);
  assert.equal(actions.some(([action]) => action === 'truck'), false);
  advance(1);
  assert.deepEqual(actions.slice(-3), [['truck', 4], ['go', 'dock'], ['go', 'sorter']]);
  advance(5);
  assert.equal(actions.some(([action]) => action === 'tech'), false);
  arrive('sorter');
  assert.deepEqual(actions.at(-1), ['tech', 'sorter']);
  advance(5);
  assert.equal(repairs.length, 0);
  world.techArrived = true;
  advance(1);
  assert.deepEqual(actions.at(-1), ['work', true, 'sorter']);
  advance(2);
  assert.equal(sim.snapshot().lineRunning, false);
  advance(1);
  assert.equal(sim.snapshot().lineRunning, true);
  assert.deepEqual(repairs, [['sorter', 'prox-sensor']]);
  assert.deepEqual(actions.slice(-2), [['replaced', 'sorter'], ['work', false, 'sorter']]);
  advance(2);
  assert.deepEqual(actions.slice(-2), [['leave', 'sorter'], ['go', 'home']]);
  assert.equal(sim.snapshot().preset, null, 'active selection clears only after the celebration');
});

test('brownout repairs the power supply rather than the servo symptom', () => {
  sim.loadPreset('brownout');
  const { advance, complete, repairs } = setup();
  advance(8);
  complete('arm');
  assert.deepEqual(repairs, [['arm', 'arm-psu']]);
  assert.equal(sim.snapshot().machines.arm.status, 'running');
});

test('changing scenarios cancels the unfinished sequence', () => {
  sim.loadPreset('first-failure');
  const { auto, advance, arrive, actions, repairs } = setup();
  advance(3);
  arrive('sorter');
  advance(3);
  arrive('terminal');
  advance(3);
  sim.loadPreset('predictive');
  auto.reset();
  const count = actions.length;
  advance(3);
  assert.equal(actions.length, count);
  assert.equal(repairs.length, 0);
  assert.equal(auto.job, null);
});

test('bearing repair recovers production once even with reentrant tick listeners', () => {
  sim.loadPreset('predictive');
  const purchasesBefore = sim.snapshot().purchases.length;
  const { auto, advance, complete, repairs } = setup();
  const listener = (snapshot) => auto.update(snapshot);
  sim.on('tick', listener);
  try {
    advance(30);
    assert.equal(sim.snapshot().machines.conveyor.status, 'down');
    complete('conveyor');
    assert.equal(sim.snapshot().purchases.length, purchasesBefore + 1, 'one purchase despite nested ticks');
    assert.equal(sim.snapshot().lineRunning, true);
    assert.deepEqual(repairs, [['conveyor', 'roller-bearing']]);
    assert.equal(sim.snapshot().machines.conveyor.components['roller-bearing'].status, 'ok');
  } finally {
    sim.off('tick', listener);
  }
});
