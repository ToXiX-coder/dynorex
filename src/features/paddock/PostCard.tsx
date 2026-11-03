import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Card } from "@/components/cards/Card";
import { Avatar } from "@/components/social/Avatar";
import { Text } from "@/components/Text";
import { buildPath } from "@/domain/deepLinks";
import type { PublicPost } from "@/services/supabase/database.types";
import { relativeAge } from "@/services/cache";
import { color, space, touch } from "@/theme/tokens";
import { communityService } from "./communityService";
import { haptic } from "@/services/haptics";

/**
 * One Paddock post. The like count only changes after the server accepted the like; signed-out viewers see
 * counts but no like button.
 */
export function PostCard({
  post,
  liked,
  canLike,
  onChanged,
}: {
  post: PublicPost;
  liked: boolean;
  canLike: boolean;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    const r = liked ? await communityService.unlike(post.post_id) : await communityService.like(post.post_id);
    setBusy(false);
    if (r.ok) {
      haptic.tap();
      onChanged?.();
    }
  };
  const when = relativeAge(Date.parse(post.created_at));
  return (
    <Card>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Post by @${post.author_username}${post.club_name ? ` in ${post.club_name}` : ""}, ${when}: ${post.body}`}
        onPress={() => router.push(`/posts/${post.post_id}`)}
        style={{ gap: space.xs, minHeight: touch.min }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Avatar username={post.author_username} size={32} />
          <Text variant="caption" muted style={{ flex: 1 }}>
            {`@${post.author_username}${post.club_name ? ` · ${post.club_name}` : ""} · ${when}`}
          </Text>
        </View>
        <Text>{post.body}</Text>
      </Pressable>
      {post.build_vehicle_id ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(buildPath(post.build_vehicle_id!) as never)}
          style={{ minHeight: touch.min, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text accent>View the build</Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
        {canLike ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? "Unlike" : "Like"}
            accessibilityState={{ selected: liked, busy }}
            disabled={busy}
            onPress={() => void toggle()}
            style={{ minHeight: touch.min, minWidth: touch.min, justifyContent: "center" }}
          >
            <Text style={{ color: liked ? color.accent : color.textMuted }}>
              {`${liked ? "♥" : "♡"} ${post.likes_count}`}
            </Text>
          </Pressable>
        ) : (
          <Text variant="caption" muted>{`♡ ${post.likes_count}`}</Text>
        )}
        <Text variant="caption" muted>{`${post.comments_count} comment${post.comments_count === 1 ? "" : "s"}`}</Text>
      </View>
    </Card>
  );
}
