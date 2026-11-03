import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { InlineError } from "@/components/feedback/Inline";
import { Torq } from "@/components/mascot/Torq";
import type { TorqExpression } from "@/components/mascot/art";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { gainText, type Insights } from "@/domain/torq";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { buildService, type VehicleCard } from "@/features/garage/buildService";
import { torqService, type ChatTurn, type TorqCar } from "@/features/torq/torqService";
import { useFlags } from "@/providers/AppProviders";
import { haptic } from "@/services/haptics";
import { border, color, layout, radius, space, touch, type } from "@/theme/tokens";
import { themed } from "@/theme/themed";

const SUGGESTIONS = ["What should I do first?", "More power", "Better handling", "What do most owners run?"];

/**
 * Ask Torq: chat about mods for one of your cars. Torq answers from what the Dynorex community has publicly
 * built on the same model (counts, and owner-reported gains as ranges), never from made-up numbers. Pick a car
 * so Torq knows what you already run. Conversations aren't stored.
 */
export default function TorqChat() {
  const flags = useFlags();
  const { status } = useAuth();
  if (!flags.torqChat)
    return <ComingSoon title="Ask Torq" lines={["Mod advice from real community builds", "Ranges, not promises"]} />;
  if (status !== "signedIn")
    return (
      <View style={styles.root}>
        <SignInPrompt message="Sign in to chat with Torq" />
      </View>
    );
  return <Chat />;
}

