import { MessageLoop } from '@lumino/messaging';
import { SplitPanel, Widget } from '@lumino/widgets';

import type { Area } from '../model';
import { PanePanel } from '../ui/panels';

function views() {
  return {
    source: new Widget(),
    outputs: new Widget(),
    diagnostics: new Widget(),
    files: new Widget(),
    terminal: new Widget(),
    run: new Widget(),
    pipelines: new Widget(),
    comparison: new Widget()
  };
}

it('restores saved splits and tab groups and reveals inactive panes', () => {
  const panes = views();
  const changed = jest.fn();
  const area: Area = {
    type: 'split-area',
    orientation: 'horizontal',
    sizes: [0.3, 0.7],
    children: [
      {
        type: 'tab-area',
        widgets: ['outputs', 'source'],
        currentIndex: 0
      },
      { type: 'tab-area', widgets: ['diagnostics'], currentIndex: 0 }
    ]
  };
  const panel = new PanePanel(panes, area, changed);
  expect(panel.save()).toEqual(area);
  expect(panes.source.isHidden).toBe(true);
  expect(changed).not.toHaveBeenCalled();
  panel.activatePane('source');
  expect(panes.source.isHidden).toBe(false);
  expect(panes.outputs.isHidden).toBe(true);
  expect(panel.save()).toEqual({
    ...area,
    children: [{ ...area.children[0], currentIndex: 1 }, area.children[1]]
  });
  expect(changed).toHaveBeenCalledTimes(1);
  panel.dispose();
  expect(Object.values(panes).every(pane => pane.isDisposed)).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
});

it('resets containers while retaining views and saving once', () => {
  const panes = views();
  const changes: Area[] = [];
  const panel = new PanePanel(
    panes,
    {
      type: 'tab-area',
      widgets: ['outputs', 'source', 'diagnostics'],
      currentIndex: 0
    },
    () => changes.push(panel.save())
  );
  const previous = panel.widgets[0];
  panel.reset();
  expect(previous.isDisposed).toBe(true);
  expect(changes).toEqual([panel.save()]);
  expect(panel.save().type).toBe('split-area');
  for (const pane of Object.values(panes)) {
    expect(pane.isDisposed).toBe(false);
    if (pane !== panes.comparison) {
      expect(panel.contains(pane)).toBe(true);
    }
  }
  panel.dispose();
  expect(changes).toHaveLength(1);
});

it('preserves pane proportions while the host restores its size', () => {
  const panel = new PanePanel(
    views(),
    {
      type: 'split-area',
      orientation: 'horizontal',
      sizes: [0.3, 0.7],
      children: [
        { type: 'tab-area', widgets: ['source'], currentIndex: 0 },
        {
          type: 'tab-area',
          widgets: ['outputs', 'diagnostics'],
          currentIndex: 0
        }
      ]
    },
    () => {}
  );
  const split = panel.widgets[0];
  if (!(split instanceof SplitPanel)) {
    throw new Error('Expected a split panel.');
  }
  Widget.attach(panel, document.body);
  try {
    // Jupyter can attach the workbench before restoring its sidebars.
    MessageLoop.sendMessage(split, new Widget.ResizeMessage(1200, 600));
    MessageLoop.sendMessage(split, new Widget.ResizeMessage(950, 600));
    expect(split.relativeSizes()[0]).toBeCloseTo(0.3);
    MessageLoop.sendMessage(split, new Widget.ResizeMessage(1200, 600));
    expect(split.relativeSizes()[0]).toBeCloseTo(0.3);
  } finally {
    panel.dispose();
  }
});
