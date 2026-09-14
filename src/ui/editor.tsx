import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  keymap,
  lineNumbers
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import * as React from 'react';

import type { IStore } from '../state';

export interface IEditorProps {
  store: IStore;
  onChange(source: string): void;
}

/** Own editor effects here; source text remains in the application store. */
export function Editor({ store, onChange }: IEditorProps): React.ReactElement {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!node.current) {
      return;
    }
    let updating = false;
    let position = store.state.position?.serial ?? 0;
    const view = new EditorView({
      parent: node.current,
      state: EditorState.create({
        doc: store.state.source,
        extensions: [
          cpp(),
          lineNumbers(),
          history(),
          drawSelection(),
          syntaxHighlighting(
            HighlightStyle.define([
              {
                tag: tags.keyword,
                color: 'var(--fortitudo-accent)',
                fontWeight: '600'
              },
              {
                tag: [tags.string, tags.number, tags.bool],
                color: 'var(--fortitudo-accent)'
              },
              {
                tag: tags.comment,
                color: 'var(--fortitudo-muted)',
                fontStyle: 'italic'
              }
            ])
          ),
          keymap.of([
            ...defaultKeymap.filter(binding => binding.key !== 'Mod-Enter'),
            ...historyKeymap,
            indentWithTab
          ]),
          EditorView.contentAttributes.of({ 'aria-label': 'Source code' }),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !updating) {
              onChange(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: 'var(--fortitudo-code-font)'
            },
            '.cm-content': { padding: '12px 0' },
            '.cm-line': { padding: '0 12px' },
            '.cm-gutters': { background: 'var(--fortitudo-muted-background)' },
            '.cm-cursor': { borderLeftColor: 'var(--fortitudo-foreground)' },
            '&.cm-focused': { outline: 'none' }
          })
        ]
      })
    });
    const unsubscribe = store.subscribe(() => {
      const state = store.state;
      if (state.source !== view.state.doc.toString()) {
        updating = true;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: state.source }
        });
        updating = false;
      }
      if (state.position && state.position.serial !== position) {
        position = state.position.serial;
        const line = view.state.doc.line(
          Math.min(state.position.line, view.state.doc.lines)
        );
        let column = 0;
        let bytes = 0;
        const encoder = new TextEncoder();
        for (const character of line.text) {
          const length = encoder.encode(character).length;
          if (bytes + length > state.position.column - 1) {
            break;
          }
          bytes += length;
          column += character.length;
        }
        view.dispatch({
          selection: { anchor: line.from + column },
          scrollIntoView: true
        });
        view.focus();
      }
    });
    const observer = new ResizeObserver(() => view.requestMeasure());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      unsubscribe();
      view.destroy();
    };
  }, [store, onChange]);
  return <div className="fortitudo-editor" ref={node} />;
}
