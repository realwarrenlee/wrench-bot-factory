# Wrench Bot Factory — simulation brief

A factory with four machines: **Conveyor → Sorter → Robot Arm → Packer**. Pick a scenario and watch the bot keep the line running.

## Factory behavior

Component wear changes machine status. Faults stop the affected machine and production line. Wrench Bot scans the failed machine, uses the computer to arrange parts, collects a truck delivery, and carries the crate to the machine. A human technician arrives, replaces the part, and leaves. The bot returns home and production resumes automatically.

Failures can affect neighboring components. In Brownout, the technician replaces the upstream power supply responsible for the servo fault.

## Scenarios

| Scenario | Animation |
| --- | --- |
| Sensor burnout | A failed sensor stops the sorter, then the technician replaces it |
| Brownout | A sagging power supply stops the robot arm, then the technician repairs the source |
| Grinding noise | A worn bearing fails, then the technician replaces it |

## Scope

The simulation runs entirely in the browser using Vite and Three.js. There are no manual repair panels, purchasing agents, payment integrations, or backend. Refreshing the page starts over.

See [README.md](README.md) for setup.
