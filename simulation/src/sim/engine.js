import { MACHINES, PRESETS } from './definitions.js';

const EPS = 1e-9;
const machineDefs = new Map(MACHINES.map((m) => [m.id, m]));
const keyOf = (machineId, componentId) => `${machineId}/${componentId}`;
const clamp = (v) => Math.min(1, Math.max(0, v));
const degradation = (health) => clamp((0.7 - health) / 0.7) ** 1.6;
const ranks = { ok: 0, warn: 1, fault: 2 };
const effects = new Map();
for (const m of MACHINES) {
  for (const c of m.components) {
    for (const e of c.effects || []) {
      const key = `${m.id}/${e.target}/${e.signal}`;
      if (!effects.has(key)) effects.set(key, []);
      effects.get(key).push({ source: keyOf(m.id, c.id), weight: e.weight });
    }
  }
}

const state = { preset: null, t: 0, parts: new Map(), machines: new Map(), script: [], purchases: [] };
const listeners = new Map();
let timer = null;
let stepping = false;

function requirePart(machineId, componentId) {
  const part = state.parts.get(keyOf(machineId, componentId));
  if (!part) throw new Error(`Unknown part ${machineId}/${componentId}`);
  return part;
}

function evaluate() {
  for (const m of MACHINES) {
    let fault = false;
    let warn = false;
    for (const c of m.components) {
      const part = requirePart(m.id, c.id);
      part.status = 'ok';
      for (const sig of c.signals) {
        let frac = degradation(part.health);
        for (const { source, weight } of effects.get(`${m.id}/${c.id}/${sig.key}`) || []) {
          frac += weight * degradation(state.parts.get(source).health);
        }
        const threshold = (sig.warn - sig.nominal) / (sig.fail - sig.nominal);
        const status = frac >= 0.97 ? 'fault' : frac >= threshold ? 'warn' : 'ok';
        if (ranks[status] > ranks[part.status]) part.status = status;
      }
      fault ||= part.status === 'fault';
      warn ||= part.status === 'warn';
    }
    state.machines.set(m.id, { status: fault ? 'down' : 'running', degraded: warn && !fault });
  }
}

function fire(name, payload) {
  for (const fn of [...(listeners.get(name) || [])]) {
    try {
      const result = fn(payload);
      if (result && typeof result.catch === 'function') result.catch((err) => console.error(`[sim] '${name}' listener failed:`, err));
    } catch (err) {
      console.error(`[sim] '${name}' listener failed:`, err);
    }
  }
}

function on(name, fn) {
  if (typeof fn !== 'function') return;
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
}

function off(name, fn) {
  listeners.get(name)?.delete(fn);
}

function applyScript(event, elapsed = 0) {
  const part = state.parts.get(event.target);
  if (!part) throw new Error(`Unknown script target ${event.target}`);
  event.fired = true;
  if (typeof event.health === 'number') {
    part.health = clamp(event.health);
  } else if (typeof event.degradeTo === 'number') {
    const target = clamp(event.degradeTo);
    if (!(event.over > 0)) {
      part.health = Math.min(part.health, target);
    } else if (part.health > target) {
      part.ramp = { rate: (part.health - target) / event.over, remaining: event.over };
      wear(part, elapsed);
    }
  }
}

function wear(part, dt) {
  if (!part.ramp) return;
  const amount = Math.min(dt, part.ramp.remaining);
  part.health = clamp(part.health - part.ramp.rate * amount);
  part.ramp.remaining -= amount;
  if (part.ramp.remaining <= EPS) part.ramp = null;
}

function step(dt = 1) {
  if (stepping) return null;
  stepping = true;
  let snap;
  try {
    let remaining = Number(dt);
    if (!Number.isFinite(remaining) || remaining < 0) remaining = 0;
    while (remaining > EPS) {
      const amount = Math.min(1, remaining);
      for (const part of state.parts.values()) wear(part, amount);
      state.t += amount;
      for (const event of state.script) {
        if (!event.fired && event.at <= state.t + EPS) applyScript(event, state.t - event.at);
      }
      evaluate();
      remaining -= amount;
    }
    snap = snapshot();
  } finally {
    stepping = false;
  }
  fire('tick', snap);
  return snap;
}

function start() {
  if (timer !== null) return;
  timer = setInterval(() => {
    try {
      step();
    } catch (err) {
      console.error('[sim] tick failed:', err);
    }
  }, 1000);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

function reset(preset) {
  state.preset = preset;
  state.t = 0;
  state.parts.clear();
  state.machines.clear();
  for (const m of MACHINES) {
    for (const c of m.components) {
      const key = keyOf(m.id, c.id);
      state.parts.set(key, { health: clamp(preset?.initial?.[key] ?? 1), ramp: null, status: 'ok' });
    }
  }
  for (const target of Object.keys(preset?.initial || {})) {
    if (!state.parts.has(target)) throw new Error(`Unknown initial target ${target}`);
  }
  state.script = (preset?.script || []).map((event) => ({ ...event, fired: false }));
  for (const event of state.script) if (event.at <= EPS) applyScript(event);
  evaluate();
}

function loadPreset(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset ${id}`);
  reset(preset);
  fire('preset', { preset });
  return preset;
}

function replaceComponent(machineId, componentId) {
  const part = requirePart(machineId, componentId);
  part.health = 1;
  part.ramp = null;
  evaluate();
  step(0);
}

function completePreset() {
  state.preset = null;
  step(0);
}

function purchaseComponent(machineId, componentId) {
  requirePart(machineId, componentId);
  const component = machineDefs.get(machineId).components.find(c => c.id === componentId);
  const purchase = component.purchase;
  if (!Number.isSafeInteger(purchase?.priceCents) || purchase.priceCents < 0) throw new Error(`No price for ${machineId}/${componentId}`);
  state.purchases.unshift({ id: state.purchases.length + 1, name: component.name, ...purchase });
  step(0);
}

function snapshot() {
  const machines = {};
  for (const [id, machine] of state.machines) {
    const components = {};
    for (const c of machineDefs.get(id).components) {
      components[c.id] = { status: requirePart(id, c.id).status };
    }
    machines[id] = { ...machine, components };
  }
  const minutes = ((Math.floor(8 * 60 + state.t + EPS) % 1440) + 1440) % 1440;
  return {
    t: state.t,
    clock: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    preset: state.preset ? { id: state.preset.id, name: state.preset.name } : null,
    purchases: state.purchases.map(purchase => ({ ...purchase })),
    lineRunning: [...state.machines.values()].every((m) => m.status === 'running'),
    machines,
  };
}

reset(null);
export const sim = { start, stop, step, loadPreset, completePreset, purchaseComponent, replaceComponent, snapshot, on, off };

