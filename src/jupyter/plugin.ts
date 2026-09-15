import { ILayoutRestorer } from '@jupyterlab/application';
import type { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette, WidgetTracker } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { ILauncher } from '@jupyterlab/launcher';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStateDB } from '@jupyterlab/statedb';

import { initial, snapshot } from '../model';
import { session } from '../persistence';
import { createWorkbench } from '../workbench';
import type { Workbench } from '../workbench';
import { createPersistence } from './persistence';

const pluginId = 'fortitudo:plugin';
const openId = 'fortitudo:open';

const plugin: JupyterFrontEndPlugin<void> = {
  id: pluginId,
  description: 'A browser-only C/C++ and IR compiler explorer.',
  autoStart: true,
  requires: [IStateDB],
  optional: [ICommandPalette, ILauncher, ISettingRegistry, ILayoutRestorer],
  activate: (
    app,
    state: IStateDB,
    palette: ICommandPalette | null,
    launcher: ILauncher | null,
    settings: ISettingRegistry | null,
    restorer: ILayoutRestorer | null
  ) => {
    // Tracker restoration removes entries that are not widget records.
    // Keep editing state in its own namespace.
    const tracker = new WidgetTracker<Workbench>({
      namespace: 'fortitudo-workbench'
    });
    let current: Workbench | null = null;
    let opening: Promise<void> | null = null;
    let saved = Promise.resolve();
    const path = new URL('.', document.baseURI).pathname;
    const workspace = PageConfig.getOption('workspace') || 'default';
    const persistence = createPersistence(
      state,
      `fortitudo:session:${path}:${workspace}`
    );
    app.commands.addCommand(openId, {
      label: 'Open Fortitudo',
      caption: 'Explore compiler outputs and run WebAssembly in your browser',
      iconClass: 'fortitudo-icon',
      execute: () => {
        if (current && !current.isDisposed) {
          if (!current.isAttached) {
            app.shell.add(current, 'main');
          }
          app.shell.activateById(current.id);
          return;
        }
        opening ??= (async () => {
          await saved;
          let defaults = snapshot(initial());
          if (settings) {
            try {
              const configured = await settings.load(pluginId);
              defaults =
                session({
                  ...defaults,
                  source: configured.get('source').composite,
                  options: {
                    language: configured.get('language').composite,
                    target: configured.get('target').composite,
                    optimization: configured.get('optimization').composite,
                    llvmPipeline:
                      configured.get('llvmPipeline').composite || null,
                    analysisPipeline:
                      configured.get('analysisPipeline').composite,
                    mlirPipeline: configured.get('mlirPipeline').composite
                  },
                  layout: null
                }) ?? defaults;
            } catch (error) {
              console.warn('Fortitudo settings could not be loaded.', error);
            }
          }
          const workbench = await createWorkbench({
            commands: app.commands,
            workerUrl: new URL('../../compiler/worker.js', import.meta.url),
            persistence,
            defaults
          });
          current = workbench;
          workbench.addClass('fortitudo-jupyter');
          workbench.disposed.connect(() => {
            saved = workbench.saved;
            current = null;
          });
          app.shell.add(workbench, 'main');
          await tracker.add(workbench);
          app.shell.activateById(workbench.id);
        })().finally(() => {
          opening = null;
        });
        return opening;
      }
    });
    palette?.addItem({ command: openId, category: 'Fortitudo' });
    launcher?.add({ command: openId, category: 'Other', rank: 1 });
    if (restorer) {
      void restorer
        .restore(tracker, {
          command: openId,
          name: () => 'workbench'
        })
        .catch(error => {
          console.error('Fortitudo restoration failed.', error);
        });
    }
  }
};

export default plugin;
