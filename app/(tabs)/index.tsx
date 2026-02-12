import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuthContext } from '@/hooks/use-auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFriendsWorkouts, type FeedItem } from '@/lib/feed';
import { supabase } from '@/lib/supabase';
import type { Workout } from '@/types/workout';

function formatFeedDate(workoutDate: string): string {
  const d = new Date(workoutDate + 'Z');
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
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
  const { session } = useAuthContext();
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

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.greeting}>
          UPLift
        </ThemedText>
        <ThemedText style={styles.subtitle}>Your fitness community</ThemedText>
      </ThemedView>

      <ThemedView style={[styles.card, { backgroundColor: colors.tint + '18' }]}>
        <ThemedText type="subtitle" style={styles.cardTitle}>
          Today&apos;s focus
        </ThemedText>
        <ThemedText style={styles.cardText}>
          Log a workout, join a challenge, or cheer on your friends. Stay consistent and climb the
          leaderboard.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Quick actions
        </ThemedText>
        <View style={styles.quickActions}>
          <Pressable
            style={[styles.actionCard, { borderColor: colors.tint + '40' }]}
            onPress={() => router.push('/log-workout')}
          >
            <ThemedText type="defaultSemiBold">Log workout</ThemedText>
            <ThemedText style={styles.actionHint}>
              {todayWorkout ? "Today's logged ✓" : 'Take a photo, post once a day'}
            </ThemedText>
          </Pressable>
          <ThemedView style={[styles.actionCard, { borderColor: colors.tint + '40' }]}>
            <ThemedText type="defaultSemiBold">Active challenges</ThemedText>
            <ThemedText style={styles.actionHint}>See leaderboard</ThemedText>
          </ThemedView>
        </View>
      </ThemedView>

      {todayWorkout && (
        <ThemedView style={[styles.section, styles.todaySection]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Today&apos;s workout
          </ThemedText>
          <View style={[styles.todayCard, { backgroundColor: colors.card }]}>
            <Image source={{ uri: todayWorkout.image_url }} style={styles.todayImage} />
            {todayWorkout.caption ? (
              <ThemedText style={[styles.todayCaption, { color: colors.textMuted }]}>{todayWorkout.caption}</ThemedText>
            ) : null}
          </View>
        </ThemedView>
      )}

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
          Feed
        </ThemedText>
        <ThemedText style={[styles.feedSubtitle, { color: colors.textMuted }]}>
          Friends&apos; daily workouts
        </ThemedText>
        {feedItems.length === 0 ? (
          <ThemedView style={[styles.feedPlaceholder, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            <ThemedText style={[styles.feedEmpty, { color: colors.textMuted }]}>
              Add friends from Profile → Friends to see their workout posts here.
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.feedList}>
            {feedItems.map((item) => (
              <View
                key={item.workout.id}
                style={[styles.feedCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}
              >
                <View style={styles.feedCardHeader}>
                  <View style={[styles.feedAvatar, { backgroundColor: colors.tint + '25' }]}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.feedAvatarImage} />
                    ) : (
                      <ThemedText style={[styles.feedAvatarInitials, { color: colors.tint }]}>
                        {getInitials(item.display_name)}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.feedCardMeta}>
                    <ThemedText style={[styles.feedName, { color: colors.text }]}>
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
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    marginBottom: 4,
  },
  subtitle: {
    opacity: 0.8,
  },
  card: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  cardTitle: {
    marginBottom: 8,
  },
  cardText: {
    opacity: 0.9,
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionHint: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.7,
  },
  todaySection: {},
  todayCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  todayImage: {
    width: '100%',
    aspectRatio: 1,
  },
  todayCaption: {
    padding: 16,
    fontSize: 14,
  },
  feedSubtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  feedPlaceholder: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  feedEmpty: {
    textAlign: 'center',
    fontSize: 14,
  },
  feedList: {
    gap: 16,
  },
  feedCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
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
  feedAvatarImage: {
    width: 40,
    height: 40,
  },
  feedAvatarInitials: {
    fontSize: 14,
    fontWeight: '600',
  },
  feedCardMeta: {
    flex: 1,
  },
  feedName: {
    fontSize: 16,
    fontWeight: '600',
  },
  feedDate: {
    fontSize: 13,
    marginTop: 2,
  },
  feedImage: {
    width: '100%',
    aspectRatio: 1,
  },
  feedCaption: {
    padding: 12,
    fontSize: 15,
  },
});