function Chat() {
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const [cars, setCars] = useState<VehicleCard[]>([]);
  const [carId, setCarId] = useState<string | null>(
    typeof params.vehicleId === "string" && isUuid(params.vehicleId) ? params.vehicleId : null,
  );
  const [myMods, setMyMods] = useState<string[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [mood, setMood] = useState<TorqExpression>("neutral");
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true;
    void buildService.listVehicles(0).then((r) => {
      if (!alive || !r.ok) return;
      setCars(r.data);
      // start on the car you worked on last (a sold car only if it's all there is)
      const latest = [...r.data].sort(
        (a, b) => Number(Boolean(a.sold_at)) - Number(Boolean(b.sold_at)) || b.updated_at.localeCompare(a.updated_at),
      )[0];
      setCarId((cur) => cur ?? latest?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const car = cars.find((c) => c.id === carId) ?? null;
  useEffect(() => {
    if (!car) return;
    let alive = true;
    void Promise.all([buildService.listMods(car.id, 0), torqService.insights(car.make, car.model, car.year)]).then(
      ([mods, ins]) => {
        if (!alive) return;
        // status travels with the name so Torq knows planned parts aren't installed yet
        setMyMods(
          mods.ok
            ? mods.data.map((m) =>
                m.status === "planned"
                  ? `${m.name} (planned)`
                  : m.status === "in_progress"
                    ? `${m.name} (in progress)`
                    : m.name,
              )
            : [],
        );
        setInsights(ins.ok ? ins.data : null);
      },
    );
    return () => {
      alive = false;
    };
  }, [car]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: ChatTurn[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    setMood("wrenching");
    const torqCar: TorqCar | null = car ? { year: car.year, make: car.make, model: car.model, myMods } : null;
    const r = await torqService.ask(next, torqCar);
    setBusy(false);
    if (!r.ok) {
      setMood("shrugging");
      haptic.warning();
      return setError(r.error);
    }
    haptic.tap();
    setMood("excited");
    setMessages([...next, { role: "assistant", content: r.data.reply }]);
    if (r.data.insights) setInsights(r.data.insights);
  };

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.root}>
      <Stack.Screen options={{ title: "Ask Torq" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          ref={scroll}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          <View style={styles.header}>
            <Torq expression={busy ? "wrenching" : mood} size={84} />
            <View style={{ flex: 1, gap: space.xxs }}>
              <Text variant="display" style={{ fontSize: 24, lineHeight: 30 }}>
                Ask Torq
              </Text>
              <Text muted>Mod advice from what the community actually built.</Text>
            </View>
          </View>

          {cars.length ? (
            <View style={{ gap: space.xs }}>
              <Text variant="label">Your car</Text>
              <View style={styles.chips}>
                {cars.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.nickname || `${c.year} ${c.model}`}
                    selected={c.id === carId}
                    onPress={() => setCarId(c.id)}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Text muted>Add a car to your garage so Torq knows what you drive.</Text>
          )}

          {car && insights ? <Snapshot insights={insights} /> : null}

          {messages.length === 0 ? (
            <Bubble role="assistant">
              {car
                ? `Yo! Let's talk ${car.year} ${car.make} ${car.model}. What are you after: power, handling, sound, or what to do first?`
                : "Yo! Pick a car and tell me what you're after."}
            </Bubble>
          ) : null}
          {messages.map((m, i) => (
            // Torq's latest reply carries his current reaction; older ones settle back to neutral
            <Bubble key={i} role={m.role} expression={i === messages.length - 1 && !busy ? mood : "neutral"}>
              {m.content}
            </Bubble>
          ))}
          {busy ? (
            <Bubble role="assistant" expression="wrenching">
              Checking the community builds…
            </Bubble>
          ) : null}
          {error ? <InlineError kind={error.key} onAction={() => void send(messages.at(-1)?.content ?? "")} /> : null}

          {!busy ? (
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} selected={false} onPress={() => void send(s)} />
              ))}
            </View>
          ) : null}
          <Text variant="caption" muted>
            Torq uses public community builds only. Gains are owner-reported ranges, not promises. Check local laws
            before changing emissions or exhaust parts.
          </Text>
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about a mod…"
            placeholderTextColor={color.textMuted}
            selectionColor={color.accent}
            accessibilityLabel="Message to Torq"
            maxLength={1000}
            multiline
            style={styles.input}
            onSubmitEditing={() => void send(draft)}
          />
          <Button title="Send" disabled={!draft.trim() || busy} onPress={() => void send(draft)} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({
  role,
  expression = "neutral",
  children,
}: {
  role: ChatTurn["role"];
  expression?: TorqExpression;
  children: string;
}) {
  const torq = role === "assistant";
  return (
    <View style={[styles.row, torq ? styles.rowTorq : styles.rowMe]}>
      {torq ? <Torq expression={expression} size={36} /> : null}
      <View
        style={[styles.bubble, torq ? styles.bubbleTorq : styles.bubbleMe]}
        accessible
        accessibilityLabel={`${torq ? "Torq" : "You"}: ${children}`}
      >
        <Text style={torq ? undefined : { color: color.onAccent }}>{children}</Text>
      </View>
    </View>
  );
}

/** What the community runs on this model: share bars and gain ranges (only where enough owners reported). */
function Snapshot({ insights }: { insights: Insights }) {
  const top = insights.mods.slice(0, 5);
  return (
    <Card>
      <SectionHeader>Community snapshot</SectionHeader>
      <Text variant="caption" muted>
        {`${insights.public_builds} public ${insights.make} ${insights.model} build${insights.public_builds === 1 ? "" : "s"}`}
      </Text>
      {top.length === 0 ? (
        <Text muted>Not enough shared builds yet to show common mods.</Text>
      ) : (
        top.map((m) => {
          const share = insights.public_builds ? m.builds / insights.public_builds : 0;
          const gain = gainText(m);
          return (
            <View
              key={`${m.name}-${m.category}`}
              style={{ gap: 2 }}
              accessible
              accessibilityLabel={`${m.name}: on ${m.builds} of ${insights.public_builds} builds${gain ? `, ${gain}` : ""}`}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                  {m.name}
                </Text>
                <Text
                  style={[type.specUnit, { color: color.textMuted }]}
                >{`${m.builds}/${insights.public_builds}`}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(4, share * 100)}%` }]} />
              </View>
              {gain ? (
                <Text variant="caption" style={{ color: color.accent }}>
                  {gain}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    scroll: {
      padding: layout.screenGutter,
      gap: space.lg,
      width: "100%",
      maxWidth: layout.maxContentWidth,
      alignSelf: "center",
    },
    header: { flexDirection: "row", alignItems: "center", gap: space.md },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
    row: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
    rowTorq: { justifyContent: "flex-start", paddingRight: space.xxl },
    rowMe: { justifyContent: "flex-end", paddingLeft: space.xxl },
    bubble: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg, flexShrink: 1 },
    bubbleTorq: {
      backgroundColor: color.surface,
      borderWidth: border.hairline,
      borderColor: color.hairline,
      borderBottomLeftRadius: radius.sm,
    },
    bubbleMe: { backgroundColor: color.accent, borderBottomRightRadius: radius.sm },
    track: { height: 6, borderRadius: 3, backgroundColor: color.background, overflow: "hidden" },
    fill: { height: 6, backgroundColor: color.accent, transform: [{ skewX: "-20deg" }] },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: space.sm,
      padding: space.sm,
      borderTopWidth: border.hairline,
      borderTopColor: color.hairline,
      backgroundColor: color.background,
    },
    input: {
      ...type.body,
      flex: 1,
      minHeight: touch.min,
      maxHeight: 120,
      color: color.text,
      borderWidth: border.regular,
      borderColor: color.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
  }),
);
