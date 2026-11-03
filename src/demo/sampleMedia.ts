import { Asset } from "expo-asset";

/**
 * Pitch-mode sample pictures. Sample data stores them as "sample:<name>" paths (plain strings, so the data
 * stays loadable in unit tests); this turns one into the bundled image's URL where a picture is shown. They
 * are illustrations of the app's own car drawing, each marked "SAMPLE IMAGE", never stand-ins for real photos.
 */
const SAMPLES: Record<string, number> = {
  "sample:wrx-garage": require("../../assets/demo/wrx-garage.png"),
  "sample:wrx-canyon": require("../../assets/demo/wrx-canyon.png"),
  "sample:wrx-track": require("../../assets/demo/wrx-track.png"),
  "sample:wrx-meet": require("../../assets/demo/wrx-meet.png"),
  "sample:dyno-sheet": require("../../assets/demo/dyno-sheet.png"),
};

export function sampleUri(path: string): string {
  const asset = SAMPLES[path];
  return asset === undefined ? path : Asset.fromModule(asset).uri;
}
