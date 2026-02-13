import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuthContext } from '@/hooks/use-auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addComment } from '@/lib/comments';
import { getFriendsWorkouts, type FeedItem } from '@/lib/feed';
import { addReaction, removeReaction } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import type { WorkoutCommentWithProfile } from '@/types/comment';
import type { WorkoutReactionWithProfile } from '@/types/reaction';
import type { Workout } from '@/types/workout';

const REACTION_EMOJIS = ['🔥', '💪', '👍', '❤️', '😂', '😮', '🙌', '😊'];

function formatFeedDate(workoutDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workoutDate);
  if (!match) return '';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, monthIndex, day);
  if (Number.isNaN(d.getTime())) return '';

  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]?.[0]) return parts[0][0].toUpperCase();
  }
  return '?';
}

function getTodayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { session, profile } = useAuthContext();
  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);

  // React modal (BeReal-style: photo + emoji)
  const [reactModalItem, setReactModalItem] = useState<FeedItem | null>(null);
  const [reactPendingPhoto, setReactPendingPhoto] = useState<string | null>(null);
  const [reactPendingEmoji, setReactPendingEmoji] = useState<string | null>(null);
  const [reactSubmitting, setReactSubmitting] = useState(false);

  // Comment modal
  const [commentModalItem, setCommentModalItem] = useState<FeedItem | null>(null);
  const [commentMessage, setCommentMessage] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const refreshFeed = useCallback(() => {
    if (session) getFriendsWorkouts(session.user.id).then(setFeedItems);
  }, [session]);

  const openReactModal = (item: FeedItem) => {
    setReactModalItem(item);
    setReactPendingPhoto(null);
    setReactPendingEmoji(null);
  };

  const closeReactModal = () => {
    setReactModalItem(null);
    setReactPendingPhoto(null);
    setReactPendingEmoji(null);
  };

  const handleTakeReactionPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a reaction photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) setReactPendingPhoto(result.assets[0].uri);
  };

  const handlePostReaction = async () => {
    if (!session || !reactModalItem || !reactPendingEmoji) return;
    setReactSubmitting(true);
    const result = await addReaction(
      reactModalItem.workout.id,
      session.user.id,
      reactPendingEmoji,
      reactPendingPhoto
    );
    setReactSubmitting(false);
    if ('error' in result) {
      Alert.alert('Reaction failed', result.error.message);
      return;
    }
    setFeedItems((prev) =>
      prev.map((item) =>
        item.workout.id === reactModalItem.workout.id
          ? {
              ...item,
              reactions: [
                ...(item.reactions ?? []).filter((r) => r.user_id !== session.user.id),
                {
                  id: '',
                  workout_id: reactModalItem.workout.id,
                  user_id: session.user.id,
                  emoji: reactPendingEmoji,
                  reaction_image_url: null,
                  created_at: new Date().toISOString(),
                  display_name: profile?.display_name ?? null,
                  avatar_url: profile?.avatar_url ?? null,
                } as WorkoutReactionWithProfile,
              ],
            }
          : item
      )
    );
    closeReactModal();
    refreshFeed();
  };

  const openCommentModal = (item: FeedItem) => {
    setCommentModalItem(item);
    setCommentMessage('');
  };

  const closeCommentModal = () => {
    setCommentModalItem(null);
    setCommentMessage('');
  };

  const handlePostComment = async () => {
    if (!session || !commentModalItem) return;
    const message = commentMessage.trim() || null;
    if (!message) {
      Alert.alert('Add a comment', 'Type something to post.');
      return;
    }
    setCommentSubmitting(true);
    const result = await addComment(commentModalItem.workout.id, session.user.id, { message });
    setCommentSubmitting(false);
    if ('error' in result) {
      Alert.alert('Comment failed', result.error.message);
      return;
    }
    setFeedItems((prev) =>
      prev.map((i) => {
        if (i.workout.id !== commentModalItem.workout.id) return i;
        const newComment: WorkoutCommentWithProfile = {
          id: result.id,
          workout_id: commentModalItem.workout.id,
          user_id: session.user.id,
          message,
          gif_url: null,
          created_at: new Date().toISOString(),
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
        };
        return { ...i, comments: [...(i.comments ?? []), newComment] };
      })
    );
    closeCommentModal();
    refreshFeed();
  };

  const handleRemoveReaction = async (item: FeedItem) => {
    if (!session) return;
    const existing = item.reactions?.find((r) => r.user_id === session.user.id);
    if (!existing) return;
    const result = await removeReaction(item.workout.id, session.user.id);
    if ('error' in result) {
      Alert.alert('Could not remove', result.error.message);
      return;
    }
    setFeedItems((prev) =>
      prev.map((i) =>
        i.workout.id === item.workout.id
          ? { ...i, reactions: (i.reactions ?? []).filter((r) => r.user_id !== session.user.id) }
          : i
      )
    );
  };

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setTodayWorkout(null);
        setFeedItems([]);
        return;
      }
      const today = getTodayLocalDate();
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('workout_date', today)
        .maybeSingle()
        .then(({ data }) => setTodayWorkout((data as Workout) ?? null));
      getFriendsWorkouts(session.user.id).then(setFeedItems);
    }, [session])
  );

  const streak = profile?.streak ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="title" style={styles.greeting}>
              UPLift
            </ThemedText>
            <ThemedText style={[styles.headerSub, { color: colors.textMuted }]}>
              Your fitness community
            </ThemedText>
          </View>
        </View>

        {/* Streak banner */}
        <View style={[styles.streakBanner, { backgroundColor: colors.warm + '15' }]}>
          <Ionicons name="flame" size={28} color={colors.warm} />
          <View style={styles.streakText}>
            <ThemedText type="defaultSemiBold" style={[styles.streakValue, { color: colors.warm }]}>
              {streak > 0 ? `${streak} day streak` : 'No streak yet'}
            </ThemedText>
            <ThemedText style={[styles.streakHint, { color: colors.textMuted }]}>
              {streak > 0
                ? 'Keep it going — log today to stay on fire'
                : 'Log your first workout to start a streak'}
            </ThemedText>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionPill,
              { backgroundColor: todayWorkout ? colors.tint : colors.tint },
              pressed && styles.actionPillPressed,
            ]}
            onPress={() => router.push('/log-workout')}
          >
            <Ionicons
              name={todayWorkout ? 'checkmark-circle' : 'camera'}
              size={18}
              color="#fff"
            />
            <ThemedText style={styles.actionPillText}>
              {todayWorkout ? 'Logged' : 'Log workout'}
            </ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionPillOutline,
              { borderColor: colors.tint + '50', backgroundColor: colors.cardElevated },
              pressed && styles.actionPillPressed,
            ]}
            onPress={() => router.push({ pathname: '/leaderboard', params: { scope: 'global' } })}
          >
            <Ionicons name="trophy" size={18} color={colors.tint} />
            <ThemedText style={[styles.actionPillTextOutline, { color: colors.text }]}>
              Top athletes
            </ThemedText>
          </Pressable>
        </View>

        {/* Today's workout */}
        {todayWorkout && (
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Today&apos;s workout
            </ThemedText>
            <View style={[styles.todayCard, { backgroundColor: colors.card }]}>
              <Image source={{ uri: todayWorkout.image_url }} style={styles.todayImage} />
              {todayWorkout.caption ? (
                <View style={styles.captionRow}>
                  <ThemedText style={[styles.todayCaption, { color: colors.text }]}>
                    {todayWorkout.caption}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Feed */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Feed
          </ThemedText>
          {feedItems.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardElevated }]}>
              <Ionicons name="people-outline" size={32} color={colors.textMuted + '60'} style={{ marginBottom: 8 }} />
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                Add friends to see their workout posts here
              </ThemedText>
            </View>
          ) : (
            <View style={styles.feedList}>
              {feedItems.map((item) => (
                <View
                  key={item.workout.id}
                  style={[styles.feedCard, { backgroundColor: colors.card }]}
                >
                  <Pressable
                    style={styles.feedCardHeader}
                    onPress={() => router.push(`/friend-profile?id=${item.workout.user_id}`)}
                  >
                    <View style={[styles.feedAvatar, { backgroundColor: colors.tint + '20' }]}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.feedAvatarImage} />
                      ) : (
                        <ThemedText style={[styles.feedAvatarInitials, { color: colors.tint }]}>
                          {getInitials(item.display_name)}
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.feedCardMeta}>
                      <ThemedText type="defaultSemiBold" style={[styles.feedName, { color: colors.text }]}>
                        {item.display_name || 'Anonymous'}
                      </ThemedText>
                      <ThemedText style={[styles.feedDate, { color: colors.textMuted }]}>
                        {formatFeedDate(item.workout.workout_date)}
                      </ThemedText>
                    </View>
                  </Pressable>
                  <Image source={{ uri: item.workout.image_url }} style={styles.feedImage} />
                  {item.workout.caption ? (
                    <ThemedText style={[styles.feedCaption, { color: colors.text }]}>
                      {item.workout.caption}
                    </ThemedText>
                  ) : null}
                  <View style={[styles.reactionRow, { borderTopColor: colors.tabBarBorder }]}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.reactionBubbles}
                    >
                      {(item.reactions ?? []).map((r) => (
                        <View key={r.id} style={styles.reactionBubbleWrap}>
                          <View style={styles.reactionBubble}>
                            <View style={styles.reactionBubblePhotoWrap}>
                              {r.reaction_image_url ? (
                                <Image source={{ uri: r.reaction_image_url }} style={styles.reactionBubbleImage} />
                              ) : (
                                <View style={[styles.reactionBubblePlaceholder, { backgroundColor: colors.tint + '25' }]}>
                                  {r.avatar_url ? (
                                    <Image source={{ uri: r.avatar_url }} style={styles.reactionBubbleImage} />
                                  ) : (
                                    <ThemedText style={[styles.reactionBubbleInitials, { color: colors.tint }]}>
                                      {getInitials(r.display_name)}
                                    </ThemedText>
                                  )}
                                </View>
                              )}
                            </View>
                            <View style={styles.reactionEmojiBadge}>
                              <ThemedText style={styles.reactionEmojiText}>{r.emoji}</ThemedText>
                            </View>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                    {session && (() => {
                      const myReaction = item.reactions?.find((r) => r.user_id === session.user.id);
                      return myReaction ? (
                        <Pressable
                          onPress={() => handleRemoveReaction(item)}
                          style={[styles.reactButton, { backgroundColor: colors.textMuted + '20' }]}
                        >
                          <ThemedText style={[styles.reactButtonText, { color: colors.textMuted }]}>
                            Remove
                          </ThemedText>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => openReactModal(item)}
                          style={[styles.reactButton, { backgroundColor: colors.tint + '20' }]}
                        >
                          <Ionicons name="add-circle-outline" size={18} color={colors.tint} />
                          <ThemedText style={[styles.reactButtonText, { color: colors.tint }]}>React</ThemedText>
                        </Pressable>
                      );
                    })()}
                  </View>
                  {/* Comments */}
                  <View style={[styles.commentsSection, { borderTopColor: colors.tabBarBorder }]}>
                    {(item.comments ?? []).map((c) => (
                      <View key={c.id} style={styles.commentRow}>
                        <View style={[styles.commentAvatar, { backgroundColor: colors.tint + '20' }]}>
                          {c.avatar_url ? (
                            <Image source={{ uri: c.avatar_url }} style={styles.commentAvatarImage} />
                          ) : (
                            <ThemedText style={[styles.commentAvatarInitials, { color: colors.tint }]}>
                              {getInitials(c.display_name)}
                            </ThemedText>
                          )}
                        </View>
                        <View style={styles.commentBody}>
                          <ThemedText type="defaultSemiBold" style={[styles.commentAuthor, { color: colors.text }]}>
                            {c.display_name || 'Anonymous'}
                          </ThemedText>
                          {c.message ? (
                            <ThemedText style={[styles.commentText, { color: colors.text }]}>{c.message}</ThemedText>
                          ) : null}
                        </View>
                      </View>
                    ))}
                    {session && (
                      <Pressable
                        onPress={() => openCommentModal(item)}
                        style={[styles.commentButton, { borderColor: colors.tabBarBorder }]}
                      >
                        <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
                        <ThemedText style={[styles.commentButtonText, { color: colors.textMuted }]}>
                          {item.comments?.length ? `Comment (${item.comments.length})` : 'Comment'}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!reactModalItem}
        transparent
        animationType="slide"
        onRequestClose={closeReactModal}
      >
        <Pressable style={styles.reactModalOverlay} onPress={closeReactModal}>
          <Pressable style={[styles.reactModalContent, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <ThemedText type="subtitle" style={[styles.reactModalTitle, { color: colors.text }]}>
              Add reaction
            </ThemedText>
            <ThemedText style={[styles.reactModalHint, { color: colors.textMuted }]}>
              Take a selfie and pick an emoji
            </ThemedText>
            <Pressable
              onPress={handleTakeReactionPhoto}
              style={[styles.reactPhotoBox, { backgroundColor: colors.cardElevated, borderColor: colors.tabBarBorder }]}
            >
              {reactPendingPhoto ? (
                <Image source={{ uri: reactPendingPhoto }} style={styles.reactPhotoPreview} />
              ) : (
                <>
                  <Ionicons name="camera" size={36} color={colors.textMuted} />
                  <ThemedText style={[styles.reactPhotoLabel, { color: colors.textMuted }]}>Take photo</ThemedText>
                </>
              )}
            </Pressable>
            <View style={styles.reactEmojiRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => setReactPendingEmoji(emoji)}
                  style={[
                    styles.reactEmojiOption,
                    { backgroundColor: reactPendingEmoji === emoji ? colors.tint + '25' : colors.cardElevated },
                    reactPendingEmoji === emoji && { borderColor: colors.tint, borderWidth: 2 },
                  ]}
                >
                  <ThemedText style={styles.reactEmojiOptionText}>{emoji}</ThemedText>
                </Pressable>
              ))}
            </View>
            <View style={styles.reactModalActions}>
              <Pressable
                onPress={handlePostReaction}
                disabled={!reactPendingEmoji || reactSubmitting}
                style={[
                  styles.reactSubmitButton,
                  { backgroundColor: reactPendingEmoji ? colors.tint : colors.textMuted + '40' },
                ]}
              >
                {reactSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText style={styles.reactSubmitButtonText}>Post reaction</ThemedText>
                )}
              </Pressable>
              <Pressable onPress={closeReactModal} style={[styles.reactCancelButton, { borderColor: colors.tabBarBorder }]}>
                <ThemedText style={[styles.reactCancelText, { color: colors.textMuted }]}>Cancel</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Comment modal — Instagram-style */}
      <Modal
        visible={!!commentModalItem}
        transparent
        animationType="slide"
        onRequestClose={closeCommentModal}
      >
        <Pressable style={styles.commentModalOverlay} onPress={closeCommentModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.commentKeyboardAvoid}
            keyboardVerticalOffset={0}
          >
            <Pressable
              style={[styles.commentModalSheet, { backgroundColor: colors.background }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={[styles.commentModalHandle, { backgroundColor: colors.textMuted + '40' }]} />
              <View style={[styles.commentModalHeader, { borderBottomColor: colors.tabBarBorder }]}>
                <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16 }}>
                  Add comment
                </ThemedText>
                <Pressable onPress={closeCommentModal} hitSlop={12} style={styles.commentModalClose}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.commentModalInputRow}>
                <TextInput
                style={[
                  styles.commentModalInput,
                  {
                    backgroundColor: colors.cardElevated,
                    color: colors.text,
                    borderColor: colors.tabBarBorder,
                  },
                ]}
                placeholder="Add a comment..."
                placeholderTextColor={colors.textMuted}
                value={commentMessage}
                onChangeText={setCommentMessage}
                multiline
                maxLength={500}
              />
              <Pressable
                onPress={handlePostComment}
                disabled={commentSubmitting || !commentMessage.trim()}
                style={({ pressed }) => [
                  styles.commentPostButton,
                  {
                    opacity: commentMessage.trim() ? (pressed ? 0.7 : 1) : 0.4,
                  },
                ]}
              >
                {commentSubmitting ? (
                  <ActivityIndicator color={colors.tint} size="small" />
                ) : (
                  <ThemedText
                    style={[
                      styles.commentPostButtonText,
                      { color: commentMessage.trim() ? colors.tint : colors.textMuted },
                    ]}
                  >
                    Post
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 14, marginTop: 2 },

  // Streak banner
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    gap: 12,
  },
  streakText: { flex: 1 },
  streakValue: { fontSize: 17 },
  streakHint: { fontSize: 13, marginTop: 2 },

  // Quick actions — pill buttons
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 999,
  },
  actionPillOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionPillPressed: { opacity: 0.8 },
  actionPillText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actionPillTextOutline: { fontSize: 14, fontWeight: '600' },

  // Sections
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },

  // Today's workout
  todayCard: { borderRadius: 20, overflow: 'hidden' },
  todayImage: { width: '100%', aspectRatio: 1 },
  captionRow: { padding: 14 },
  todayCaption: { fontSize: 15, lineHeight: 22 },

  // Empty state
  emptyCard: {
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 22 },

  // Feed
  feedList: { gap: 16 },
  feedCard: { borderRadius: 20, overflow: 'hidden' },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  feedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  feedAvatarImage: { width: 40, height: 40 },
  feedAvatarInitials: { fontSize: 14, fontWeight: '600' },
  feedCardMeta: { flex: 1 },
  feedName: { fontSize: 15 },
  feedDate: { fontSize: 12, marginTop: 1 },
  feedImage: { width: '100%', aspectRatio: 1 },
  feedCaption: { padding: 14, fontSize: 15, lineHeight: 22 },

  // Reactions (BeReal-style)
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  reactionBubbles: { flexDirection: 'row', alignItems: 'center', gap: 6, flexGrow: 0 },
  reactionBubbleWrap: {
    width: 40,
    height: 40,
  },
  reactionBubble: {
    width: 40,
    height: 40,
  },
  reactionBubblePhotoWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  reactionBubblePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reactionBubbleImage: { width: 36, height: 36 },
  reactionBubbleInitials: { fontSize: 12, fontWeight: '600' },
  reactionEmojiBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
  },
  reactionEmojiText: { fontSize: 16 },
  reactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  reactButtonText: { fontSize: 13, fontWeight: '600' },

  // Comments
  commentsSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  commentAvatarImage: { width: 28, height: 28 },
  commentAvatarInitials: { fontSize: 11, fontWeight: '600' },
  commentBody: { flex: 1, minWidth: 0 },
  commentAuthor: { fontSize: 13, marginBottom: 2 },
  commentText: { fontSize: 14, lineHeight: 20 },
  commentGif: { width: 120, height: 90, borderRadius: 8, marginTop: 6 },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  commentButtonText: { fontSize: 13 },

  // React modal
  reactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reactModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  reactModalTitle: { marginBottom: 4, textAlign: 'center' },
  reactModalHint: { fontSize: 13, textAlign: 'center', marginBottom: 20 },
  // Comment modal — Instagram-style
  commentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  commentKeyboardAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentModalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
  },
  commentModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  commentModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentModalClose: { padding: 4 },
  commentModalInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  commentModalInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 10,
    fontSize: 15,
    minHeight: 40,
    maxHeight: 100,
    textAlignVertical: 'center',
  },
  commentPostButton: {
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  commentPostButtonText: { fontSize: 15, fontWeight: '600' },
  reactPhotoBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    overflow: 'hidden',
  },
  reactPhotoPreview: { width: 120, height: 120, borderRadius: 60 },
  reactPhotoLabel: { fontSize: 12, marginTop: 6 },
  reactEmojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  reactEmojiOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactEmojiOptionText: { fontSize: 22 },
  reactModalActions: { gap: 10 },
  reactSubmitButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  reactSubmitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  reactCancelButton: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  reactCancelText: { fontSize: 15 },
});
