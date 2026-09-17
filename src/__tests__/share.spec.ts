import { initial, snapshot } from '../model';
import { createSharing } from '../share';
import { decodeShare, encodeShare } from '../sharing';

const saved = { ...snapshot(initial()), source: '// λ\nint shared;' };

it('imports a fragment once and clears its inputs only after saving', () => {
  const url = new URL('https://example.test/project/?theme=dark');
  url.hash = `llvm-explorer=${encodeShare(saved)}&view=source`;
  const replace = jest.fn();
  const sharing = createSharing(url, replace);
  sharing.clear();
  expect(replace).not.toHaveBeenCalled();
  expect(sharing.read()?.source).toBe(saved.source);
  expect(sharing.read()).toBeNull();
  expect(replace).not.toHaveBeenCalled();
  sharing.clear();
  expect(replace.mock.calls[0][0].href).toBe(
    'https://example.test/project/?theme=dark#view=source'
  );
  sharing.clear();
  expect(replace).toHaveBeenCalledTimes(1);
});

it('copies inputs into fragments and preserves other parameters', async () => {
  const writeText = jest.fn();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true
  });
  try {
    const sharing = createSharing(
      new URL('https://example.test/project/?theme=dark#guide')
    );
    await sharing.copy(saved);
    const url = new URL(writeText.mock.calls[0][0]);
    expect(url.search).toBe('?theme=dark');
    expect(decodeShare(url.hash.slice('#llvm-explorer='.length)).source).toBe(
      saved.source
    );
  } finally {
    Reflect.deleteProperty(navigator, 'clipboard');
  }
});

it('preserves invalid imports for recovery', () => {
  const replace = jest.fn();
  const sharing = createSharing(
    new URL('https://example.test/#llvm-explorer=invalid'),
    replace
  );
  expect(() => sharing.read()).toThrow();
  sharing.clear();
  expect(replace).not.toHaveBeenCalled();
});
