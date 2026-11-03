import { useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Text } from "@/components/Text";
import { ERROR_COPY } from "@/domain/copy/errors";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";
import type { ReportReason, ReportTarget } from "@/services/supabase/database.types";
import { color, radius, space } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { themed } from "@/theme/themed";

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: "spam", label: "Spam" },
  { id: "harassment", label: "Harassment" },
  { id: "hate", label: "Hate" },
  { id: "sexual_content", label: "Sexual content" },
  { id: "violence", label: "Violence" },
  { id: "impersonation", label: "Impersonation" },
  { id: "scam", label: "Scam" },
  { id: "unsafe_activity", label: "Unsafe driving" },
  { id: "other", label: "Something else" },
];

/** Private report: the reported person never sees who reported them. */
export function ReportSheet({
  visible,
  target,
  onClose,
}: {
  visible: boolean;
  target: { type: ReportTarget; id: string };
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const send = useAction(profileService.report);

  const close = () => {
    setReason(null);
    setDetails("");
    setSent(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} {...a11yHidden} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: space.md }}
            keyboardShouldPersistTaps="handled"
          >
            <Text variant="title" accessibilityRole="header">
              Report
            </Text>
            {sent ? (
              <>
                <InlineNotice title={ERROR_COPY.reportSent.title} body={ERROR_COPY.reportSent.body} />
                <Button title="OK" onPress={close} />
              </>
            ) : (
              <>
                <Text muted>What&apos;s wrong? Only Dynorex moderators see reports.</Text>
                <View style={styles.chips}>
                  {REPORT_REASONS.map((r) => (
                    <Chip key={r.id} label={r.label} selected={reason === r.id} onPress={() => setReason(r.id)} />
                  ))}
                </View>
                <TextField
                  label="Details (optional)"
                  value={details}
                  onChangeText={setDetails}
                  maxLength={1000}
                  multiline
                  hint={`${details.length}/1000`}
                />
                {send.error ? <InlineError kind={send.error.key} /> : null}
                <View style={styles.actions}>
                  <Button title="Cancel" variant="secondary" onPress={close} disabled={send.busy} />
                  <Button
                    title="Send report"
                    disabled={!reason}
                    loading={send.busy}
                    onPress={async () => {
                      if (!reason) return;
                      const res = await send.run(target, reason, details);
                      if (res?.ok) setSent(true);
                    }}
                  />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
    sheet: {
      maxHeight: "85%",
      backgroundColor: color.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: space.xl,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: color.handle,
      marginBottom: space.md,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm },
  }),
);
