import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sim } from '../src/sim/engine.js';

test('factory starts healthy without a selected scenario', () => {
  assert.equal(sim.snapshot().preset, null);
  assert.equal(sim.step(30).lineRunning, true);
  assert.equal(sim.snapshot().preset, null);
});

test('completing a scenario clears its selection without resetting the factory', () => {
  sim.loadPreset('first-failure');
  sim.step(3);
  sim.replaceComponent('sorter', 'prox-sensor');
  const before = sim.snapshot();
  assert.equal(typeof sim.completePreset, 'function');
  const ticks = [];
  const listener = snapshot => ticks.push(snapshot);
  sim.on('tick', listener);
  try {
    sim.completePreset();
    assert.deepEqual(sim.snapshot(), { ...before, preset: null });
    assert.equal(ticks.at(-1).preset, null);
    sim.loadPreset('first-failure');
    assert.equal(sim.snapshot().preset.id, 'first-failure', 'completed scenario can be selected again');
  } finally {
    sim.off('tick', listener);
  }
});

test('a scenario runs the factory and resets its shift', () => {
  sim.loadPreset('predictive');
  const state = sim.step(2);
  assert.equal(state.lineRunning, true);
  assert.equal(state.clock, '08:02');
  sim.loadPreset('predictive');
  assert.equal(sim.snapshot().t, 0);
  assert.equal(sim.snapshot().clock, '08:00');
});

test('scripted faults and replacement notify the browser immediately', () => {
  sim.loadPreset('first-failure');
  const ticks = [];
  const listener = (snapshot) => ticks.push(snapshot);
  sim.on('tick', listener);
  try {
    sim.step(3);
    assert.equal(ticks.length, 1);
    assert.equal(ticks[0].machines.sorter.status, 'down');
    assert.equal(ticks[0].lineRunning, false);
    sim.replaceComponent('sorter', 'prox-sensor');
    assert.equal(ticks.at(-1).machines.sorter.status, 'running');
    assert.equal(ticks.at(-1).lineRunning, true);
  } finally {
    sim.off('tick', listener);
  }
});

test('brownout requires repairing the upstream power supply', () => {
  sim.loadPreset('brownout');
  assert.equal(sim.step(8).machines.arm.status, 'down');
  sim.replaceComponent('arm', 'gripper-servo');
  assert.equal(sim.snapshot().machines.arm.status, 'down');
  sim.replaceComponent('arm', 'arm-psu');
  assert.equal(sim.snapshot().machines.arm.status, 'running');
});

test('gradual wear warns before failure and replacement clears its ramp', () => {
  sim.loadPreset('predictive');
  const warned = sim.step(10);
  assert.equal(warned.machines.conveyor.components['roller-bearing'].status, 'warn');
  assert.equal(warned.machines.conveyor.status, 'running');
  assert.equal(sim.step(20).machines.conveyor.status, 'down');
  sim.replaceComponent('conveyor', 'roller-bearing');
  assert.equal(sim.step(30).machines.conveyor.components['roller-bearing'].status, 'ok');
});

test('invalid inputs leave the factory unchanged', () => {
  sim.loadPreset('first-failure');
  const before = sim.snapshot();
  assert.throws(() => sim.replaceComponent('sorter', 'unknown'), /Unknown part/);
  assert.throws(() => sim.loadPreset('unknown'), /Unknown preset/);
  sim.step(NaN);
  sim.step(-5);
  assert.deepEqual(sim.snapshot(), before);
});

test('purchase history records configured prices, retains prior runs, and protects its snapshot', () => {
  sim.loadPreset('first-failure');
  assert.equal(typeof sim.purchaseComponent, 'function');
  const count = sim.snapshot().purchases.length;
  sim.purchaseComponent('sorter', 'prox-sensor');
  let purchases = sim.snapshot().purchases;
  assert.equal(purchases.length, count + 1);
  assert.equal(purchases[0].name, 'Inductive proximity sensor');
  assert.equal(purchases[0].priceCents, 6000);
  purchases[0].name = 'changed';
  sim.loadPreset('brownout');
  sim.purchaseComponent('arm', 'arm-psu');
  purchases = sim.snapshot().purchases;
  assert.equal(purchases[0].priceCents, 10000);
  assert.equal(purchases[1].name, 'Inductive proximity sensor');
  sim.purchaseComponent('conveyor', 'roller-bearing');
  assert.equal(sim.snapshot().purchases[0].priceCents, 1000);
  const before = sim.snapshot();
  assert.throws(() => sim.purchaseComponent('sorter', 'unknown'), /Unknown part/);
  assert.throws(() => sim.purchaseComponent('sorter', 'relay-board'), /No price/);
  assert.deepEqual(sim.snapshot(), before);
});

test('the local timer runs once per second at fixed 1× speed and stops cleanly', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  sim.loadPreset('predictive');
  sim.start();
  sim.start();
  try {
    t.mock.timers.tick(1000);
    assert.equal(sim.snapshot().t, 1);
    t.mock.timers.tick(5000);
    assert.equal(sim.snapshot().t, 6);
    sim.stop();
    t.mock.timers.tick(5000);
    assert.equal(sim.snapshot().t, 6);
  } finally {
    sim.stop();
  }
});
