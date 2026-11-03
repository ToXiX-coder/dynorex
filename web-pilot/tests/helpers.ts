import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileDataStore } from "@/lib/store";
import { resetRateLimits } from "@/lib/security";
import { createVehicle, signUp } from "@/lib/services";
import type { IncomingFile } from "@/lib/upload";

export function freshStore() {
  resetRateLimits();
  return new FileDataStore(fs.mkdtempSync(path.join(os.tmpdir(), "dynorex-test-")));
}

export async function makeUser(store: FileDataStore, email: string) {
  return signUp(store, { email, password: "correct-horse-battery" });
}

export const VIN = "1HGCM82633A004352";

export function makeVehicle(store: FileDataStore, ownerId: string) {
  return createVehicle(store, ownerId, {
    year: "1999",
    make: "Sample Motors",
    model: "Roadster Demo",
    vin: VIN,
    mileage: "88000",
  });
}

export const modInput = {
  type: "modification",
  title: "Front sway bar",
  category: "Suspension",
  status: "installed",
  date: "2026-03-14",
  partNumber: "SB-1234",
  cost: "189.50",
  notes: "Private garage note",
};

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export function file(name: string, kind: "png" | "pdf" | "exe", size = 64): IncomingFile {
  const head =
    kind === "png"
      ? PNG
      : kind === "pdf"
        ? [0x25, 0x50, 0x44, 0x46, 0x2d]
        : [0x4d, 0x5a, 0x90, 0x00];
  const bytes = new Uint8Array(size);
  if (size > 0) bytes.set(head.slice(0, size));
  const type =
    kind === "png" ? "image/png" : kind === "pdf" ? "application/pdf" : "application/x-msdownload";
  return { name, type, size, bytes };
}
