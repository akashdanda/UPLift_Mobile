import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { type Href, router } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  getDiscoverGroups,
  getMyGroups,
  joinGroup,
  searchGroups,
  type GroupWithMeta,
} from '@/lib/groups'

const SCREEN_WIDTH = Dimensions.get('window').width
const CARD_GAP = 12
const CARD_PADDING = 20
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - CARD_GAP) / 2

type Tab = 'my' | 'discover'

function getGroupInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function GroupsScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { session, refreshProfile } = useAuthContext()

  const [activeTab, setActiveTab] = useState<Tab>('my')
  const [myGroups, setMyGroups] = useState<GroupWithMeta[]>([])
  const [discoverGroups, setDiscoverGroups] = useState<GroupWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<(GroupWithMeta & { _joined?: boolean })[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

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

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

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

  const renderGroupGridCard = (g: GroupWithMeta & { _joined?: boolean }, showJoin = false) => (
    <Pressable
      key={g.id}
      style={[styles.gridCard, { backgroundColor: colors.card }]}
      onPress={() => router.push(`/group-detail?id=${g.id}` as Href)}
    >
      {/* Group Avatar */}
      <View style={styles.gridAvatarWrap}>
        {g.avatar_url ? (
          <Image source={{ uri: g.avatar_url }} style={styles.gridAvatar} />
        ) : (
          <View style={[styles.gridAvatarPlaceholder, { backgroundColor: colors.tint + '20' }]}>
            <ThemedText style={[styles.gridAvatarText, { color: colors.tint }]}>
              {getGroupInitials(g.name)}
            </ThemedText>
          </View>
        )}
      </View>

      {/* Group Info */}
      <ThemedText type="defaultSemiBold" style={[styles.gridName, { color: colors.text }]} numberOfLines={2}>
        {g.name}
      </ThemedText>

      {/* Tags */}
      {g.tags && g.tags.length > 0 && (
        <View style={styles.gridTagsRow}>
          <ThemedText style={[styles.gridTag, { color: colors.textMuted }]} numberOfLines={1}>
            {g.tags.join(' · ')}
          </ThemedText>
        </View>
      )}

      {/* Member count + visibility */}
      <ThemedText style={[styles.gridMeta, { color: colors.textMuted }]}>
        {g.member_count ?? 0} Member{(g.member_count ?? 0) !== 1 ? 's' : ''}
      </ThemedText>
      <View style={styles.gridBottomRow}>
        <View style={[styles.visibilityBadge, { backgroundColor: g.is_public ? colors.tint + '18' : colors.textMuted + '18' }]}>
          <Ionicons
            name={g.is_public ? 'globe-outline' : 'lock-closed-outline'}
            size={11}
            color={g.is_public ? colors.tint : colors.textMuted}
          />
          <ThemedText style={[styles.visibilityText, { color: g.is_public ? colors.tint : colors.textMuted }]}>
            {g.is_public ? 'Public' : 'Private'}
          </ThemedText>
        </View>
      </View>

      {/* Join button */}
      {showJoin && !g._joined && (
        <Pressable
          style={[styles.gridJoinBtn, { backgroundColor: colors.tint }]}
          onPress={(e) => {
            e.stopPropagation()
            handleJoin(g.id)
          }}
          disabled={actingId === g.id}
        >
          {actingId === g.id ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <ThemedText style={styles.gridJoinBtnText}>Join</ThemedText>
          )}
        </Pressable>
      )}
      {showJoin && g._joined && (
        <View style={[styles.gridJoinBtn, { backgroundColor: colors.cardElevated }]}>
          <ThemedText style={[styles.gridJoinBtnText, { color: colors.tint }]}>Joined</ThemedText>
        </View>
      )}
    </Pressable>
  )

  const renderMyGroupRow = (g: GroupWithMeta) => (
    <Pressable
      key={g.id}
      style={[styles.myGroupRow, { backgroundColor: colors.card }]}
      onPress={() => router.push(`/group-detail?id=${g.id}` as Href)}
    >
      {g.avatar_url ? (
        <Image source={{ uri: g.avatar_url }} style={styles.myGroupAvatar} />
      ) : (
        <View style={[styles.myGroupAvatarPlaceholder, { backgroundColor: colors.tint + '20' }]}>
          <ThemedText style={[styles.myGroupAvatarText, { color: colors.tint }]}>
            {getGroupInitials(g.name)}
          </ThemedText>
        </View>
      )}
      <View style={styles.myGroupInfo}>
        <ThemedText type="defaultSemiBold" style={[styles.myGroupName, { color: colors.text }]} numberOfLines={1}>
          {g.name}
        </ThemedText>
        <ThemedText style={[styles.myGroupMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {g.member_count ?? 0} member{(g.member_count ?? 0) !== 1 ? 's' : ''}
          {g.tags && g.tags.length > 0 ? ` · ${g.tags[0]}` : ''}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  )

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.tabBarBorder }]}>
        <Pressable onPress={() => setShowSearch(!showSearch)} hitSlop={8}>
          <Ionicons name="search" size={24} color={colors.text} />
        </Pressable>
        <ThemedText type="title" style={[styles.topBarTitle, { color: colors.text }]}>
          Groups
        </ThemedText>
        <Pressable onPress={() => router.push('/create-group')} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={26} color={colors.text} />
        </Pressable>
      </View>

      {/* Search bar (toggled) */}
      {showSearch && (
        <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.searchRow, { backgroundColor: colors.card }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search groups..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text)
                if (!text.trim()) setSearchResults([])
              }}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoFocus
            />
            {searchQuery.trim() !== '' && (
              <Pressable
                onPress={() => {
                  setSearchQuery('')
                  setSearchResults([])
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.tabBarBorder }]}>
        {(['my', 'discover'] as Tab[]).map((tab) => {
          const active = activeTab === tab
          const label = tab === 'my' ? 'My Groups' : 'Discover'
          return (
            <Pressable
              key={tab}
              style={[styles.tab, active && [styles.tabActive, { borderBottomColor: colors.tint }]]}
              onPress={() => setActiveTab(tab)}
            >
              <ThemedText
                style={[
                  styles.tabLabel,
                  { color: active ? colors.tint : colors.textMuted },
                  active && styles.tabLabelActive,
                ]}
              >
                {label}
              </ThemedText>
            </Pressable>
          )
        })}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search results */}
        {showSearch && searchQuery.trim() !== '' && (
          <View style={styles.section}>
            {searching ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.tint} />
              </View>
            ) : searchResults.length === 0 ? (
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                No groups found matching &quot;{searchQuery.trim()}&quot;
              </ThemedText>
            ) : (
              <>
                <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
                  Search Results
                </ThemedText>
                <View style={styles.grid}>
                  {searchResults.map((g) => renderGroupGridCard(g, true))}
                </View>
              </>
            )}
          </View>
        )}

        {/* My Groups tab */}
        {activeTab === 'my' && !showSearch && (
          <View style={styles.section}>
            {loading && myGroups.length === 0 ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="large" color={colors.tint} />
              </View>
            ) : myGroups.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                <Ionicons name="people-outline" size={40} color={colors.textMuted + '50'} style={{ marginBottom: 12 }} />
                <ThemedText type="defaultSemiBold" style={[styles.emptyTitle, { color: colors.text }]}>
                  No groups yet
                </ThemedText>
                <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                  Join a group or create your own to get started
                </ThemedText>
                <Pressable
                  style={[styles.emptyCreateBtn, { backgroundColor: colors.tint }]}
                  onPress={() => router.push('/create-group')}
                >
                  <ThemedText style={styles.emptyCreateBtnText}>Create Group</ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={styles.myGroupsList}>
                {myGroups.map(renderMyGroupRow)}
              </View>
            )}
          </View>
        )}

        {/* Discover tab */}
        {activeTab === 'discover' && !showSearch && (
          <View style={styles.section}>
            <View style={styles.discoverHeader}>
              <Ionicons name="compass-outline" size={20} color={colors.text} />
              <ThemedText type="subtitle" style={[styles.discoverTitle, { color: colors.text }]}>
                Popular Groups
              </ThemedText>
            </View>
            {loading && discoverGroups.length === 0 ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="large" color={colors.tint} />
              </View>
            ) : discoverGroups.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                  No more groups to discover
                </ThemedText>
              </View>
            ) : (
              <View style={styles.grid}>
                {discoverGroups.map((g) => renderGroupGridCard(g, true))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

  // Search
  searchContainer: { paddingHorizontal: 20, paddingVertical: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0, letterSpacing: 0.1 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {},
  tabLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  tabLabelActive: { fontWeight: '800' },

  // Sections
  section: { padding: CARD_PADDING },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 16, letterSpacing: -0.2, textTransform: 'uppercase' },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  gridCard: {
    width: CARD_WIDTH,
    borderRadius: 16,
    padding: 14,
    overflow: 'hidden',
  },
  gridAvatarWrap: { marginBottom: 12 },
  gridAvatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  gridAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridAvatarText: { fontSize: 20, fontWeight: '800' },
  gridName: { fontSize: 14, fontWeight: '700', lineHeight: 19, marginBottom: 4, letterSpacing: 0.1 },
  gridTagsRow: { marginBottom: 2 },
  gridTag: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  gridMeta: { fontSize: 11, marginBottom: 4, letterSpacing: 0.1 },
  gridBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  visibilityText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  gridJoinBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  gridJoinBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },

  // My groups list
  myGroupsList: { gap: 8 },
  myGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
  },
  myGroupAvatar: {
    width: 50,
    height: 50,
    borderRadius: 14,
    marginRight: 14,
  },
  myGroupAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  myGroupAvatarText: { fontSize: 18, fontWeight: '800' },
  myGroupInfo: { flex: 1, minWidth: 0 },
  myGroupName: { fontSize: 15, fontWeight: '700', marginBottom: 2, letterSpacing: 0.1 },
  myGroupMeta: { fontSize: 12, fontWeight: '500', letterSpacing: 0.1 },

  // Discover header
  discoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  discoverTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, textTransform: 'uppercase' },

  // Loading / empty
  loadingRow: { paddingVertical: 40, alignItems: 'center' },
  emptyCard: {
    padding: 36,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, letterSpacing: -0.2 },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 20, marginBottom: 20, letterSpacing: 0.1 },
  emptyCreateBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCreateBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
})
