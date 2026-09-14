import type { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

/** A small React bridge with a Lumino-owned lifecycle. */
export class ReactWidget extends Widget {
  constructor(private readonly render: () => ReactNode) {
    super();
    this.node.tabIndex = -1;
  }

  dispose(): void {
    if (!this.isDisposed) {
      this.unmount();
      super.dispose();
    }
  }

  protected onAfterAttach(message: Message): void {
    super.onAfterAttach(message);
    this.update();
  }

  protected onBeforeDetach(message: Message): void {
    this.unmount();
    super.onBeforeDetach(message);
  }

  protected onUpdateRequest(): void {
    if (this.isAttached) {
      this.root ??= createRoot(this.node);
      this.root.render(this.render());
    }
  }

  protected onActivateRequest(): void {
    const editor = this.node.querySelector('.cm-content');
    if (editor instanceof HTMLElement) {
      editor.focus();
    } else {
      this.node.focus();
    }
  }

  private unmount(): void {
    this.root?.unmount();
    this.root = null;
  }

  private root: Root | null = null;
}
