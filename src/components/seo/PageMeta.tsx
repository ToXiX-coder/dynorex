import Head from "expo-router/head";
import { usePathname } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { isPrivatePath, pageTitle } from "@/domain/seo";

/**
 * D-74: web page tags. Search engines and link previews read these on the web build; on phones they do nothing.
 * Until the site is server-rendered (see docs/decisions.md D-74), they're added after the page loads: Google reads
 * them, but chat apps' link previews don't run the app and won't see them yet.
 */
export function PageMeta({
  title,
  description,
  image,
}: {
  title: string;
  description?: string | null;
  image?: string | null;
}) {
  const full = pageTitle(title);
  return (
    <Head>
      <title>{full}</title>
      <meta property="og:title" content={full} />
      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      {description ? <meta name="description" content={description} /> : null}
      {description ? <meta property="og:description" content={description} /> : null}
      {image ? <meta property="og:image" content={image} /> : null}
    </Head>
  );
}

/**
 * Private links (a buyer's record, a shop's confirm link, chats, offers, the garage) stay out of search. This sits in
 * the root layout, above the screens, where <Head> doesn't apply (it only renders inside a focused screen), so on the
 * web it keeps one robots tag in the page itself.
 */
export function RobotsForPath() {
  const path = usePathname();
  const hide = isPrivatePath(path);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let tag = document.head.querySelector<HTMLMetaElement>('meta[name="robots"][data-dx]');
    if (!hide) {
      tag?.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "robots";
      tag.setAttribute("data-dx", "");
      document.head.appendChild(tag);
    }
    tag.content = "noindex, nofollow";
  }, [hide]);
  return null;
}
