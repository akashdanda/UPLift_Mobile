import { StyleSheet, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

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
          <ThemedView style={[styles.actionCard, { borderColor: colors.tint + '40' }]}>
            <ThemedText type="defaultSemiBold">Log workout</ThemedText>
            <ThemedText style={styles.actionHint}>Track your session</ThemedText>
          </ThemedView>
          <ThemedView style={[styles.actionCard, { borderColor: colors.tint + '40' }]}>
            <ThemedText type="defaultSemiBold">Active challenges</ThemedText>
            <ThemedText style={styles.actionHint}>See leaderboard</ThemedText>
          </ThemedView>
        </View>
      </ThemedView>

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
