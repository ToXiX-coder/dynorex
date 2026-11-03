import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { IconButton } from "@/components/buttons/IconButton";
import { Card } from "@/components/cards/Card";
import { ActionSheet } from "@/components/feedback/ActionSheet";
import { ScreenMenu } from "@/components/feedback/ScreenMenu";
import { Avatar } from "@/components/social/Avatar";
import { ConfirmModal, InlineError } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { LockIcon, MoreIcon } from "@/components/icons";
import { Sticker, stickerName } from "@/components/mascot/Sticker";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { STICKERS, type StickerId } from "@/domain/plus";
import { useAuth } from "@/features/auth/AuthProvider";
import { SaveButton } from "@/features/social/SaveButton";
import type { MappedError } from "@/features/auth/errors";
import { communityService } from "@/features/paddock/communityService";
import { PostCard } from "@/features/paddock/PostCard";
import { subscriptionService } from "@/features/plus/subscriptionService";
import { ReportSheet } from "@/features/safety/ReportSheet";
import { useGoToSignIn } from "@/features/social/FollowButton";
import type { PublicComment, PublicPost, ReportTarget } from "@/services/supabase/database.types";
import { relativeAge } from "@/services/cache";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { haptic } from "@/services/haptics";
import { backOr } from "@/components/navigation/stackOptions";

/**
 * dynorex.app/posts/:postId. Anyone can read a public post and its comments. Signed-in people comment with
 * text; Dynorex+ members can also reply with a Torq sticker (the server refuses stickers from anyone else).
 */
