import type { Session } from './model';
import { decodeShare, encodeShare } from './sharing';

/** Hosts provide their own location; the shared workbench owns no routing. */
export interface ISharing {
  read(): Session | null;
  /** Remove imported inputs from the address only after they are saved. */
  clear(): void;
  copy(session: Session): Promise<void>;
}

export function createSharing(
  location: URL,
  replace: (url: URL) => void = url =>
    history.replaceState(history.state, '', url)
): ISharing {
  let restored = false;
  let pending = false;
  return {
    read() {
      if (restored) {
        return null;
      }
      restored = true;
      const fragment = new URLSearchParams(location.hash.slice(1));
      const value =
        fragment.get('fortitudo') ?? location.searchParams.get('fortitudo');
      if (value === null) {
        return null;
      }
      const saved = decodeShare(value);
      pending = true;
      return saved;
    },
    clear() {
      if (pending) {
        const url = new URL(location.href);
        url.searchParams.delete('fortitudo');
        const fragment = new URLSearchParams(url.hash.slice(1));
        if (fragment.has('fortitudo')) {
          fragment.delete('fortitudo');
          url.hash = fragment.toString();
        }
        replace(url);
        location = url;
        pending = false;
      }
    },
    async copy(session) {
      const url = new URL(location.href);
      url.searchParams.delete('fortitudo');
      url.hash = `fortitudo=${encodeShare(session)}`;
      await navigator.clipboard.writeText(url.href);
    }
  };
}
