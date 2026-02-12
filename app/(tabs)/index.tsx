import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuthContext } from '@/hooks/use-auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFriendsWorkouts, type FeedItem } from '@/lib/feed';
import { supabase } from '@/lib/supabase';
import type { Workout } from '@/types/workout';

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
                  <View style={styles.feedCardHeader}>
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
                  </View>
                  <Image source={{ uri: item.workout.image_url }} style={styles.feedImage} />
                  {item.workout.caption ? (
                    <ThemedText style={[styles.feedCaption, { color: colors.text }]}>
                      {item.workout.caption}
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
});
