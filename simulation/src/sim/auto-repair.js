import { MACHINES } from './definitions.js';

// Arrival checks keep the story in order even when rendering is slower than the simulation.
export class AutoRepair {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.job = null;
    this.finishing = false;
  }

  reset() {
    this.job = null;
    this.world.robotThinking(false);
  }

  update(snapshot) {
    if (this.finishing) return;
    const world = this.world;
    const job = this.job;
    if (job) {
      switch (job.phase) {
        case 'inspect':
          if (world.robotAt(job.machineId)) {
            job.phase = 'scan';
            job.readyAt = snapshot.t + 3;
            world.robotThinking(true);
          }
          break;
        case 'scan':
          if (snapshot.t >= job.readyAt) {
            world.robotThinking(false);
            world.robotGoTo('terminal');
            job.phase = 'computer';
          }
          break;
        case 'computer':
          if (world.robotAt('terminal')) {
            job.phase = 'order';
            job.readyAt = snapshot.t + 3;
          }
          break;
        case 'order':
          if (snapshot.t >= job.readyAt) {
            job.phase = 'delivery'; // purchasing emits a tick; advance first to avoid ordering twice
            this.engine.purchaseComponent(job.machineId, job.componentId);
            world.spawnTruck(4);
            world.robotGoTo('dock');
            world.robotGoTo(job.machineId);
          }
          break;
        case 'delivery':
          if (world.robotAt(job.machineId)) {
            world.technicianArrive(job.machineId);
            job.phase = 'technician';
          }
          break;
        case 'technician':
          if (world.technicianAt(job.machineId)) {
            world.technicianWork(true, job.machineId);
            job.phase = 'repair';
            job.readyAt = snapshot.t + 3;
          }
          break;
        case 'repair':
          if (snapshot.t >= job.readyAt) {
            this.finishing = true;
            try {
              this.engine.replaceComponent(job.machineId, job.componentId);
              world.partReplaced(job.machineId);
              world.technicianWork(false, job.machineId);
              job.phase = 'celebrate';
              job.readyAt = snapshot.t + 2;
            } finally {
              this.finishing = false;
            }
          }
          break;
        case 'celebrate':
          if (snapshot.t >= job.readyAt) {
            world.technicianLeave(job.machineId);
            world.robotGoTo('home');
            this.job = null;
            this.engine.completePreset();
          }
          break;
      }
      return;
    }
    const machine = MACHINES.find((m) => snapshot.machines[m.id]?.status === 'down');
    if (!machine) return;
    const parts = snapshot.machines[machine.id].components;
    const source = machine.components.find((c) => parts[c.id].status !== 'ok'
      && c.effects?.some((effect) => parts[effect.target]?.status === 'fault'));
    const part = source || machine.components.find((c) => parts[c.id].status === 'fault');
    if (!part) return;
    this.job = { machineId: machine.id, componentId: part.id, phase: 'inspect' };
    world.robotGoTo(machine.id);
  }
}
