import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStore } from "./store";
import { logOut, userForSession } from "./services";

const COOKIE = "dynorex_session";
const secure = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: 30 * 86_400,
  });
}

export async function endSession() {
  const jar = await cookies();
  logOut(getStore(), jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

export async function currentUser() {
  return userForSession(getStore(), (await cookies()).get(COOKIE)?.value);
}

/** Every owner page and action starts here. Unauthenticated visitors go to the login page. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function siteOrigin() {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}
