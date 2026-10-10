import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ScenarioPanel } from './ScenarioPanel.jsx';

export { ScenarioPanel };

export class ScenarioSidebar {
  constructor(root, { presets, onPick }) {
    this.root = createRoot(root);
    this.props = { presets, onPick };
  }

  update(sim) {
    this.root.render(createElement(ScenarioPanel, { ...this.props, selected: sim.preset?.id, purchases: sim.purchases }));
  }
}
