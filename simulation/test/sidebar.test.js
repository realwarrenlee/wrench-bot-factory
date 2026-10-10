import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRESETS } from '../src/sim/definitions.js';

test('scenario panel exposes each scenario and one clearly selected button', async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { ScenarioPanel } = await server.ssrLoadModule('/src/ui/scenarios.js');
    assert.equal(typeof ScenarioPanel, 'function', 'sidebar renders with React and shadcn');
    const html = renderToStaticMarkup(createElement(ScenarioPanel, {
      presets: PRESETS, selected: 'brownout', onPick() {},
    }));
    for (const preset of PRESETS) assert.ok(html.includes(preset.name));
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.match(html, /data-slot="button"/);
    assert.ok(!html.includes('Start a fresh shift'));
    const idle = renderToStaticMarkup(createElement(ScenarioPanel, {
      presets: PRESETS, selected: undefined, onPick() {},
    }));
    assert.ok(!idle.includes('aria-pressed="true"'));
    assert.ok(!idle.includes('>Active<'));
    assert.ok(idle.includes('No purchases yet'));
    const recent = renderToStaticMarkup(createElement(ScenarioPanel, {
      presets: PRESETS, purchases: [{ id: 1, name: '24V power supply', priceCents: 10000 }], onPick() {},
    }));
    assert.ok(recent.includes('24V power supply'));
    assert.ok(recent.includes('$100'));
    assert.ok(!recent.includes('$100.00'));
    assert.ok(recent.includes('aria-label="Recent purchases"'));
    assert.ok(!recent.includes('No purchases yet'));
  } finally {
    await server.close();
  }
});
