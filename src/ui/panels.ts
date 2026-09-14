import { BoxPanel, SplitPanel, TabPanel } from '@lumino/widgets';
import type { Widget } from '@lumino/widgets';

import type { Area, Pane } from '../model';

interface ISection {
  widget: Widget;
  save(): Area;
  activate(pane: Pane): boolean;
}

const defaultArea: Area = {
  type: 'split-area',
  orientation: 'vertical',
  sizes: [0.75, 0.25],
  children: [
    {
      type: 'split-area',
      orientation: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        { type: 'tab-area', widgets: ['source'], currentIndex: 0 },
        { type: 'tab-area', widgets: ['assembly'], currentIndex: 0 }
      ]
    },
    { type: 'tab-area', widgets: ['diagnostics'], currentIndex: 0 }
  ]
};

/** Own pane composition; docking remains the responsibility of the host. */
export class PanePanel extends BoxPanel {
  constructor(
    private readonly panes: Readonly<Record<Pane, Widget>>,
    area: Area | null,
    private readonly onChange: () => void
  ) {
    super({ spacing: 0 });
    this.addClass('fortitudo-panels');
    this.section = this.create(area ?? defaultArea);
    this.addWidget(this.section.widget);
  }

  /** Save the existing area format, including previously docked tab groups. */
  save(): Area {
    return this.section.save();
  }

  /** Reuse the views while replacing and disposing their layout containers. */
  reset(): void {
    this.restoring = true;
    for (const pane of Object.values(this.panes)) {
      pane.parent = null;
    }
    this.section.widget.dispose();
    this.section = this.create(defaultArea);
    this.addWidget(this.section.widget);
    this.restoring = false;
    this.changed();
  }

  /** Reveal a pane before sending focus to its view. */
  activatePane(pane: Pane): void {
    this.section.activate(pane);
  }

  private create(area: Area): ISection {
    if (area.type === 'tab-area') {
      const panel = new TabPanel({ tabsMovable: false });
      for (const pane of area.widgets) {
        panel.addWidget(this.panes[pane]);
      }
      panel.currentIndex = area.currentIndex;
      panel.currentChanged.connect(this.changed, this);
      return {
        widget: panel,
        save: () => ({ ...area, currentIndex: panel.currentIndex }),
        activate: pane => {
          if (!area.widgets.includes(pane)) {
            return false;
          }
          panel.currentWidget = this.panes[pane];
          this.panes[pane].activate();
          return true;
        }
      };
    }
    const panel = new SplitPanel({ orientation: area.orientation });
    const children = area.children.map(child => this.create(child));
    for (const child of children) {
      panel.addWidget(child.widget);
    }
    panel.setRelativeSizes([...area.sizes]);
    panel.handleMoved.connect(this.changed, this);
    return {
      widget: panel,
      save: () => ({
        type: 'split-area',
        orientation: panel.orientation,
        sizes: panel.relativeSizes(),
        children: children.map(child => child.save())
      }),
      activate: pane => children.some(child => child.activate(pane))
    };
  }

  private changed(): void {
    if (!this.isDisposed && !this.restoring) {
      this.onChange();
    }
  }

  private section: ISection;
  private restoring = false;
}
