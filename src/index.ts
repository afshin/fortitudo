import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

/**
 * Initialization data for the fortitudo extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'fortitudo:plugin',
  description: 'A JupyterLab extension.',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry | null) => {
    console.log('JupyterLab extension fortitudo is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('fortitudo settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for fortitudo.', reason);
        });
    }
  }
};

export default plugin;
