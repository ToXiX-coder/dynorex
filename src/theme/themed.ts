import { themeState } from "./palette";

/**
 * A module-level style sheet that follows the theme: `const styles = themed(() => StyleSheet.create({...}))`.
 * The factory reruns the first time a style is read after a theme change, so `styles.card` always carries the
 * current colours (a plain StyleSheet.create would keep the colours from when the file loaded).
 */
export function themed<T extends object>(factory: () => T): T {
  let made: T | null = null;
  let version = -1;
  const current = () => {
    if (!made || version !== themeState.version) {
      made = factory();
      version = themeState.version;
    }
    return made;
  };
  return new Proxy({} as T, {
    get: (_, key) => current()[key as keyof T],
    has: (_, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_, key) => {
      const d = Object.getOwnPropertyDescriptor(current(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}
