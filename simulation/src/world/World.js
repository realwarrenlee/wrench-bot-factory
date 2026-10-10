// Three.js factory floor: clean low-poly look rendered at full resolution
// (antialiased, sRGB, ACES tone mapping, soft shadows, adaptive pixel ratio),
// a 3/4 perspective camera that auto-frames the line (and eases over to the
// loading dock while a delivery is on), and OrbitControls (damped, clamped).
// No real point lights: lamps and screens are self-lit (cheap per pixel).
//
// Camera: drag = orbit, right-drag / two fingers = pan, wheel / pinch = zoom,
// double-click empty floor = back to the default view. Once the player moves
// the camera, auto-framing stops until that double-click (or resetView()).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp, lerp, easeInOutCubic } from './palette.js';
import { buildEnvironment, LAYOUT, FOG } from './environment.js';
import { ProductionLine } from './line.js';
import { MachineView, normStatus } from './machines.js';
import { Robot } from './robot.js';
import { TruckFleet } from './truck.js';
import { TechCrew } from './technician.js';
import { Effects } from './effects.js';

const FOV = 30;
const YAW = 0.28; // slight three-quarter view keeps the whole line readable
const PITCH = 0.74; // look down enough to see the floor and repair activity
const LIMITS = { minDist: 8, maxDist: 44, minPolar: 0.32, maxPolar: 1.3, minAz: -0.55, maxAz: 1.55 };
const PAN = { x0: -10.5, x1: 11.5, y0: -0.5, y1: 3, z0: -3.5, z1: 7.5 }; // where the orbit target may go

// Frame the building inside the canvas beside the scenario sidebar.
const FIT_POINTS = [
  [LAYOUT.floor.x0, -0.9, LAYOUT.floor.z0], [LAYOUT.floor.x1, -0.9, LAYOUT.floor.z0],
  [LAYOUT.floor.x0, -0.9, LAYOUT.floor.z1], [LAYOUT.floor.x1, -0.9, LAYOUT.floor.z1],
  [LAYOUT.floor.x0, 5.2, LAYOUT.floor.z0], [LAYOUT.floor.x1, 5.2, LAYOUT.floor.z0],
  [LAYOUT.floor.x0, 5.2, LAYOUT.floor.z1], [LAYOUT.floor.x1, 5.2, LAYOUT.floor.z1],
  [5.4, -0.9, 9.5], [7.8, 0, 9.5], // front steps
  [-14, -0.9, 16], [18, -0.9, 16], // road and fenced frontage
  [-12, 6.3, -12], [14, 6.9, -14], // background context without shrinking the factory
  [-24, 6.3, 4], // show the neighbouring warehouse on the left
];
const FIT_MARGIN = 0.92;
// Widen for the docked truck while keeping the entire factory in view.
const DOCK_FIT = [
  ...FIT_POINTS,
  [18.5, -0.9, 4.6], [18.5, -0.9, 7.0],
  [18.5, 2.3, 4.6], [18.5, 2.3, 7.0],
];

const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const ndc = new THREE.Vector2();

const dirOf = (yaw, pitch, out) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

