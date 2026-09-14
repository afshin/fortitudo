import { defaultKeymap } from '@codemirror/commands';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import * as React from 'react';

/** Own the read-only editor; artifact content remains in the store. */
export function TextOutput({
  text,
  label
}: {
  text: string;
  label: string;
}): React.ReactElement {
  const node = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  useEffect(() => {
    if (!node.current) {
      return;
    }
    const view = new EditorView({
      parent: node.current,
      state: EditorState.create({
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          lineNumbers(),
          search({ top: true }),
          keymap.of([...searchKeymap, ...defaultKeymap]),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: 'var(--fortitudo-code-font)'
            },
            '.cm-gutters': { background: 'var(--fortitudo-muted-background)' },
            '.cm-content': { padding: '8px 0' },
            '&.cm-focused': { outline: 'none' }
          })
        ]
      })
    });
    editor.current = view;
    const observer = new ResizeObserver(() => view.requestMeasure());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      view.destroy();
      editor.current = null;
    };
  }, [label]);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text }
      });
    }
  }, [text, label]);
  return (
    <>
      <div className="fortitudo-find">
        <button
          onClick={() => {
            if (editor.current) {
              openSearchPanel(editor.current);
            }
          }}
        >
          Find
        </button>
      </div>
      <div className="fortitudo-editor" ref={node} />
    </>
  );
}
