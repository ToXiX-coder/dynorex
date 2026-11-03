/**
 * One-time message carried across a sign-out (e.g. "Account deleted"), shown once on the welcome
 * screen. In memory only; nothing is stored on the device.
 */
let pending: { title: string; body: string } | null = null;

export const flash = {
  set(message: { title: string; body: string }) {
    pending = message;
  },
  take() {
    const m = pending;
    pending = null;
    return m;
  },
};
