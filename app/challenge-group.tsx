import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { challengeGroup, getChallengeableGroups } from '@/lib/competitions'

function getGroupInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function ChallengeGroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [challengeableGroups, setChallengeableGroups] = useState<
    Array<{ id: string; name: string; avatar_url: string | null; member_count: number }>
  >([])
  const [loading, setLoading] = useState(true)
  const [challengingId, setChallengingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const userId = session?.user?.id ?? ''

  const loadGroups = useCallback(async () => {
    if (!groupId || !userId) return
    setLoading(true)
    try {
      const groups = await getChallengeableGroups(groupId, userId)
      setChallengeableGroups(groups)
    } catch {
      Alert.alert('Error', 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }, [groupId, userId])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const handleChallenge = async (targetGroupId: string) => {
    if (!groupId || !userId) return
    setChallengingId(targetGroupId)
    const { competition, error } = await challengeGroup(groupId, targetGroupId, userId)
    setChallengingId(null)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      Alert.alert('Challenge Sent!', 'The group leader will be notified and can accept your challenge.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    }
  }

  const filteredGroups = challengeableGroups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
          Challenge a Group
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>
          Select a group to challenge to a 7-day competition
        </ThemedText>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search groups..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : filteredGroups.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted + '50'} style={{ marginBottom: 12 }} />
            <ThemedText type="defaultSemiBold" style={[styles.emptyTitle, { color: colors.text }]}>
              No groups available
            </ThemedText>
            <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
              {searchQuery.trim() !== ''
                ? 'No groups match your search'
                : 'All available groups are already in competitions or you are already a member'}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.groupsList}>
            {filteredGroups.map((group) => (
              <Pressable
                key={group.id}
                style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}
                onPress={() => handleChallenge(group.id)}
                disabled={challengingId === group.id}
              >
                <View style={styles.groupCardContent}>
                  {group.avatar_url ? (
                    <Image source={{ uri: group.avatar_url }} style={styles.groupAvatar} />
                  ) : (
                    <View style={[styles.groupAvatar, { backgroundColor: colors.tint + '20' }]}>
                      <ThemedText style={[styles.groupAvatarText, { color: colors.tint }]}>
                        {getGroupInitials(group.name)}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.groupInfo}>
                    <ThemedText type="defaultSemiBold" style={[styles.groupName, { color: colors.text }]}>
                      {group.name}
                    </ThemedText>
                    <ThemedText style={[styles.groupMeta, { color: colors.textMuted }]}>
                      {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                    </ThemedText>
                  </View>
                </View>
                {challengingId === group.id ? (
                  <ActivityIndicator color={colors.tint} size="small" />
                ) : (
                  <Ionicons name="arrow-forward-circle" size={24} color={colors.tint} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    marginBottom: 20,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  loadingRow: { paddingVertical: 40, alignItems: 'center' },
  emptyCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, marginBottom: 6 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  groupsList: { gap: 12 },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  groupCardContent: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  groupAvatar: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groupAvatarText: { fontSize: 18, fontWeight: '700' },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, marginBottom: 2 },
  groupMeta: { fontSize: 13 },
})
