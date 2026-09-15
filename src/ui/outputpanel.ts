import type { CommandRegistry } from '@lumino/commands';
import type { Message } from '@lumino/messaging';
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
    this.node.setAttribute(
      'aria-label',
      group === 'primary' ? 'Outputs' : 'Comparison outputs'
    );
    const kinds = Object.keys(outputLabels).filter(isOutputKind);
    for (const kind of kinds) {
      const widget = create(kind);
      widget.title.label = kind === 'ir' ? 'LLVM IR' : outputLabels[kind];
      widget.title.caption = outputLabels[kind];
      this.addWidget(widget);
    }
    this.currentIndex = kinds.indexOf(store.state.outputs[group]);
    this.unsubscribe = store.subscribe(() => {
      this.currentIndex = kinds.indexOf(store.state.outputs[group]);
    });
    this.currentChanged.connect(() => {
      this.update();
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

  protected onAfterAttach(message: Message): void {
    super.onAfterAttach(message);
    this.update();
  }

  protected onResize(message: Widget.ResizeMessage): void {
    super.onResize(message);
    this.update();
  }

  protected onUpdateRequest(): void {
    const tab = this.tabBar.contentNode.children[this.currentIndex];
    if (!tab || !this.isVisible) {
      return;
    }
    // Scroll only this tab strip; comparison changes must not move the host.
    const bar = this.tabBar.node;
    const bounds = bar.getBoundingClientRect();
    const selected = tab.getBoundingClientRect();
    const left = bounds.left + bar.clientLeft;
    const right = left + bar.clientWidth;
    if (selected.left < left) {
      bar.scrollLeft -= Math.ceil(left - selected.left);
    } else if (selected.right > right) {
      bar.scrollLeft += Math.ceil(selected.right - right);
    }
  }

  private readonly unsubscribe: () => void;
}
