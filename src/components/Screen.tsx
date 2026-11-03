import { useState, type ReactNode, type Ref } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { color, layout, space } from "@/theme/tokens";
import { Appear } from "./motion/Motion";
import { themed } from "@/theme/themed";

/**
 * Standard screen: Asphalt background, safe areas, keyboard-aware scroll, readable max width.
 * `onRefresh` adds pull-to-refresh (lime spinner); the spinner stays until the returned promise settles.
 */
export function Screen({
  children,
  scroll = true,
  edges = ["left", "right"],
  onRefresh,
  scrollRef,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  onRefresh?: () => Promise<unknown> | void;
  /** for screens that bring a form at the top into view (e.g. "Log again" far down a list) */
  scrollRef?: Ref<ScrollView>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      // keep the spinner up briefly even for instant answers, so the pull feels acknowledged
      await Promise.all([onRefresh?.(), new Promise((r) => setTimeout(r, 450))]);
    } finally {
      setRefreshing(false);
    }
  };
  // content eases in on open (static with reduced motion)
  const body = (
    <Appear rise={8} style={styles.innerWrap}>
      <View style={styles.inner}>{children}</View>
    </Appear>
  );
  return (
    <SafeAreaView edges={edges} style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void refresh()}
                  tintColor={color.accent}
                  colors={[color.accent]}
                  progressBackgroundColor={color.surface}
                />
              ) : undefined
            }
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    // room for the Ask Torq bubble (58pt, floating 16pt above the tab bar) so the last row can scroll clear of it
    scroll: { flexGrow: 1, paddingBottom: space.huge + space.xxl },
    innerWrap: { flex: 1 },
    inner: {
      flex: 1,
      width: "100%",
      maxWidth: layout.maxContentWidth,
      alignSelf: "center",
      padding: layout.screenGutter,
      gap: space.lg,
    },
  }),
);
