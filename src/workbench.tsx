import type { CommandRegistry } from '@lumino/commands';
import type { IDisposable } from '@lumino/disposable';
import type { Message } from '@lumino/messaging';
import { BoxPanel, DockPanel } from '@lumino/widgets';
import type { DockLayout, Widget } from '@lumino/widgets';
import * as React from 'react';

import { CommandIDs, registerCommands } from './commands';
import { createCompiler } from './compiler/client';
import type { ICompiler } from './compiler/types';
import { initial, snapshot } from './model';
import type { Area, Pane, Session } from './model';
import { session } from './persistence';
import type { IPersistence } from './persistence';
import { createStore } from './state';
import type { IStore } from './state';
import { Bridge } from './ui/bridge';
import { ReactWidget } from './widget';

export interface IWorkbenchOptions {
  commands: CommandRegistry;
  workerUrl: URL;
  persistence: IPersistence;
  defaults?: Session;
}

/** Load editing state without initializing or invoking the compiler. */
export async function createWorkbench(
  options: IWorkbenchOptions
): Promise<Workbench> {
  let saved = options.defaults ?? null;
  let notice: string | null = null;
  try {
    const value = await options.persistence.load();
    if (value !== null && value !== undefined) {
      const parsed = session(value);
      if (parsed) {
        saved = parsed;
      } else {
        notice = 'Saved state is invalid. A default session was opened.';
      }
    }
  } catch (error) {
    notice = `Saved state could not be loaded: ${String(error)}`;
  }
  const store = createStore(initial(saved));
  if (notice) {
    store.dispatch({ type: 'notice', message: notice });
  }
  return new Workbench(options, store);
}

/** Own the complete session and release its resources when closed. */
export class Workbench extends BoxPanel {
  constructor(
    private readonly options: IWorkbenchOptions,
    private readonly store: IStore
  ) {
    super({ direction: 'top-to-bottom', spacing: 0 });
    this.id = 'fortitudo-workbench';
    this.title.label = 'Fortitudo';
    this.title.closable = true;
    this.addClass('fortitudo-workbench');
    this.compiler = createCompiler(options.workerUrl);
    const header = this.view('controls');
    header.addClass('fortitudo-header');
    this.addWidget(header);
    this.addWidget(this.dock);
    BoxPanel.setStretch(this.dock, 1);
    this.panes = {
      source: this.view('source'),
      assembly: this.view('assembly'),
      diagnostics: this.view('diagnostics')
    };
    this.panes.source.title.label = 'Source';
    this.panes.assembly.title.label = 'Assembly';
    this.panes.diagnostics.title.label = 'Diagnostics';
    this.registered = registerCommands(options.commands, {
      store,
      compiler: this.compiler,
      resetLayout: () => this.restore(null),
      close: () => this.close()
    });
    this.binding = options.commands.addKeyBinding({
      command: CommandIDs.compile,
      keys: ['Accel Enter'],
      selector: '.fortitudo-workbench'
    });
    this.restore(store.state.layout);
    this.dock.layoutModified.connect(this.layoutChanged, this);
    let previous = snapshot(store.state);
    let position = store.state.position;
    this.unsubscribe = store.subscribe(() => {
      const next = snapshot(store.state);
      if (
        next.source !== previous.source ||
        next.options !== previous.options ||
        next.layout !== previous.layout
      ) {
        previous = next;
        this.pending = next;
        this.save();
      }
      if (store.state.position !== position) {
        position = store.state.position;
        this.dock.activateWidget(this.panes.source);
      }
    });
  }

  /** Hosts await pending saves before reopening the single session. */
  get saved(): Promise<void> {
    return this.waitForSave();
  }

  dispose(): void {
    if (!this.isDisposed) {
      this.unsubscribe();
      this.binding.dispose();
      this.registered.dispose();
      this.compiler.dispose();
      this.store.dispose();
      super.dispose();
    }
  }

  protected onCloseRequest(): void {
    this.dispose();
  }

  protected onActivateRequest(message: Message): void {
    super.onActivateRequest(message);
    this.dock.activateWidget(this.panes.source);
  }

  private view(pane: Pane | 'controls'): ReactWidget {
    const resize = (height: number) => {
      widget.node.style.minHeight = `${Math.ceil(height)}px`;
      widget.node.style.maxHeight = `${Math.ceil(height)}px`;
      this.fit();
    };
    const widget = new ReactWidget(() => (
      <Bridge
        store={this.store}
        commands={this.options.commands}
        pane={pane}
        onSize={resize}
      />
    ));
    widget.addClass('fortitudo-view');
    widget.node.dataset.pane = pane;
    return widget;
  }

  private restore(layout: Area | null): void {
    const main: DockLayout.AreaConfig = layout
      ? this.restoreArea(layout)
      : {
          type: 'split-area',
          orientation: 'vertical',
          sizes: [0.75, 0.25],
          children: [
            {
              type: 'split-area',
              orientation: 'horizontal',
              sizes: [0.5, 0.5],
              children: [this.tab('source'), this.tab('assembly')]
            },
            this.tab('diagnostics')
          ]
        };
    this.dock.restoreLayout({ main });
  }

  private tab(pane: Pane): DockLayout.ITabAreaConfig {
    return { type: 'tab-area', widgets: [this.panes[pane]], currentIndex: 0 };
  }

  private restoreArea(area: Area): DockLayout.AreaConfig {
    return area.type === 'tab-area'
      ? { ...area, widgets: area.widgets.map(pane => this.panes[pane]) }
      : {
          ...area,
          sizes: [...area.sizes],
          children: area.children.map(child => this.restoreArea(child))
        };
  }

  private identifiers(area: DockLayout.AreaConfig): Area {
    return area.type === 'tab-area'
      ? {
          ...area,
          widgets: area.widgets.map(widget => this.identifier(widget))
        }
      : {
          ...area,
          children: area.children.map(child => this.identifiers(child))
        };
  }

  private identifier(widget: Widget): Pane {
    if (widget === this.panes.source) {
      return 'source';
    }
    if (widget === this.panes.assembly) {
      return 'assembly';
    }
    if (widget === this.panes.diagnostics) {
      return 'diagnostics';
    }
    throw new Error('Unknown workbench pane.');
  }

  private layoutChanged(): void {
    const main = this.dock.saveLayout().main;
    if (!main || this.isDisposed) {
      return;
    }
    void this.options.commands
      .execute(CommandIDs.layoutChanged, {
        layout: this.identifiers(main)
      })
      .catch(error => {
        this.store.dispatch({ type: 'notice', message: String(error) });
      });
  }

  private save(): void {
    if (this.saving) {
      return;
    }
    this.saving = (async () => {
      while (this.pending) {
        const value = this.pending;
        this.pending = null;
        try {
          await this.options.persistence.save(value);
        } catch (error) {
          this.store.dispatch({
            type: 'notice',
            message: `Session could not be saved: ${String(error)}`
          });
        }
      }
    })().finally(() => {
      this.saving = null;
      if (this.pending) {
        this.save();
      }
    });
  }

  private async waitForSave(): Promise<void> {
    while (this.saving) {
      await this.saving;
    }
  }

  private readonly dock = new DockPanel();
  private readonly panes: Record<Pane, ReactWidget>;
  private readonly compiler: ICompiler;
  private readonly registered: IDisposable;
  private readonly binding: IDisposable;
  private readonly unsubscribe: () => void;
  private pending: Session | null = null;
  private saving: Promise<void> | null = null;
}
