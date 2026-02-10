import { StyleSheet, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function LeaderboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const placeholderRanks = [
    { rank: 1, name: 'Top lifter', points: '2,450' },
    { rank: 2, name: 'Second place', points: '2,120' },
    { rank: 3, name: 'Third place', points: '1,890' },
  ];

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          Leaderboard
        </ThemedText>
        <ThemedText style={styles.subtitle}>Compete and climb the ranks</ThemedText>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          This week
        </ThemedText>
        {placeholderRanks.map(({ rank, name, points }) => (
          <ThemedView
            key={rank}
            style={[styles.row, rank <= 3 && { backgroundColor: colors.tint + '12' }]}>
            <ThemedText type="defaultSemiBold" style={styles.rank}>
              #{rank}
            </ThemedText>
            <ThemedText style={styles.name}>{name}</ThemedText>
            <ThemedText type="defaultSemiBold" style={[styles.points, { color: colors.tint }]}>
              {points} pts
            </ThemedText>
          </ThemedView>
        ))}
      </ThemedView>

      <ThemedView style={[styles.placeholderCard, { borderColor: colors.tint + '40' }]}>
        <ThemedText style={{ color: colors.icon, textAlign: 'center' }}>
          Connect Supabase to load real leaderboard data. You can rank by workouts completed,
          points, or group challenges.
        </ThemedText>
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
  title: {
    marginBottom: 4,
  },
  subtitle: {
    opacity: 0.8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  rank: {
    width: 40,
  },
  name: {
    flex: 1,
  },
  points: {},
  placeholderCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
