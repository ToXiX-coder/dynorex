import { createContext, useContext, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Flags } from "@/domain/flags";
import { config } from "@/services/config";

const FlagsContext = createContext<Flags>(config.flags);

/** Flags decide what is SHOWN. Server authorization is separate and always applies. */
export const useFlags = () => useContext(FlagsContext);

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <FlagsContext.Provider value={config.flags}>{children}</FlagsContext.Provider>
    </SafeAreaProvider>
  );
}
