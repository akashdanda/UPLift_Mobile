import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { BrandViolet, Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getBuddySuggestions, type BuddySuggestion } from '@/lib/buddy-matching'
import { getUserDuels } from '@/lib/duels'
import type { DuelWithProfiles } from '@/types/duel'
import {
  getNormalizedContactPhoneNumbers,
  matchProfilesByPhoneNumbers,
  requestContactsPermission,
} from '@/lib/contact-sync'
import {
  acceptFriendRequest,
  getFriends,
  getFriendshipStatus,
  getMutualFriendSuggestions,
  getPendingReceived,
  removeFriendship,
  searchProfiles,
  sendFriendRequest,
  type MutualFriendSuggestion,
} from '@/lib/friends'
import type { FriendWithProfile } from '@/lib/friends'
import type { ProfilePublic } from '@/types/friendship'

const { width: SCREEN_W } = Dimensions.get('window')
const SUGGESTION_CARD_W = 130

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  return '?'
}

export default function FriendsScreen() {
  const { session, refreshProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'

  const [friends, setFriends] = useState<FriendWithProfile[]>([])
  const [pending, setPending] = useState<{ friendship: { id: string }; requester: ProfilePublic }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfilePublic[]>([])
  const [searchStatus, setSearchStatus] = useState<Record<string, 'none' | 'pending_sent' | 'pending_received' | 'friends'>>({})
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [buddySuggestions, setBuddySuggestions] = useState<BuddySuggestion[]>([])
  const [mutualSuggestions, setMutualSuggestions] = useState<MutualFriendSuggestion[]>([])
  const [activeDuels, setActiveDuels] = useState<DuelWithProfiles[]>([])
  const [activeTab, setActiveTab] = useState<'friends' | 'challenges'>('friends')
  const [contactMatches, setContactMatches] = useState<ProfilePublic[]>([])
  const [contactSyncing, setContactSyncing] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const userId = session?.user?.id ?? ''

  const load = useCallback(() => {
    if (!userId) return
    setLoading(true)
    Promise.all([getFriends(userId), getPendingReceived(userId)])
      .then(([f, p]) => {
        setFriends(f)
        setPending(p)
      })
      .finally(() => setLoading(false))
    getMutualFriendSuggestions(userId, 30)
      .then(async (suggestions) => {
        setMutualSuggestions(suggestions)
        if (suggestions.length > 0) {
          const statuses = await Promise.all(
            suggestions.map((s) => getFriendshipStatus(userId, s.id))
          )
          setSearchStatus((prev) => {
            const next = { ...prev }
            suggestions.forEach((s, i) => {
              next[s.id] = statuses[i]
            })
            return next
          })
        }
      })
      .catch(() => {})
    getBuddySuggestions(userId, 5)
      .then(async (buddies) => {
        setBuddySuggestions(buddies)
        if (buddies.length > 0) {
          const statuses = await Promise.all(
            buddies.map((b) => getFriendshipStatus(userId, b.id))
          )
          setSearchStatus((prev) => {
            const next = { ...prev }
            buddies.forEach((b, i) => {
              next[b.id] = statuses[i]
            })
            return next
          })
        }
      })
      .catch(() => {})
    getUserDuels(userId, ['active', 'pending']).then(setActiveDuels).catch(() => {})
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q || !userId) return
    setSearching(true)
    searchProfiles(q, userId)
      .then(async (results) => {
        setSearchResults(results)
        const statuses = await Promise.all(results.map((p) => getFriendshipStatus(userId, p.id)))
        const next: Record<string, 'none' | 'pending_sent' | 'pending_received' | 'friends'> = {}
        results.forEach((p, i) => {
          next[p.id] = statuses[i]
        })
        setSearchStatus((prev) => ({ ...prev, ...next }))
      })
      .catch(() => {})
      .finally(() => setSearching(false))
  }, [searchQuery, userId])

  const handleAddFriend = async (addresseeId: string) => {
    if (!userId) return
    setActingId(addresseeId)
    const { error } = await sendFriendRequest(userId, addresseeId)
    setActingId(null)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setSearchStatus((prev) => ({ ...prev, [addresseeId]: 'pending_sent' }))
      load()
      void refreshProfile()
    }
  }

  const handleAccept = async (friendshipId: string) => {
    if (!userId) return
    setActingId(friendshipId)
    const { error } = await acceptFriendRequest(friendshipId, userId)
    setActingId(null)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      load()
      void refreshProfile()
    }
  }

  const handleDecline = async (friendshipId: string) => {
    if (!userId) return
    setActingId(friendshipId)
    const { error } = await removeFriendship(friendshipId, userId)
    setActingId(null)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      load()
      void refreshProfile()
    }
  }

  const handleSyncContacts = useCallback(async () => {
    if (!userId) return
    if (Platform.OS === 'web') {
      Alert.alert('Contacts', 'Contact sync is available on iOS and Android.')
      return
    }
    setContactSyncing(true)
    try {
      const granted = await requestContactsPermission()
      if (!granted) {
        Alert.alert('Contacts', 'Allow Uplift to access contacts to find friends who are on the app.')
        return
      }
      const phones = await getNormalizedContactPhoneNumbers()
      if (phones.length === 0) {
        Alert.alert('Contacts', 'No phone numbers found in your contacts.')
        setContactMatches([])
        return
      }
      const matches = await matchProfilesByPhoneNumbers(userId, phones)
      const friendIds = new Set(friends.map((f) => f.id))
      const filtered = matches.filter((m) => !friendIds.has(m.id))
      setContactMatches(filtered)
      if (filtered.length > 0) {
        const statuses = await Promise.all(filtered.map((p) => getFriendshipStatus(userId, p.id)))
        setSearchStatus((prev) => {
          const next = { ...prev }
          filtered.forEach((p, i) => {
            next[p.id] = statuses[i]
          })
          return next
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not sync contacts'
      Alert.alert('Error', msg)
    } finally {
      setContactSyncing(false)
    }
  }, [userId, friends])

  const handleUnfriend = (friend: FriendWithProfile) => {
    Alert.alert('Remove friend', `Remove ${friend.display_name || 'this user'} from friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setActingId(friend.id)
          const { error } = await removeFriendship(friend.friendship_id, userId)
          setActingId(null)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            load()
            void refreshProfile()
          }
        },
      },
    ])
  }

  const allSuggestions = [
    ...mutualSuggestions.filter((s) => (searchStatus[s.id] ?? 'none') === 'none'),
    ...buddySuggestions.filter((b) =>
      (searchStatus[b.id] ?? 'none') === 'none' &&
      !mutualSuggestions.some((m) => m.id === b.id)
    ),
  ].slice(0, 15)

  if (!session) return null

  // ─── Render helpers ───

  const renderAddButton = (id: string) => {
    const status = searchStatus[id] ?? 'none'
    if (status === 'none') {
      return (
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.tint }]}
          onPress={() => handleAddFriend(id)}
          disabled={actingId === id}
        >
          {actingId === id ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="person-add" size={14} color="#fff" />
          )}
        </Pressable>
      )
    }
    if (status === 'pending_sent') {
      return (
        <View style={[styles.statusChip, { borderColor: colors.textMuted }]}>
          <ThemedText style={[styles.statusChipText, { color: colors.textMuted }]}>Sent</ThemedText>
        </View>
      )
    }
    if (status === 'friends') {
      return (
        <View style={[styles.statusChip, { borderColor: colors.tint }]}>
          <Ionicons name="checkmark" size={14} color={colors.tint} />
        </View>
      )
    }
    return null
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
        <View style={{ width: 36 }} />
        <ThemedText type="title" style={[styles.headerTitle, { color: colors.text }]}>
          Friends
        </ThemedText>
        <Pressable onPress={() => setShowSearch((v) => !v)} hitSlop={12}>
          <Ionicons name={showSearch ? 'close' : 'search'} size={22} color={colors.text} />
        </Pressable>
      </View>

      {/* Search bar (collapsible) */}
      {showSearch && (
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
          <View style={styles.searchInputRow}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoFocus
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]) }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          {searching && <ActivityIndicator size="small" color={colors.tint} style={{ marginTop: 8 }} />}
          {searchResults.length > 0 && (
            <View style={styles.searchResults}>
              {searchResults.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.searchResultRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
                  onPress={() => { setShowSearch(false); router.push(`/friend-profile?id=${p.id}`) }}
                >
                  <View style={[styles.avatarSm, { backgroundColor: colors.tint + '25' }]}>
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={styles.avatarSmImg} />
                    ) : (
                      <ThemedText style={[styles.avatarInit, { color: colors.tint }]}>{getInitials(p.display_name)}</ThemedText>
                    )}
                  </View>
                  <View style={styles.rowInfo}>
                    <ThemedText style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{p.display_name || 'No name'}</ThemedText>
                    <ThemedText style={[styles.rowMeta, { color: colors.textMuted }]}>{p.workouts_count} workouts</ThemedText>
                  </View>
                  {renderAddButton(p.id)}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
        {(['friends', 'challenges'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.tint, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <ThemedText style={[styles.tabText, { color: activeTab === tab ? colors.tint : colors.textMuted }]}>
              {tab === 'friends' ? 'Friends' : 'Challenges'}
            </ThemedText>
            {tab === 'friends' && pending.length > 0 && (
              <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
                <ThemedText style={styles.badgeText}>{pending.length}</ThemedText>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {activeTab === 'friends' ? (
          <>
            {/* ── Pending Requests Banner ── */}
            {pending.length > 0 && (
              <View style={[styles.pendingSection, { backgroundColor: colors.card }]}>
                <View style={styles.pendingSectionHeader}>
                  <Ionicons name="person-add" size={18} color={colors.tint} />
                  <ThemedText style={[styles.pendingSectionTitle, { color: colors.text }]}>
                    Friend requests
                  </ThemedText>
                  <View style={[styles.pendingCount, { backgroundColor: colors.tint }]}>
                    <ThemedText style={styles.pendingCountText}>{pending.length}</ThemedText>
                  </View>
                </View>
                {pending.map(({ friendship, requester }) => (
                  <View key={friendship.id} style={[styles.pendingRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                    <Pressable
                      style={[styles.avatarSm, { backgroundColor: colors.tint + '25' }]}
                      onPress={() => router.push(`/friend-profile?id=${requester.id}`)}
                    >
                      {requester.avatar_url ? (
                        <Image source={{ uri: requester.avatar_url }} style={styles.avatarSmImg} />
                      ) : (
                        <ThemedText style={[styles.avatarInit, { color: colors.tint }]}>{getInitials(requester.display_name)}</ThemedText>
                      )}
                    </Pressable>
                    <View style={styles.rowInfo}>
                      <ThemedText style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{requester.display_name || 'No name'}</ThemedText>
                    </View>
                    <View style={styles.pendingActions}>
                      <Pressable
                        style={[styles.acceptBtn, { backgroundColor: colors.tint }]}
                        onPress={() => handleAccept(friendship.id)}
                        disabled={actingId === friendship.id}
                      >
                        {actingId === friendship.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <ThemedText style={styles.acceptBtnText}>Accept</ThemedText>
                        )}
                      </Pressable>
                      <Pressable
                        style={[styles.declineBtn, {  }]}
                        onPress={() => handleDecline(friendship.id)}
                      >
                        <Ionicons name="close" size={16} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── Suggestions (horizontal scroll) ── */}
            {allSuggestions.length > 0 && (
              <View style={styles.suggestionsSection}>
                <View style={styles.sectionHeader}>
                  <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>Suggested</ThemedText>
                  {Platform.OS !== 'web' && (
                    <Pressable onPress={handleSyncContacts} disabled={contactSyncing} style={styles.syncLink}>
                      {contactSyncing ? (
                        <ActivityIndicator size="small" color={colors.tint} />
                      ) : (
                        <>
                          <Ionicons name="people-outline" size={14} color={colors.tint} />
                          <ThemedText style={[styles.syncLinkText, { color: colors.tint }]}>Sync contacts</ThemedText>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsRow}>
                  {/* Contact matches first */}
                  {contactMatches.map((p) => (
                    <Pressable
                      key={`c-${p.id}`}
                      style={[styles.suggestionCard, { backgroundColor: colors.card }]}
                      onPress={() => router.push(`/friend-profile?id=${p.id}`)}
                    >
                      <View style={[styles.suggestionAvatar, { backgroundColor: colors.tint + '20' }]}>
                        {p.avatar_url ? (
                          <Image source={{ uri: p.avatar_url }} style={styles.suggestionAvatarImg} />
                        ) : (
                          <ThemedText style={[styles.suggestionAvatarInit, { color: colors.tint }]}>{getInitials(p.display_name)}</ThemedText>
                        )}
                        <View style={[styles.contactBadge, { backgroundColor: '#22C55E' }]}>
                          <Ionicons name="call" size={8} color="#fff" />
                        </View>
                      </View>
                      <ThemedText style={[styles.suggestionName, { color: colors.text }]} numberOfLines={1}>{p.display_name || 'User'}</ThemedText>
                      <ThemedText style={[styles.suggestionMeta, { color: colors.textMuted }]}>In contacts</ThemedText>
                      {renderAddButton(p.id)}
                    </Pressable>
                  ))}
                  {/* Mutual + buddy suggestions */}
                  {allSuggestions.map((s) => {
                    const mutualData = 'mutual_count' in s ? (s as MutualFriendSuggestion) : null
                    const buddyData = 'reason' in s ? (s as BuddySuggestion) : null
                    const meta = mutualData && mutualData.mutual_count > 0
                      ? `${mutualData.mutual_count} mutual${mutualData.mutual_count > 1 ? 's' : ''}`
                      : buddyData?.reason || `${s.workouts_count} workouts`
                    return (
                      <Pressable
                        key={s.id}
                        style={[styles.suggestionCard, { backgroundColor: colors.card }]}
                        onPress={() => router.push(`/friend-profile?id=${s.id}`)}
                      >
                        <View style={[styles.suggestionAvatar, { backgroundColor: colors.tint + '20' }]}>
                          {s.avatar_url ? (
                            <Image source={{ uri: s.avatar_url }} style={styles.suggestionAvatarImg} />
                          ) : (
                            <ThemedText style={[styles.suggestionAvatarInit, { color: colors.tint }]}>{getInitials(s.display_name)}</ThemedText>
                          )}
                        </View>
                        <ThemedText style={[styles.suggestionName, { color: colors.text }]} numberOfLines={1}>{s.display_name || 'Athlete'}</ThemedText>
                        <ThemedText style={[styles.suggestionMeta, { color: colors.textMuted }]} numberOfLines={1}>{meta}</ThemedText>
                        {renderAddButton(s.id)}
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Friends List ── */}
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
                Your friends
              </ThemedText>
              <ThemedText style={[styles.friendCount, { color: colors.textMuted }]}>{friends.length}</ThemedText>
            </View>

            {loading && friends.length === 0 ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color={colors.tint} />
              </View>
            ) : friends.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="people-outline" size={40} color={colors.textMuted} style={{ marginBottom: 12 }} />
                <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No friends yet</ThemedText>
                <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  Tap the search icon above to find people
                </ThemedText>
              </View>
            ) : (
              <View style={[styles.friendsList, { backgroundColor: colors.card }]}>
                {friends.map((friend, i) => (
                  <Pressable
                    key={friend.id}
                    style={[
                      styles.friendRow,
                      i < friends.length - 1 && { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderBottomWidth: 1 },
                    ]}
                    onPress={() => router.push(`/friend-profile?id=${friend.id}`)}
                    onLongPress={() => handleUnfriend(friend)}
                  >
                    <View style={[styles.avatarSm, { backgroundColor: colors.tint + '25' }]}>
                      {friend.avatar_url ? (
                        <Image source={{ uri: friend.avatar_url }} style={styles.avatarSmImg} />
                      ) : (
                        <ThemedText style={[styles.avatarInit, { color: colors.tint }]}>{getInitials(friend.display_name)}</ThemedText>
                      )}
                    </View>
                    <View style={styles.rowInfo}>
                      <ThemedText style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{friend.display_name || 'No name'}</ThemedText>
                      <ThemedText style={[styles.rowMeta, { color: colors.textMuted }]}>{friend.workouts_count} workouts</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {/* ── Challenges Tab ── */}
            <Pressable
              style={({ pressed }) => [styles.challengeBtn, { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push('/create-duel')}
            >
              <Ionicons name="flash" size={18} color="#fff" />
              <ThemedText style={styles.challengeBtnText}>Start a 1v1 Challenge</ThemedText>
            </Pressable>

            {activeDuels.length > 0 ? (
              <View style={[styles.friendsList, { backgroundColor: colors.card }]}>
                {activeDuels.map((duel, i) => {
                  const iAmChallenger = duel.challenger_id === userId
                  const opName = iAmChallenger ? duel.opponent_display_name : duel.challenger_display_name
                  const opAvatar = iAmChallenger ? duel.opponent_avatar_url : duel.challenger_avatar_url
                  const myScore = iAmChallenger ? duel.challenger_score : duel.opponent_score
                  const theirScore = iAmChallenger ? duel.opponent_score : duel.challenger_score
                  return (
                    <Pressable
                      key={duel.id}
                      style={[
                        styles.friendRow,
                        i < activeDuels.length - 1 && { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderBottomWidth: 1 },
                      ]}
                      onPress={() => router.push(`/duel-detail?id=${duel.id}`)}
                    >
                      <View style={[styles.avatarSm, { backgroundColor: colors.tint + '25' }]}>
                        {opAvatar ? (
                          <Image source={{ uri: opAvatar }} style={styles.avatarSmImg} />
                        ) : (
                          <ThemedText style={[styles.avatarInit, { color: colors.tint }]}>{getInitials(opName)}</ThemedText>
                        )}
                      </View>
                      <View style={styles.rowInfo}>
                        <ThemedText style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>vs {opName || 'Opponent'}</ThemedText>
                        <ThemedText style={[styles.rowMeta, { color: colors.textMuted }]}>
                          {duel.status === 'pending'
                            ? duel.opponent_id === userId ? 'Waiting for your response' : 'Waiting for response…'
                            : `${myScore} - ${theirScore} • ${duel.type === 'workout_count' ? 'Workouts' : 'Streak'}`}
                        </ThemedText>
                      </View>
                      <View style={[styles.duelChip, { backgroundColor: (duel.status === 'pending' ? '#EAB308' : colors.tint) + '20' }]}>
                        <ThemedText style={[styles.duelChipText, { color: duel.status === 'pending' ? '#EAB308' : colors.tint }]}>
                          {duel.status === 'pending' ? 'Pending' : 'Active'}
                        </ThemedText>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ) : (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="flash-outline" size={40} color={colors.textMuted} style={{ marginBottom: 12 }} />
                <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No active challenges</ThemedText>
                <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}>Start one above!</ThemedText>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },

  // Search
  searchBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  searchResults: {
    marginTop: 8,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  // Pending
  pendingSection: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  pendingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pendingSectionTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  pendingCount: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pendingCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pendingActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  declineBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Suggestions
  suggestionsSection: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  friendCount: { fontSize: 15, fontWeight: '600' },
  syncLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncLinkText: { fontSize: 12, fontWeight: '600' },
  suggestionsRow: { paddingRight: 4, gap: 10 },
  suggestionCard: {
    width: SUGGESTION_CARD_W,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  suggestionAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  suggestionAvatarImg: { width: 52, height: 52 },
  suggestionAvatarInit: { fontSize: 17, fontWeight: '700' },
  contactBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  suggestionName: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  suggestionMeta: { fontSize: 11, textAlign: 'center' },

  // Add / status
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: BrandViolet.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusChipText: { fontSize: 11, fontWeight: '600' },

  // Friends list
  friendsList: { borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },

  // Shared row elements
  avatarSm: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
    flexShrink: 0,
  },
  avatarSmImg: { width: 42, height: 42 },
  avatarInit: { fontSize: 14, fontWeight: '700' },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
  rowMeta: { fontSize: 12, marginTop: 2, fontWeight: '500' },

  // Empty state
  centered: { paddingVertical: 16, alignItems: 'center' },
  emptyState: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptySubtitle: { fontSize: 13, textAlign: 'center' },

  // Challenges
  challengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
    shadowColor: BrandViolet.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  challengeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  duelChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  duelChipText: { fontSize: 12, fontWeight: '600' },
})
