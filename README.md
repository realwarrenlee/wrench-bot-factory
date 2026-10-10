# Wrench Bot Factory

This repository contains only the frontend demo for the **Reap Agentic Buildathon on 9 October 2026**. The buildathon submission is in [Aboyang/agentic-factory](https://github.com/Aboyang/agentic-factory).

Choose a scenario and watch Wrench Bot scan failures, arrange parts, and bring in a technician to restart the production line. This browser simulation runs standalone; no backend or API keys are required.

## Demo

Watch [wrench-bot-demo.mp4](wrench-bot-demo.mp4).

## Run

```powershell
cd simulation
npm install
npm run dev
```

Open [the simulation](http://localhost:5173).

## Controls

- The simulation starts automatically at 1× speed. The bot scans a failed machine, uses the computer, collects a parts delivery, and brings it to a human technician. After the repair, the technician leaves and the bot returns home.
- Drag to orbit the factory view; scroll to zoom. Double-click empty floor to reset the camera.

Machine lights and breakdown effects show the factory state. Each tab has its own simulation; refreshing resets the shift.

Scenarios start unselected and clear their active state after the repair finishes. The scrollable Recent list shows Wrench Bot's simulated purchases, newest first: a sensor costs S$60, a power supply S$100, and a bearing S$10. Purchase history stays between scenarios and clears on refresh.

The factory shares a simple industrial yard with three neighbouring warehouses, sparse greenery, and a fence along the street and pavement. The staff entrance and loading approach stay open; delivery trucks appear only during repairs.

## Scenarios

| Scenario | What to investigate |
| --- | --- |
| Sensor burnout | A failed sensor stops the sorter |
| Brownout | A sagging power supply causes a servo fault |
| Grinding noise | A worn bearing fails and a technician replaces it |

## Source

| Path | Responsibility |
| --- | --- |
| `simulation/src/sim/` | Machine definitions, scripted wear, factory status, and the repair sequence |
| `simulation/src/world/` | Three.js factory floor and animations |
| `simulation/src/ui/` | Scenario sidebar and recent purchases |

## Checks

Run from `simulation/`:

```powershell
npm test
npm run build
```

## Project notes

[IDEA.md](IDEA.md) describes the simulation. [INFO.md](INFO.md) preserves the original buildathon brief, and [MERCHANTS.md](MERCHANTS.md) preserves the merchant reference.