export class World {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    // clean backdrop: the yard's radial gradient fades into this colour
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = new THREE.Fog(FOG, 55, 135);
    this.clock = new THREE.Clock();
    this.machines = new Map(); // id → MachineView
    this.places = {};
    this.lineWanted = true;
    this.failed = 0;
    this.userMoved = false; // the player moved the camera: stop auto-framing
    this.fly = null; // camera animation { from, to, t, dur }
    this.grab = null; // camera pose when the player grabbed the controls
    this.view = 'home'; // auto-framing: 'home' | 'dock'
    this.dockUntil = 0;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    this.prCap = 2; // pixel-ratio ceiling, lowered if frames get slow (see #adapt)
    this.perf = { warm: 0, acc: 0, n: 0 };
    r.setPixelRatio(this.#pixelRatio());
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // inline style beats any stylesheet `image-rendering: pixelated`
    r.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;image-rendering:auto;outline:none';
    container.appendChild(r.domElement);
    try {
      const pmrem = new THREE.PMREMGenerator(r);
      const room = new RoomEnvironment();
      this.scene.environment = pmrem.fromScene(room, 0.04).texture;
      this.scene.environmentIntensity = 0.42;
      room.dispose?.();
      pmrem.dispose();
    } catch (err) {
      console.warn('[world] environment map unavailable', err);
    }

    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400);
    this.fitCam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400); // scratch camera for framing
    this.#controls();

    this.#lights();
    this.fx = new Effects(this.scene);
    this.env = buildEnvironment(this.scene);
    this.line = new ProductionLine(this.scene, this.fx);
    this.fleet = new TruckFleet(this.scene, this.fx, this.env.dockDoor);
    this.crew = new TechCrew(this.scene, this.fx);
    this.#places();
    const home = this.places.home;
    this.robot = new Robot(this.scene, home);
    this.robot.onArrive = (place) => this.#robotArrived(place);
    this.errand = null; // robot fetching a crate from the dock: { after, crate, arrivedAt }
    this.raycaster = new THREE.Raycaster();
    this.hitboxes = [];
    this.techPos = [];

    this.#input();
    this.onResize = () => this.#resize();
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this.onResize);
      this.ro.observe(container);
    }
    this.#resize();
    this.#intro();
    this.renderer.setAnimationLoop(() => this.#tick());
  }

  // ─── Setup ─────────────────────────────────────────────────────────────
  #lights() {
    this.scene.add(new THREE.HemisphereLight('#eef3ff', '#5a5266', 1.25));
    const sun = new THREE.DirectionalLight('#fff3e0', 2.5);
    sun.position.set(-6, 20, 12);
    sun.target.position.set(1.5, 0, 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 16, bottom: -16, near: 2, far: 60 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight('#b4c8ff', 0.6);
    fill.position.set(16, 7, -5);
    this.scene.add(fill);
  }

  #controls() {
    const c = (this.controls = new OrbitControls(this.camera, this.renderer.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.45;
    c.zoomSpeed = 0.9;
    c.panSpeed = 0.8;
    c.screenSpacePanning = false; // pan across the floor
    c.zoomToCursor = false;
    c.minDistance = LIMITS.minDist;
    c.maxDistance = LIMITS.maxDist;
    c.minPolarAngle = LIMITS.minPolar;
    c.maxPolarAngle = LIMITS.maxPolar;
    c.minAzimuthAngle = LIMITS.minAz;
    c.maxAzimuthAngle = LIMITS.maxAz;
    // A drag that moves the camera hands it to the player (no more auto
    // framing until resetView); a plain click on a machine does not.
    c.addEventListener('start', () => {
      this.grab = { pos: this.camera.position.clone(), target: c.target.clone(), to: this.fly?.to || null };
      this.fly = null;
    });
    c.addEventListener('end', () => {
      const g = this.grab;
      this.grab = null;
      if (!g) return;
      if (g.pos.distanceToSquared(this.camera.position) > 1e-4 || g.target.distanceToSquared(c.target) > 1e-4) this.userMoved = true;
      else if (g.to && !this.userMoved) this.#flyTo(g.to, 0.8);
    });
  }

  #places() {
    const L = LAYOUT;
    const T = L.terminal;
    const nx = Math.sin(T.yaw);
    const nz = Math.cos(T.yaw);
    this.places.home = { x: L.home.x, z: L.home.z, yaw: YAW, kind: 'home', id: 'home' };
    this.places.terminal = { x: T.x + nx * 1.2, z: T.z + nz * 1.2, yaw: Math.atan2(-nx, -nz), kind: 'terminal', id: 'terminal' };
    const [cx, cz] = L.crateSlots[0];
    this.places.dock = { x: L.robotDock.x, z: L.robotDock.z, yaw: Math.atan2(cx - L.robotDock.x, cz + 0.5 - L.robotDock.z), kind: 'dock', id: 'dock' };
  }

  #input() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      if (e.buttons) el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointerup', () => { el.style.cursor = ''; });
    el.addEventListener('pointerleave', () => { el.style.cursor = ''; });
    el.addEventListener('wheel', () => {
      this.userMoved = true; // zooming (OrbitControls applies it after its 'end' event)
      this.fly = null;
    }, { passive: true });
    el.addEventListener('dblclick', (e) => {
      if (!this.#pick(e)) this.resetView();
    });
  }

  #pick(e) {
    if (!this.hitboxes.length) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.hitboxes, false)[0];
    return hit?.object.userData.machineId || null;
  }

  #fitPose(w, h, points = FIT_POINTS) {
    const ins = { top: 16, right: 16, bottom: 16, left: 16 };
    const left = clamp(Number(ins.left) || 0, 0, w * 0.45);
    const right = clamp(Number(ins.right) || 0, 0, w * 0.5);
    const top = clamp(Number(ins.top) || 0, 0, h * 0.4);
    const bottom = clamp(Number(ins.bottom) || 0, 0, h * 0.45);
    const M = FIT_MARGIN;
    const X0 = ((left / w) * 2 - 1) * M;
    const X1 = (((w - right) / w) * 2 - 1) * M;
    const Y0 = (1 - ((h - bottom) / h) * 2) * M;
    const Y1 = (1 - (top / h) * 2) * M;
    const cam = this.fitCam;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const dir = dirOf(YAW, PITCH, new THREE.Vector3());
    const target = new THREE.Vector3(0, 0.6, 1.8);
    let dist = 30;
    const right3 = new THREE.Vector3();
    const up3 = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [x, y, z] of points) {
        tmpV.set(x, y, z).project(cam);
        x0 = Math.min(x0, tmpV.x);
        x1 = Math.max(x1, tmpV.x);
        y0 = Math.min(y0, tmpV.y);
        y1 = Math.max(y1, tmpV.y);
      }
      const k = Math.max((x1 - x0) / (X1 - X0), (y1 - y0) / (Y1 - Y0));
      const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist;
      const halfW = halfH * cam.aspect;
      right3.setFromMatrixColumn(cam.matrixWorld, 0);
      up3.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right3, (((x0 + x1) - (X0 + X1)) / 2) * halfW * 0.9);
      target.addScaledVector(up3, (((y0 + y1) - (Y0 + Y1)) / 2) * halfH * 0.9);
      dist = clamp(dist * (1 + (k - 1) * 0.85), LIMITS.minDist, 150); // portrait screens need to back off further
    }
    return { target, dist, yaw: YAW, pitch: PITCH };
  }

  #viewPose() {
    return (this.view === 'dock' && this.dockPose) || this.home;
  }

  // Ease over to the dock while a delivery is happening, back home after.
  #updateView() {
    const r = this.robot;
    const want = this.fleet.busy || (r.place.kind === 'dock' && (r.moving || r.busy || r.time - r.arrivedAt < 2));
    if (want) this.dockUntil = this.time + 1.2;
    const view = this.time < this.dockUntil ? 'dock' : 'home';
    if (view === this.view) return;
    this.view = view;
    if (!this.userMoved && !this.grab) this.#flyTo(this.#viewPose(), view === 'dock' ? 1.6 : 1.3);
  }

  #applyPose(p) {
    this.controls.target.copy(p.target);
    this.camera.position.copy(p.target).addScaledVector(dirOf(p.yaw, p.pitch, tmpD), p.dist);
    this.camera.lookAt(p.target);
  }

  #currentPose() {
    const off = tmpD.subVectors(this.camera.position, this.controls.target);
    const dist = off.length() || 1;
    return { target: this.controls.target.clone(), dist, yaw: Math.atan2(off.x, off.z), pitch: Math.asin(clamp(off.y / dist, -1, 1)) };
  }

  #flyTo(to, dur, from = this.#currentPose()) {
    this.fly = { from, to, t: 0, dur };
  }

  // Settle into the view without rotating the factory on startup.
  #intro() {
    if (!this.home) this.home = this.#fitPose(innerWidth || 1280, innerHeight || 720);
    const to = this.home;
    const from = { ...to, target: to.target.clone(), dist: to.dist * 1.08 };
    this.#applyPose(from);
    this.#flyTo(to, 0.9, from);
  }

  #updateFly(dt) {
    const f = this.fly;
    if (!f) return;
    f.t += dt;
    const k = easeInOutCubic(f.t / f.dur);
    const { from, to } = f;
    const p = {
      target: tmpV.lerpVectors(from.target, to.target, k),
      dist: lerp(from.dist, to.dist, k),
      yaw: lerp(from.yaw, to.yaw, k),
      pitch: lerp(from.pitch, to.pitch, k),
    };
    this.#applyPose(p);
    if (f.t >= f.dur) this.fly = null;
  }

  // keep the orbit target over the factory (moves the camera along with it)
  #clampTarget() {
    const t = this.controls.target;
    const x = clamp(t.x, PAN.x0, PAN.x1);
    const y = clamp(t.y, PAN.y0, PAN.y1);
    const z = clamp(t.z, PAN.z0, PAN.z1);
    if (x === t.x && y === t.y && z === t.z) return;
    tmpD.set(x - t.x, y - t.y, z - t.z);
    t.add(tmpD);
    this.camera.position.add(tmpD);
  }

  #resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(this.#pixelRatio());
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.home = this.#fitPose(w, h);
    this.dockPose = this.#fitPose(w, h, DOCK_FIT);
    // Keep the factory clear when portrait framing backs the camera away.
    this.scene.fog.near = Math.max(55, this.dockPose.dist + 20);
    this.scene.fog.far = this.scene.fog.near + 80;
    this.controls.maxDistance = Math.max(LIMITS.maxDist, this.home.dist * 1.25, this.dockPose.dist * 1.1);
    if (this.fly) {
      if (!this.userMoved) this.fly.to = this.#viewPose();
    } else if (!this.userMoved && !this.grab) {
      this.#applyPose(this.#viewPose());
    }
  }

  #pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.prCap);
  }

  // Dynamic resolution safety net: if the average frame stays slower than
  // ~40 fps, step the pixel ratio down (2 → 1.75 → 1.5 → 1.25 → 1). Never up.
  #adapt(real) {
    const p = this.perf;
    p.warm += real;
    if (p.warm < 4 || real > 0.25 || document.hidden) return; // start-up compiles, hitches, tab switches
    p.acc += real;
    if (++p.n < 90) return;
    const avg = p.acc / p.n;
    p.acc = 0;
    p.n = 0;
    if (avg > 1 / 40 && this.#pixelRatio() > 1) {
      this.prCap = Math.max(1, this.#pixelRatio() - 0.25);
      this.#resize();
    }
  }

  // ─── Loop ──────────────────────────────────────────────────────────────
  #tick() {
    try {
      const real = this.clock.getDelta();
      this.#adapt(real);
      const dt = Math.min(real, 0.05);
      this.time = (this.time || 0) + dt;
      const t = this.time;
      this.#updateFly(Math.min(real, 0.2)); // camera moves follow wall time even on slow frames
      this.controls.update();
      this.#clampTarget();
      this.line.setRunning(this.lineWanted);
      this.line.update(dt);
      for (const m of this.machines.values()) m.update(dt, t);
      this.robot.update(dt, t);
      this.fleet.update(dt, t);
      this.#updateErrand();
      this.#updateView();
      this.crew.update(dt, t);
      this.crew.positions(this.techPos);
      this.env.terminal.update(dt, t, this.robot.atTerminal);
      this.env.dockDoor.update(dt);
      this.env.staffDoor.update(dt, this.techPos);
      this.env.clock.update(dt);
      this.env.pad.update(dt, t, this.robot.atHome);
      this.fx.update(dt);
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      // keep the loop alive; report the first few failures only
      if (this.failed++ < 3) console.error('[world] frame failed', err);
    }
  }

  // ─── Crate logistics (Wrench-bot fetches deliveries) ───────────────────
  #endErrand() {
    const e = this.errand;
    if (e?.crate && e.crate.state !== 'carried') this.fleet.releaseCrate(e.crate);
    this.errand = null;
  }

  #updateErrand() {
    const e = this.errand;
    const r = this.robot;
    if (!e || r.moving || r.busy || r.place.kind !== 'dock') return;
    if (r.carrying) {
      // picked up: carry it to the machine that is waiting, or hold it until told
      this.errand = null;
      if (e.after) this.#send(e.after);
      return;
    }
    if (e.crate && !this.fleet.crates.includes(e.crate)) e.crate = null;
    if (!e.crate) e.crate = this.fleet.claimCrate();
    if (e.crate?.state === 'ready') {
      r.pickUp(e.crate);
      return;
    }
    if (!e.arrivedAt) e.arrivedAt = this.time;
    const waited = this.time - e.arrivedAt;
    const nothing = !e.crate && !this.fleet.inbound;
    if (nothing || (e.after && waited > 8)) {
      const after = e.after;
      this.#endErrand();
      if (after) this.#send(after);
    }
  }

  // Walk the robot to a place; machine trips go along the aisle so it doesn't
  // cut through technicians working at other machines.
  #send(p) {
    const r = this.robot.root.position;
    const via = [];
    const A = LAYOUT.aisleZ;
    if (p.kind === 'machine' && Math.abs(p.x - r.x) > 1.6) {
      if (r.z < A - 0.4) via.push([r.x, A]);
      via.push([p.x, A]);
    }
    this.robot.goTo(p.x, p.z, p.yaw, p, via);
  }

  #robotArrived(place) {
    const r = this.robot;
    if (!r.carrying) return;
    if (place.kind === 'machine') {
      const m = this.machines.get(place.id);
      if (m) r.drop(m.x - 2.0, m.z + 2.1, (c) => {
        c.state = 'placed';
        c.machineId = place.id;
      });
    } else if (place.kind === 'home') {
      const h = this.places.home;
      r.drop(h.x + 1.2, h.z - 0.3, (c) => {
        c.state = 'ready';
        c.claimed = false;
      });
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────
  setMachines(defs) {
    if (!Array.isArray(defs)) return;
    for (const def of defs) {
      if (!def || !def.id || this.machines.has(def.id)) continue;
      const m = new MachineView(def, this.fx, this.line);
      this.scene.add(m.group);
      this.machines.set(def.id, m);
      this.hitboxes.push(m.hit);
      const x = m.x - 1.0; // front-left of the machine, so Wrench-bot doesn't hide it
      const z = m.z + 2.5;
      this.places[def.id] = { x, z, yaw: Math.atan2(m.x - x, m.z - z), kind: 'machine', id: def.id, scan: { x: m.x, z: m.z } };
    }
  }

  setMachineStatus(id, status, degraded = false) {
    if (!normStatus(status)) return;
    const m = this.machines.get(id);
    if (m) m.setStatus(status, degraded);
  }

  setLineRunning(running) {
    this.lineWanted = !!running;
  }

  robotGoTo(place) {
    const p = this.places[place];
    if (!p) return;
    const r = this.robot;
    if (p.kind === 'dock') {
      // fetch the delivered crate; a later machine order waits until it is picked up
      if (!this.errand && !r.carrying) this.errand = { after: null, crate: null, arrivedAt: 0 };
      this.#send(p);
      return;
    }
    if (this.errand && p.kind === 'machine') {
      this.errand.after = p;
      if (r.place.kind !== 'dock') this.#send(this.places.dock);
      return;
    }
    this.#endErrand();
    this.#send(p);
  }

  robotThinking(on) {
    this.robot.setThinking(!!on);
  }

  robotAt(place) {
    const r = this.robot;
    return r.place.id === place && !r.moving && !r.busy && !r.queue.length && r.root.position.distanceTo(r.target) < 0.05;
  }

  spawnTruck(etaSeconds) {
    this.fleet.spawn(etaSeconds);
  }

  technicianArrive(machineId, tech) {
    let m = this.machines.get(machineId);
    if (!m) m = [...this.machines.values()].find((x) => x.status !== 'running') || null;
    if (!m) return;
    this.crew.arrive(m, tech || {});
  }

  technicianAt(machineId) {
    return !!this.crew.get(machineId)?.arrived;
  }

  // machineId identifies the technician servicing this machine.
  technicianWork(on, machineId) {
    this.crew.work(!!on, machineId);
  }

  technicianLeave(machineId) {
    this.crew.leave(machineId);
  }

  partReplaced(machineId) {
    const m = this.machines.get(machineId);
    if (m) {
      this.fx.burst('confetti', m.x, 3.3, m.z, 64);
      this.fx.burst('twinkle', m.x, 2.6, m.z, 10);
      this.fx.ring(m.x, m.z, '#7dff8a', { from: 0.6, to: 3.4, dur: 0.9 });
      this.fx.ring(m.x, m.z, '#ffd04a', { from: 0.3, to: 2.4, dur: 0.6 });
    }
    this.crew.replaced(machineId);
    // the delivered crate is used up: the one set down at this machine, else the one
    // Wrench-bot is carrying, else the oldest waiting on the dock
    const crates = this.fleet.crates;
    const crate = crates.find((c) => c.state === 'placed' && c.machineId === machineId)
      || this.robot.carrying
      || crates.find((c) => c.state === 'carried') // being set down right now
      || crates.find((c) => c.state === 'ready' && !c.claimed)
      || crates.find((c) => c.state === 'ready')
      || null;
    if (crate) {
      this.robot.forget(crate);
      this.fleet.removeCrate(crate, true);
    }
  }

  // Fly the camera back to the default framing.
  resetView() {
    this.userMoved = false;
    this.#flyTo(this.#viewPose(), 0.9);
  }

  // Wall clock follows the shift clock ('HH:MM').
  setClock(clock) {
    this.env.clock.feed(clock);
  }

  // Clear transient actors (trucks, crates, technicians, particles) — e.g. when a preset loads.
  reset() {
    this.errand = null;
    this.dockUntil = 0;
    this.view = 'home';
    this.resetView();
    this.robot.clearCarry();
    this.fleet.reset();
    this.crew.reset();
    this.fx.clear();
    const h = this.places.home;
    this.robot.goTo(h.x, h.z, h.yaw, h);
    this.robot.setThinking(false);
  }

}
