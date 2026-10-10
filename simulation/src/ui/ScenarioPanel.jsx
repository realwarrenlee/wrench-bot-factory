import { useRef, useState } from 'react';
import { Factory, Radio, Zap, Cog, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const ICONS = [Radio, Zap, Cog];
const price = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 });

export function ScenarioPanel({ presets, selected, onPick, purchases = [] }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(id) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onPick(id);
    } catch (err) {
      setError(err?.message || 'Could not start this scenario. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <aside className="scenario-sidebar" aria-label="Simulation controls">
      <header className="flex items-center gap-3 px-1">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <Factory className="size-5 text-zinc-200" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Wrench Bot Factory</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Factory simulation</p>
        </div>
      </header>
      <Separator className="sidebar-divider bg-white/8" />
      <nav className="sidebar-scenarios" aria-labelledby="scenarios-title">
        <div className="mb-4 flex items-center justify-between px-1">
          <h2 id="scenarios-title" className="text-xs font-medium text-zinc-400">Scenarios</h2>
        </div>
        <div className="scenario-list">
          {presets.map((preset, index) => {
            const Icon = ICONS[index] || Cog;
            const active = selected === preset.id;
            return (
              <Button key={preset.id} variant="ghost" disabled={busy} onClick={() => pick(preset.id)}
                aria-pressed={active} data-preset={preset.id} title={`Start ${preset.name} (restarts the shift)`}
                className={cn('scenario-option h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-xl border p-3.5 text-left transition-colors',
                  active ? 'border-white/12 bg-white/6 hover:bg-white/8' : 'border-transparent hover:border-white/6 hover:bg-white/4')}>
                <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
                  active ? 'border-white/12 bg-white/8 text-zinc-100' : 'border-white/6 text-zinc-400')}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('text-[13px] font-medium', active ? 'text-zinc-100' : 'text-zinc-300')}>{preset.name}</span>
                    {active && <Badge variant="secondary" className="rounded-md bg-white/10 px-1.5 py-0 text-[9px] font-medium text-zinc-300">Active</Badge>}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed font-normal text-zinc-400">{preset.tagline}</span>
                </span>
              </Button>
            );
          })}
        </div>
        {error && <p role="alert" className="mt-3 px-1 text-xs text-red-300">{error}</p>}
      </nav>
      <Separator className="bg-white/8" />
      <section className="sidebar-recent flex min-h-0 flex-1 flex-col" aria-labelledby="recent-title">
        <h2 id="recent-title" className="mb-3 px-1 text-xs font-medium text-zinc-400">Recent</h2>
        {purchases.length ? (
          <div className="recent-scroll min-h-0 flex-1 overflow-y-auto rounded-md focus-visible:outline-offset-2" tabIndex={0} role="region" aria-label="Recent purchases">
            <ul className="divide-y divide-white/6">
              {purchases.map(purchase => (
                <li key={purchase.id} className="flex items-start gap-2.5 px-1 py-3">
                  <Package className="mt-0.5 size-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-300">{purchase.name}</span>
                  <span className="shrink-0 text-xs leading-relaxed font-medium text-zinc-200 tabular-nums">{price.format(purchase.priceCents / 100)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="px-1 text-xs text-zinc-500">No purchases yet</p>}
      </section>
    </aside>
  );
}
