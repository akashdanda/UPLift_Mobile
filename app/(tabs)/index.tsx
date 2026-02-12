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
import { supabase } from '@/lib/supabase';
import type { Workout } from '@/types/workout';

function getTodayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { session } = useAuthContext();
  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setTodayWorkout(null);
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
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Feed
        </ThemedText>
        <ThemedView style={[styles.feedPlaceholder, { backgroundColor: colors.background }]}>
          <ThemedText style={{ color: colors.icon }}>Recent activity from your groups will appear here.</ThemedText>
        </ThemedView>
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
  feedPlaceholder: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#68707640',
  },
});
