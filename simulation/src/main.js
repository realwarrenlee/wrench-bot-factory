import './ui/shadcn.css';
import './ui/ui.css';
import './ui/ui-shell.css';
import { MACHINES, PRESETS } from './sim/definitions.js';
import { sim } from './sim/engine.js';
import { ScenarioSidebar } from './ui/scenarios.js';
import { AutoRepair } from './sim/auto-repair.js';

const worldEl = document.getElementById('world');
worldEl.setAttribute('role', 'img');
worldEl.setAttribute('aria-live', 'polite');

async function createWorld() {
  try {
    const { World } = await import('./world/World.js');
    const world = new World(worldEl);
    world.setMachines(MACHINES);
    return world;
  } catch (err) {
    console.error('[main] 3D world failed to start', err);
    worldEl.innerHTML = '<div class="world-fallback">3D view unavailable.</div>';
    return new Proxy({}, { get: (_, key) => key === 'then' ? undefined : () => key === 'robotAt' || key === 'technicianAt' });
  }
}

async function start() {
  const world = await createWorld();
  const ui = new ScenarioSidebar(document.getElementById('ui'), { presets: PRESETS, onPick: (id) => sim.loadPreset(id) });
  const autoRepair = new AutoRepair(sim, world);
  const update = (snapshot) => {
    for (const def of MACHINES) {
      const machine = snapshot.machines[def.id];
      world.setMachineStatus(def.id, machine.status, machine.degraded);
    }
    world.setLineRunning(snapshot.lineRunning);
    world.setClock(snapshot.clock);
    const stopped = MACHINES.filter((m) => snapshot.machines[m.id].status === 'down').map((m) => m.name);
    worldEl.setAttribute('aria-label', stopped.length ? `Factory line stopped: ${stopped.join(', ')}. Wrench Bot will scan it and arrange a technician repair automatically.` : 'Factory production line running.');
    ui.update(snapshot);
    document.getElementById('boot')?.remove();
    autoRepair.update(snapshot);
  };
  sim.on('tick', update);
  sim.on('preset', () => {
    autoRepair.reset();
    world.reset();
    update(sim.snapshot());
  });
  update(sim.snapshot());
  sim.start();
}

start().catch((err) => {
  console.error('[main] simulation failed to start', err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.classList.add('err');
    boot.textContent = `Could not start the simulation: ${err.message}`;
  }
});
