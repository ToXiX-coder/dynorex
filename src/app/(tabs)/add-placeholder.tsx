import { Redirect } from "expo-router";

/** The centre tab never shows a screen of its own; its button opens the /add chooser. */
export default function AddPlaceholder() {
  return <Redirect href="/add" />;
}
