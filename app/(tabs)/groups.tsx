import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  deleteGroup,
  getDiscoverGroups,
  getMyGroups,
  joinGroup,
  leaveGroup,
  searchGroups,
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<(GroupWithMeta & { _joined?: boolean })[]>([])
  const [searching, setSearching] = useState(false)

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

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q || !userId) {
      setSearchResults([])
      return
    }
    setSearching(true)
    searchGroups(q, userId)
      .then((results) => setSearchResults(results as (GroupWithMeta & { _joined?: boolean })[]))
      .catch(() => {})
      .finally(() => setSearching(false))
  }, [searchQuery, userId])

  const handleDelete = (group: GroupWithMeta) => {
    Alert.alert('Delete group', `Permanently delete "${group.name}"? All members will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return
          setActingId(group.id)
          const { error } = await deleteGroup(userId, group.id)
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
            Search groups
          </ThemedText>
          <View style={styles.searchRow}>
            <TextInput
              style={[
                styles.searchInput,
                { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
              ]}
              placeholder="Search by group name"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text)
                if (!text.trim()) setSearchResults([])
              }}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <Pressable style={[styles.searchButton, { backgroundColor: colors.tint }]} onPress={handleSearch}>
              <ThemedText style={styles.searchButtonText}>Search</ThemedText>
            </Pressable>
          </View>
          {searching && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          )}
          {searchResults.length > 0 && (
            <View style={styles.list}>
              {searchResults.map((g) => (
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
                  {g._joined ? (
                    <ThemedText style={[styles.joinedLabel, { color: colors.tint }]}>Joined</ThemedText>
                  ) : (
                    <Pressable
                      style={[styles.joinButton, { backgroundColor: colors.tint }]}
                      onPress={async () => {
                        await handleJoin(g.id)
                        handleSearch()
                      }}
                      disabled={actingId === g.id}
                    >
                      {actingId === g.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <ThemedText style={styles.joinButtonText}>Join</ThemedText>
                      )}
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
          {!searching && searchQuery.trim() !== '' && searchResults.length === 0 && (
            <ThemedText style={[styles.noResults, { color: colors.textMuted }]}>
              No public groups found matching &quot;{searchQuery.trim()}&quot;
            </ThemedText>
          )}
        </ThemedView>

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
                    <View style={styles.groupNameRow}>
                      <ThemedText type="defaultSemiBold" style={[styles.groupName, { color: colors.text }]}>
                        {g.name}
                      </ThemedText>
                      <View style={[styles.badge, { backgroundColor: g.is_public ? colors.tint + '20' : colors.textMuted + '20' }]}>
                        <ThemedText style={[styles.badgeText, { color: g.is_public ? colors.tint : colors.textMuted }]}>
                          {g.is_public ? 'Public' : 'Private'}
                        </ThemedText>
                      </View>
                    </View>
                    {g.description ? (
                      <ThemedText style={[styles.groupDesc, { color: colors.textMuted }]} numberOfLines={2}>
                        {g.description}
                      </ThemedText>
                    ) : null}
                    <ThemedText style={[styles.memberCount, { color: colors.textMuted }]}>
                      {g.member_count ?? 0} member{(g.member_count ?? 0) !== 1 ? 's' : ''}
                    </ThemedText>
                  </View>
                  <View style={styles.groupActions}>
                    {g.created_by === userId && (
                      <Pressable
                        style={[styles.deleteButton, { borderColor: '#ef4444' }]}
                        onPress={() => handleDelete(g)}
                        disabled={actingId === g.id}
                      >
                        <ThemedText style={[styles.deleteButtonText, { color: '#ef4444' }]}>Delete</ThemedText>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.leaveButton, { borderColor: colors.tabBarBorder }]}
                      onPress={() => handleLeave(g)}
                      disabled={actingId === g.id}
                    >
                      <ThemedText style={[styles.leaveButtonText, { color: colors.textMuted }]}>Leave</ThemedText>
                    </Pressable>
                  </View>
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
  sectionTitle: { marginBottom: 8 },
  sectionHint: { fontSize: 14, marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  searchButton: { paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontWeight: '600' },
  noResults: { fontSize: 14, marginTop: 4 },
  joinedLabel: { fontSize: 14, fontWeight: '600', marginLeft: 12 },
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
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { fontSize: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  groupDesc: { fontSize: 14, marginTop: 4 },
  memberCount: { fontSize: 13, marginTop: 4 },
  groupActions: { gap: 8, marginLeft: 12 },
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
  },
  leaveButtonText: { fontSize: 14 },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  deleteButtonText: { fontSize: 14, fontWeight: '600' },
})
