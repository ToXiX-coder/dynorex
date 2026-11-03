import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import {
  ensureTheme,
  baseInfo,
  DEFAULT_CHOICE,
  parseChoice,
  resolveBase,
  type BaseId,
  type ThemeChoice,
} from "./themes";

const KEY = "dynorex:theme:v1";

interface ThemeValue {
  choice: ThemeChoice;
  /** The base on screen ("auto" resolved). */
  base: BaseId;
  dark: boolean;
  setChoice: (next: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue>({
  choice: DEFAULT_CHOICE,
  base: "asphalt",
  dark: true,
  setChoice: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/**
 * Holds the person's theme (saved on this device only; no account data). The colours are applied by `<Themed>`,
 * which wraps the app screens, not the app-open intro, so the intro and logo always show in the brand colours.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>(DEFAULT_CHOICE);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => live && raw && setChoiceState(parseChoice(raw)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo(() => {
    const base = resolveBase(choice, scheme);
    return { choice, base, dark: baseInfo(base).dark, setChoice };
  }, [choice, scheme, setChoice]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Applies the theme and remounts its children when it changes, so every screen re-reads the colour roles.
 * Applying during render is deliberate: the new colours must be in place before any child renders.
 */
export function Themed({ children }: { children: ReactNode }) {
  const { base, choice, dark } = useTheme();
  const key = `${base}:${choice.accent}`;
  ensureTheme(base, choice.accent);
  return (
    <Fragment key={key}>
      <StatusBar style={dark ? "light" : "dark"} />
      {children}
    </Fragment>
  );
}
