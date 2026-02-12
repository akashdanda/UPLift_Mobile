import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  getDiscoverGroups,
  getMyGroups,
  joinGroup,
  leaveGroup,
  type GroupWithMeta,
} from '@/lib/groups'

export default function GroupsScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { session, refreshProfile } = useAuthContext()

  const [myGroups, setMyGroups] = useState<GroupWithMeta[]>([])
  const [discoverGroups, setDiscoverGroups] = useState<GroupWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const userId = session?.user?.id ?? ''

  const load = useCallback(() => {
    if (!userId) {
      setMyGroups([])
      setDiscoverGroups([])
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([getMyGroups(userId), getDiscoverGroups(userId)])
      .then(([my, discover]) => {
        setMyGroups(my)
        setDiscoverGroups(discover)
      })
      .finally(() => setLoading(false))
  }, [userId])

  useFocusEffect(useCallback(() => load(), [load]))

  const handleJoin = async (groupId: string) => {
    if (!userId) return
    setActingId(groupId)
    const { error } = await joinGroup(userId, groupId)
    setActingId(null)
    if (error) Alert.alert('Error', error.message)
    else {
      await refreshProfile()
      load()
    }
  }

  const handleLeave = (group: GroupWithMeta) => {
    Alert.alert('Leave group', `Leave "${group.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return
          setActingId(group.id)
          const { error } = await leaveGroup(userId, group.id)
          setActingId(null)
          if (error) Alert.alert('Error', error.message)
          else {
            await refreshProfile()
            load()
          }
        },
      },
    ])
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
            Groups
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>
            Train together, stay accountable
          </ThemedText>
        </ThemedView>

        <Pressable
          style={[styles.createButton, { backgroundColor: colors.tint }]}
          onPress={() => router.push('/create-group')}
        >
          <ThemedText style={styles.createButtonText}>Create group</ThemedText>
        </Pressable>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Your groups
          </ThemedText>
          {loading && myGroups.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : myGroups.length === 0 ? (
            <ThemedView style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                You haven&apos;t joined any groups yet. Create one above or join a public group below.
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={styles.list}>
              {myGroups.map((g) => (
                <View
                  key={g.id}
                  style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}
                >
                  <View style={styles.groupCardMain}>
                    <ThemedText type="defaultSemiBold" style={[styles.groupName, { color: colors.text }]}>
                      {g.name}
                    </ThemedText>
                    {g.description ? (
                      <ThemedText style={[styles.groupDesc, { color: colors.textMuted }]} numberOfLines={2}>
                        {g.description}
                      </ThemedText>
                    ) : null}
                    <ThemedText style={[styles.memberCount, { color: colors.textMuted }]}>
                      {g.member_count ?? 0} member{(g.member_count ?? 0) !== 1 ? 's' : ''}
                    </ThemedText>
                  </View>
                  <Pressable
                    style={[styles.leaveButton, { borderColor: colors.tabBarBorder }]}
                    onPress={() => handleLeave(g)}
                    disabled={actingId === g.id}
                  >
                    <ThemedText style={[styles.leaveButtonText, { color: colors.textMuted }]}>Leave</ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Discover
          </ThemedText>
          <ThemedText style={[styles.sectionHint, { color: colors.textMuted }]}>
            Public groups you can join
          </ThemedText>
          {loading && discoverGroups.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : discoverGroups.length === 0 ? (
            <ThemedView style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                No more public groups to discover. Create your own above.
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={styles.list}>
              {discoverGroups.map((g) => (
                <View
                  key={g.id}
                  style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}
                >
                  <View style={styles.groupCardMain}>
                    <ThemedText type="defaultSemiBold" style={[styles.groupName, { color: colors.text }]}>
                      {g.name}
                    </ThemedText>
                    {g.description ? (
                      <ThemedText style={[styles.groupDesc, { color: colors.textMuted }]} numberOfLines={2}>
                        {g.description}
                      </ThemedText>
                    ) : null}
                    <ThemedText style={[styles.memberCount, { color: colors.textMuted }]}>
                      {g.member_count ?? 0} member{(g.member_count ?? 0) !== 1 ? 's' : ''}
                    </ThemedText>
                  </View>
                  <Pressable
                    style={[styles.joinButton, { backgroundColor: colors.tint }]}
                    onPress={() => handleJoin(g.id)}
                    disabled={actingId === g.id}
                  >
                    {actingId === g.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <ThemedText style={styles.joinButtonText}>Join</ThemedText>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { marginBottom: 4 },
  subtitle: { fontSize: 15 },
  createButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  createButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { marginBottom: 4 },
  sectionHint: { fontSize: 14, marginBottom: 12 },
  loadingRow: { paddingVertical: 20, alignItems: 'center' },
  emptyCard: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyText: { textAlign: 'center', lineHeight: 22 },
  list: { gap: 12 },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  groupCardMain: { flex: 1 },
  groupName: { fontSize: 16 },
  groupDesc: { fontSize: 14, marginTop: 4 },
  memberCount: { fontSize: 13, marginTop: 4 },
  joinButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginLeft: 12,
  },
  joinButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  leaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 12,
  },
  leaveButtonText: { fontSize: 14 },
})