export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const id = String(postId ?? "");
  const { status, profile } = useAuth();
  const goToSignIn = useGoToSignIn();
  const signed = status === "signedIn";
  const me = profile?.username ?? null;
  const [post, setPost] = useState<PublicPost | null | undefined>(undefined);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [liked, setLiked] = useState(false);
  const [plus, setPlus] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [lockedSticker, setLockedSticker] = useState<StickerId | null>(null);
  const [report, setReport] = useState<{ type: ReportTarget; id: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reload, setReload] = useState(0);
  const [commentMenu, setCommentMenu] = useState<PublicComment | null>(null);

  const fetchAll = useCallback(async () => {
    if (!isUuid(id)) return { post: null, comments: [], liked: false, plus: false };
    const [p, c, l, caps] = await Promise.all([
      communityService.post(id),
      communityService.comments(id),
      signed ? communityService.myLikes([id]) : Promise.resolve(null),
      signed ? subscriptionService.capabilities() : Promise.resolve(null),
    ]);
    return {
      post: p.ok ? p.data : null,
      comments: c.ok ? c.data : [],
      liked: Boolean(l && l.ok && l.data.includes(id)),
      plus: Boolean(caps?.ok && caps.data?.torq_stickers),
    };
  }, [id, signed]);

  useEffect(() => {
    let alive = true;
    void fetchAll().then((s) => {
      if (!alive) return;
      setPost(s.post);
      setComments(s.comments);
      setLiked(s.liked);
      setPlus(s.plus);
    });
    return () => {
      alive = false;
    };
  }, [fetchAll, reload]);

  if (post === undefined) return <LoadingState label="Loading post" />;
  if (post === null)
    return (
      <Screen>
        <ErrorState kind="buildNotFound" onAction={() => backOr()} />
      </Screen>
    );

  const refresh = () => setReload((n) => n + 1);
  const send = async (input: { body?: string; sticker?: StickerId }) => {
    setBusy(true);
    setError(null);
    const r = await communityService.comment(id, input);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    haptic.tap();
    setText("");
    refresh();
  };
  const mine = me !== null && post.author_username === me;

  return (
    <Screen onRefresh={() => setReload((n) => n + 1)}>
      <ScreenMenu
        title={post.club_name ?? "Post"}
        label="Post options"
        actions={
          mine
            ? [{ label: "Delete post", destructive: true, onPress: () => setConfirmDelete(true) }]
            : signed
              ? [
                  {
                    label: "Report post",
                    hint: "Tell Dynorex about a problem.",
                    onPress: () => setReport({ type: "post", id }),
                  },
                ]
              : []
        }
      />
      <PostCard post={post} liked={liked} canLike={signed} onChanged={refresh} />
      <SaveButton kind="post" id={post.post_id} />
      {post.club_id ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/clubs/${post.club_id}`)}
          style={{ minHeight: touch.min, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text accent>{`Open ${post.club_name ?? "the club"}`}</Text>
        </Pressable>
      ) : null}

      <SectionHeader>Comments</SectionHeader>
      {comments.length === 0 ? <Text muted>No comments yet.</Text> : null}
      {comments.map((c) => (
        <Card key={c.comment_id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Avatar username={c.author_username} size={28} />
            <Text variant="caption" muted style={{ flex: 1 }}>
              {`@${c.author_username} · ${relativeAge(Date.parse(c.created_at))}`}
            </Text>
            {signed ? (
              <IconButton label={`Options for @${c.author_username}'s comment`} onPress={() => setCommentMenu(c)}>
                <MoreIcon color={color.textMuted} size={20} />
              </IconButton>
            ) : null}
          </View>
          {c.sticker ? (
            <View accessible accessibilityLabel={`Torq sticker: ${stickerName(c.sticker as StickerId)}`}>
              <Sticker id={c.sticker as StickerId} size={56} animate={false} />
            </View>
          ) : null}
          {c.body ? <Text>{c.body}</Text> : null}
        </Card>
      ))}

      {error ? <InlineError kind={error.key} /> : null}
      {signed ? (
        <View style={{ gap: space.sm }}>
          <TextField label="Add a comment" value={text} onChangeText={setText} maxLength={1000} multiline />
          <Button
            title="Comment"
            disabled={!text.trim()}
            loading={busy}
            onPress={() => void send({ body: text.trim() })}
          />
          <Text variant="label">{plus ? "Reply with Torq" : "Reply with Torq · Dynorex+ only"}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
            {STICKERS.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`Reply with ${s.name}${plus ? "" : ". Dynorex+ only"}`}
                onPress={() => (plus ? void send({ sticker: s.id }) : setLockedSticker(s.id))}
                style={{
                  minWidth: touch.min,
                  minHeight: touch.min,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: radius.md,
                  borderWidth: lockedSticker === s.id ? border.regular : 0,
                  borderColor: color.accent,
                }}
              >
                <View style={plus ? undefined : { opacity: 0.45 }}>
                  <Sticker id={s.id} size={44} animate={false} />
                </View>
                {!plus ? (
                  <View style={{ position: "absolute" }}>
                    <LockIcon color={color.text} />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
          {lockedSticker ? (
            <View style={{ gap: space.xs }}>
              <Text variant="bodyStrong">{`${stickerName(lockedSticker)} is Dynorex+ only`}</Text>
              <Button title="See Dynorex+" onPress={() => router.push("/plus?source=stickers")} />
            </View>
          ) : null}
        </View>
      ) : (
        <Button title="Sign in to comment" variant="secondary" onPress={goToSignIn} />
      )}

      <ActionSheet
        visible={commentMenu !== null}
        title="Comment"
        onClose={() => setCommentMenu(null)}
        actions={
          commentMenu && me === commentMenu.author_username
            ? [
                {
                  label: "Delete comment",
                  destructive: true,
                  onPress: async () => {
                    const r = await communityService.deleteComment(commentMenu.comment_id);
                    if (!r.ok) setError(r.error);
                    refresh();
                  },
                },
              ]
            : commentMenu
              ? [{ label: "Report comment", onPress: () => setReport({ type: "comment", id: commentMenu.comment_id }) }]
              : []
        }
      />
      <ReportSheet visible={report !== null} target={report ?? { type: "post", id }} onClose={() => setReport(null)} />
      <ConfirmModal
        visible={confirmDelete}
        kind="deletePost"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const r = await communityService.deletePost(id);
          if (!r.ok) return setError(r.error);
          if (router.canGoBack()) router.back();
          else router.replace("/paddock");
        }}
      />
    </Screen>
  );
}
