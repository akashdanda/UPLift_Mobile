import { StyleSheet, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function GroupsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          Groups
        </ThemedText>
        <ThemedText style={styles.subtitle}>Train together, stay accountable</ThemedText>
      </ThemedView>

      <ThemedView style={[styles.card, { borderColor: colors.tint + '40' }]}>
        <ThemedText type="subtitle" style={styles.cardTitle}>
          Your groups
        </ThemedText>
        <ThemedView style={[styles.emptyState, { backgroundColor: colors.background }]}>
          <ThemedText style={{ color: colors.icon, textAlign: 'center' }}>
            You haven&apos;t joined any groups yet. Create one or discover public groups to start
            competing with friends.
          </ThemedText>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Discover
        </ThemedText>
        <ThemedView style={[styles.discoverCard, { backgroundColor: colors.tint + '18' }]}>
          <ThemedText type="defaultSemiBold">Browse public groups</ThemedText>
          <ThemedText style={styles.discoverHint}>
            Find groups by goal, location, or activity type.
          </ThemedText>
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
  title: {
    marginBottom: 4,
  },
  subtitle: {
    opacity: 0.8,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  cardTitle: {
    marginBottom: 12,
  },
  emptyState: {
    padding: 24,
    borderRadius: 12,
    minHeight: 100,
    justifyContent: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  discoverCard: {
    padding: 20,
    borderRadius: 12,
  },
  discoverHint: {
    marginTop: 4,
    fontSize: 14,
    opacity: 0.8,
  },
});
