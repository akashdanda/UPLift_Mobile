import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { type Href, router } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
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

  const renderGroupCard = (
    g: GroupWithMeta & { _joined?: boolean },
    mode: 'my' | 'discover' | 'search'
  ) => (
    <View key={g.id} style={[styles.groupCard, { backgroundColor: colors.card }]}>
      {/* Group icon */}
      <View style={[styles.groupIcon, { backgroundColor: colors.tint + '15' }]}>
        <Ionicons name="people" size={20} color={colors.tint} />
      </View>

      <View style={styles.groupCardMain}>
        <View style={styles.groupNameRow}>
          <ThemedText type="defaultSemiBold" style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
            {g.name}
          </ThemedText>
          {mode === 'my' && (
            <View style={[styles.badge, { backgroundColor: g.is_public ? colors.tint + '18' : colors.textMuted + '18' }]}>
              <ThemedText style={[styles.badgeText, { color: g.is_public ? colors.tint : colors.textMuted }]}>
                {g.is_public ? 'Public' : 'Private'}
              </ThemedText>
            </View>
          )}
        </View>
        {g.description ? (
          <ThemedText style={[styles.groupDesc, { color: colors.textMuted }]} numberOfLines={1}>
            {g.description}
          </ThemedText>
        ) : null}
        <ThemedText style={[styles.memberCount, { color: colors.textMuted }]}>
          {(g.member_count ?? 0) > 0
            ? `${g.member_count} member${(g.member_count ?? 0) !== 1 ? 's' : ''}`
            : 'Be the first to join'}
        </ThemedText>
      </View>

      {/* Actions */}
      <View style={styles.groupActions}>
        {mode === 'my' && (
          <>
            {g.created_by === userId && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation()
                  handleDelete(g)
                }}
                disabled={actingId === g.id}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </Pressable>
            )}
            <Pressable
              style={[styles.leaveButton, { backgroundColor: colors.cardElevated }]}
              onPress={(e) => {
                e.stopPropagation()
                handleLeave(g)
              }}
              disabled={actingId === g.id}
            >
              <ThemedText style={[styles.leaveButtonText, { color: colors.textMuted }]}>Leave</ThemedText>
            </Pressable>
          </>
        )}
        {mode === 'discover' && (
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
        )}
        {mode === 'search' && (
          g._joined ? (
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
          )
        )}
      </View>
    </View>
  )

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="title" style={styles.title}>
              Groups
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>
              Train together, stay accountable
            </ThemedText>
          </View>
          <Pressable
            style={[styles.createButton, { backgroundColor: colors.tint }]}
            onPress={() => router.push('/create-group')}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search groups"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text)
              if (!text.trim()) setSearchResults([])
            }}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>

        {searching && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.tint} />
          </View>
        )}
        {searchResults.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Search results
            </ThemedText>
            <View style={styles.list}>
              {searchResults.map((g) => renderGroupCard(g, 'search'))}
            </View>
          </View>
        )}
        {!searching && searchQuery.trim() !== '' && searchResults.length === 0 && (
          <ThemedText style={[styles.noResults, { color: colors.textMuted }]}>
            No public groups found matching &quot;{searchQuery.trim()}&quot;
          </ThemedText>
        )}

        {/* Your groups */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Your groups
          </ThemedText>
          {loading && myGroups.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : myGroups.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardElevated }]}>
              <Ionicons name="people-outline" size={28} color={colors.textMuted + '60'} style={{ marginBottom: 8 }} />
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                You haven&apos;t joined any groups yet
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {myGroups.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => router.push(`/group-detail?id=${g.id}` as Href)}
                >
                  {renderGroupCard(g, 'my')}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Discover */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Discover
          </ThemedText>
          {loading && discoverGroups.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : discoverGroups.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardElevated }]}>
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                No more public groups to discover
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {discoverGroups.map((g) => renderGroupCard(g, 'discover'))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 2 },
  subtitle: { fontSize: 14 },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 20,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },

  noResults: { fontSize: 14, marginBottom: 16 },

  // Sections
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },

  // Loading / empty
  loadingRow: { paddingVertical: 20, alignItems: 'center' },
  emptyCard: {
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
  },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 22 },

  // Group card
  list: { gap: 10 },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupCardMain: { flex: 1, minWidth: 0 },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { fontSize: 15, flexShrink: 1 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  groupDesc: { fontSize: 13, marginTop: 2 },
  memberCount: { fontSize: 12, marginTop: 3, opacity: 0.7 },
  groupActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 10 },

  // Buttons
  joinButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  joinButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  joinedLabel: { fontSize: 13, fontWeight: '600' },
  leaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  leaveButtonText: { fontSize: 12 },
})
