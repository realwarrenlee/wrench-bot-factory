// Machines, sensor thresholds, and component effects for the factory simulation.
// Purchase prices: rounded SGD amounts chosen for the simulation.
export const MACHINES = [
  {
    id: 'conveyor',
    name: 'Conveyor',
    pos: [-6, 0],
    components: [
      {
        id: 'drive-motor', name: 'Drive stepper motor',
        signals: [
          { key: 'motorTemp', nominal: 45, warn: 62, fail: 90 },
          { key: 'beltSpeed', nominal: 0.5, warn: 0.4, fail: 0.1 },
        ],
      },
      {
        id: 'motor-driver', name: 'Motor driver board',
        signals: [
          { key: 'driverTemp', nominal: 40, warn: 58, fail: 85 },
          { key: 'stepRate', nominal: 100, warn: 88, fail: 20 },
        ],
        effects: [{ target: 'drive-motor', signal: 'beltSpeed', weight: 0.9 }],
      },
      {
        id: 'roller-bearing', name: 'Roller bearing',
        purchase: { priceCents: 1000, source: 'https://sg.rs-online.com/web/p/ball-bearings/2867956' },
        signals: [
          { key: 'vibration', nominal: 1.8, warn: 4.0, fail: 9.0 },
          { key: 'noise', nominal: 62, warn: 70, fail: 88 },
        ],
        effects: [{ target: 'drive-motor', signal: 'motorTemp', weight: 0.4 }],
      },
      {
        id: 'main-fuse', name: 'Main fuse',
        signals: [{ key: 'busVoltage', nominal: 24, warn: 22.5, fail: 0 }],
        effects: [{ target: 'drive-motor', signal: 'beltSpeed', weight: 1.0 }],
      },
    ],
  },
  {
    id: 'sorter',
    name: 'Sorter',
    pos: [-2, 0],
    components: [
      {
        id: 'prox-sensor', name: 'Inductive proximity sensor',
        purchase: { priceCents: 6000, source: 'https://sg.rs-online.com/web/p/proximity-sensors/2522024' },
        signals: [
          { key: 'sensorSignal', nominal: 96, warn: 70, fail: 8 },
          { key: 'detectRate', nominal: 99.5, warn: 95, fail: 20 },
        ],
      },
      {
        id: 'relay-board', name: 'Relay board',
        signals: [
          { key: 'contactRes', nominal: 45, warn: 140, fail: 600 },
          { key: 'gateFire', nominal: 100, warn: 96, fail: 10 },
        ],
      },
      {
        id: 'limit-switch', name: 'Gate limit switch',
        signals: [{ key: 'switchResponse', nominal: 14, warn: 40, fail: 250 }],
        effects: [{ target: 'relay-board', signal: 'gateFire', weight: 0.5 }],
      },
      {
        id: 'indicator-light', name: 'Status indicator light',
        signals: [{ key: 'lampCurrent', nominal: 20, warn: 14, fail: 0 }],
      },
    ],
  },
  {
    id: 'arm',
    name: 'Robot Arm',
    pos: [2, 0],
    components: [
      {
        id: 'gripper-servo', name: 'Gripper servo',
        signals: [
          { key: 'posError', nominal: 0.4, warn: 1.5, fail: 5.0 },
          { key: 'servoTemp', nominal: 42, warn: 58, fail: 80 },
        ],
      },
      {
        id: 'arm-psu', name: '24V power supply',
        purchase: { priceCents: 10000, source: 'https://sg.rs-online.com/web/p/din-rail-power-supplies/7654651' },
        signals: [
          { key: 'railVoltage', nominal: 24.1, warn: 23.2, fail: 19.5 },
          { key: 'ripple', nominal: 35, warn: 120, fail: 450 },
        ],
        // A sagging rail starves the servo first: its position error crosses
        // FAULT while the supply itself only shows WARN. Classic misdiagnosis.
        effects: [
          { target: 'gripper-servo', signal: 'posError', weight: 1.6 },
          { target: 'arm-driver', signal: 'jointSpeed', weight: 0.5 },
        ],
      },
      {
        id: 'estop', name: 'Emergency stop button',
        signals: [{ key: 'safetyLoop', nominal: 100, warn: 92, fail: 0 }],
      },
      {
        id: 'arm-driver', name: 'Motor driver',
        signals: [
          { key: 'armDriverTemp', nominal: 41, warn: 60, fail: 88 },
          { key: 'jointSpeed', nominal: 100, warn: 85, fail: 15 },
        ],
      },
    ],
  },
  {
    id: 'packer',
    name: 'Packer',
    pos: [6, 0],
    components: [
      {
        id: 'net-switch', name: 'Network switch',
        signals: [
          { key: 'packetLoss', nominal: 0.1, warn: 2, fail: 40 },
          { key: 'latency', nominal: 2, warn: 25, fail: 400 },
        ],
      },
      {
        id: 'cooling-fan', name: 'Cooling fan',
        signals: [
          { key: 'fanRpm', nominal: 2400, warn: 1700, fail: 0 },
          { key: 'cabinetTemp', nominal: 34, warn: 46, fail: 68 },
        ],
        // A hot cabinet makes the switch drop packets.
        effects: [{ target: 'net-switch', signal: 'packetLoss', weight: 0.7 }],
      },
      {
        id: 'barcode-scanner', name: 'Barcode scanner',
        signals: [{ key: 'readRate', nominal: 99.2, warn: 94, fail: 25 }],
      },
    ],
  },
];

// All times are game-minutes; loading a scenario resets the shift.
export const PRESETS = [
  {
    id: 'first-failure', name: 'Sensor burnout',
    tagline: 'A sensor fails and stops the sorter.',
    script: [{ at: 3, target: 'sorter/prox-sensor', health: 0 }],
  },
  {
    id: 'brownout', name: 'Brownout',
    tagline: 'The servo reports a fault.',
    initial: { 'arm/arm-psu': 0.55 },
    script: [{ at: 1, target: 'arm/arm-psu', degradeTo: 0.1, over: 6 }],
  },
  {
    id: 'predictive', name: 'Grinding noise',
    tagline: 'A bearing wears out.',
    initial: { 'conveyor/roller-bearing': 0.5 },
    script: [{ at: 0, target: 'conveyor/roller-bearing', degradeTo: 0, over: 30 }],
  },
];

