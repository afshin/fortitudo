import { openSearchPanel } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import * as React from 'react';

import { editorExtensions } from './codemirror';

/** Own the read-only editor; artifact content remains in the store. */
export function TextOutput({
  text,
  label,
  children
}: {
  text: string;
  label: string;
  children?: React.ReactNode;
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
          editorExtensions,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({
            'aria-label': label,
            'aria-readonly': 'true',
            role: 'textbox',
            tabindex: '0'
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
      <div className="fortitudo-file-actions">
        {children}
        <button
          title="Find in output (Ctrl/Cmd+F)"
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
