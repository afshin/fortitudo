import { useEffect, useRef } from 'react';
import * as React from 'react';

import { sections } from '../generated/guide';

/** Own the modal lifecycle; opening About does not change session state. */
export function About({ onClose }: { onClose(): void }): React.ReactElement {
  const node = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = node.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={node}
      className="llvm-explorer-about"
      aria-labelledby="llvm-explorer-about-title"
      onClose={onClose}
      onKeyDown={event => event.stopPropagation()}
    >
      <header>
        <h2 id="llvm-explorer-about-title">About LLVM Explorer</h2>
        <button onClick={() => node.current?.close()}>Close About</button>
      </header>
      <nav aria-label="About sections">
        {sections.map(({ title }, index) => (
          <button
            key={title}
            onClick={() => {
              const heading = node.current?.querySelector<HTMLElement>(
                `#llvm-explorer-about-${index}`
              );
              heading?.scrollIntoView({ block: 'start' });
              heading?.focus({ preventScroll: true });
            }}
          >
            {title}
          </button>
        ))}
      </nav>
      <article>
        {sections.map(({ title, html }, index) => (
          <section key={title}>
            <h3 id={`llvm-explorer-about-${index}`} tabIndex={-1}>
              {title}
            </h3>
            {/* This HTML is generated only from the repository's README. */}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </section>
        ))}
      </article>
    </dialog>
  );
}
