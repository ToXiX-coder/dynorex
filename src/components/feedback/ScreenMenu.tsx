import { Stack } from "expo-router";
import { useState } from "react";
import { IconButton } from "@/components/buttons/IconButton";
import { MoreIcon } from "@/components/icons";
import { color } from "@/theme/tokens";
import { ActionSheet, type SheetAction } from "./ActionSheet";

/**
 * Sets the screen title and, when there are secondary actions (report, delete, leave), a "⋯" button in the
 * navigation bar that opens them in a bottom sheet. Keeps pages free of walls of secondary buttons.
 */
export function ScreenMenu({ title, label, actions }: { title: string; label: string; actions: SheetAction[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: actions.length
            ? () => (
                <IconButton label={label} onPress={() => setOpen(true)}>
                  <MoreIcon color={color.text} />
                </IconButton>
              )
            : undefined,
        }}
      />
      <ActionSheet visible={open} title={title} actions={actions} onClose={() => setOpen(false)} />
    </>
  );
}
