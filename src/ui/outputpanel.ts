import type { CommandRegistry } from '@lumino/commands';
import { TabPanel } from '@lumino/widgets';
import type { Widget } from '@lumino/widgets';

import { CommandIDs } from '../commands';
import { isOutputKind, outputLabels } from '../compiler/types';
import type { OutputKind } from '../compiler/types';
import type { OutputGroup } from '../model';
import type { IStore } from '../state';

/** Lumino owns tabs; their selected representations belong to saved layout. */
export class OutputPanel extends TabPanel {
  constructor(
    store: IStore,
    commands: CommandRegistry,
    group: OutputGroup,
    create: (kind: OutputKind) => Widget
  ) {
    super({ tabsMovable: false });
    this.addClass('fortitudo-outputs');
    const kinds = Object.keys(outputLabels).filter(isOutputKind);
    for (const kind of kinds) {
      const widget = create(kind);
      widget.title.label = kind === 'ir' ? 'LLVM IR' : outputLabels[kind];
      this.addWidget(widget);
    }
    this.currentIndex = kinds.indexOf(store.state.outputs[group]);
    this.unsubscribe = store.subscribe(() => {
      this.currentIndex = kinds.indexOf(store.state.outputs[group]);
    });
    this.currentChanged.connect(() => {
      const output = kinds[this.currentIndex];
      if (output && store.state.outputs[group] !== output) {
        void commands
          .execute(CommandIDs.output, { group, output })
          .catch(error =>
            store.dispatch({ type: 'notice', message: String(error) })
          );
      }
    });
  }

  dispose(): void {
    if (!this.isDisposed) {
      this.unsubscribe();
      super.dispose();
    }
  }
  private readonly unsubscribe: () => void;
}
