import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { getBuddySuggestions, type BuddySuggestion } from '@/lib/buddy-matching'
import { getUserDuels } from '@/lib/duels'
import type { DuelWithProfiles } from '@/types/duel'
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
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

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
    // Load suggestions & active duels
    getMutualFriendSuggestions(userId, 10).then(setMutualSuggestions).catch(() => {})
    getBuddySuggestions(userId, 5).then(setBuddySuggestions).catch(() => {})
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
        setSearchStatus(next)
      })
      .catch(() => {})
      .finally(() => setSearching(false))
  }, [searchQuery, userId])

  const handleAddFriend = async (addresseeId: string) => {
    if (!userId) return
    setActingId(addresseeId)
    const { error } = await sendFriendRequest(userId, addresseeId)
    setActingId(null)
    if (error) Alert.alert('Error', error.message)
    else {
      setSearchStatus((prev) => ({ ...prev, [addresseeId]: 'pending_sent' }))
      load()
    }
  }

  const handleAccept = async (friendshipId: string) => {
    if (!userId) return
    setActingId(friendshipId)
    const { error } = await acceptFriendRequest(friendshipId, userId)
    setActingId(null)
    if (error) Alert.alert('Error', error.message)
    else load()
  }

  const handleDecline = async (friendshipId: string) => {
    if (!userId) return
    setActingId(friendshipId)
    const { error } = await removeFriendship(friendshipId, userId)
    setActingId(null)
    if (error) Alert.alert('Error', error.message)
    else load()
  }

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
          if (error) Alert.alert('Error', error.message)
          else load()
        },
      },
    ])
  }

  if (!session) return null

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.tabBarBorder }]}>
        <View style={{ width: 28 }} />
        <ThemedText type="title" style={[styles.topBarTitle, { color: colors.text }]}>
          Friends
        </ThemedText>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Active Duels */}
        {activeDuels.length > 0 && (
          <>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              ⚔️ Active Challenges
            </ThemedText>
            <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
              {activeDuels.map((duel) => {
                const iAmChallenger = duel.challenger_id === userId
                const opName = iAmChallenger ? duel.opponent_display_name : duel.challenger_display_name
                const opAvatar = iAmChallenger ? duel.opponent_avatar_url : duel.challenger_avatar_url
                const myScore = iAmChallenger ? duel.challenger_score : duel.opponent_score
                const theirScore = iAmChallenger ? duel.opponent_score : duel.challenger_score
                return (
                  <Pressable
                    key={duel.id}
                    style={[styles.friendRow, { borderBottomColor: colors.tabBarBorder }]}
                    onPress={() => router.push(`/duel-detail?id=${duel.id}`)}
                  >
                    <View style={[styles.avatarSmall, { backgroundColor: colors.tint + '25' }]}>
                      {opAvatar ? (
                        <Image source={{ uri: opAvatar }} style={styles.avatarSmallImage} />
                      ) : (
                        <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
                          {getInitials(opName)}
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.resultInfo}>
                      <ThemedText style={[styles.resultName, { color: colors.text }]}>
                        vs {opName || 'Opponent'}
                      </ThemedText>
                      <ThemedText style={[styles.resultMeta, { color: colors.textMuted }]}>
                        {duel.status === 'pending'
                          ? (duel.opponent_id === userId ? 'Waiting for your response' : 'Waiting for response…')
                          : `${myScore} - ${theirScore} • ${duel.type === 'workout_count' ? 'Workouts' : 'Streak'}`}
                      </ThemedText>
                    </View>
                    <View style={[styles.duelStatusBadge, { backgroundColor: duel.status === 'pending' ? '#EAB308' + '20' : colors.tint + '20' }]}>
                      <ThemedText style={[styles.duelStatusText, { color: duel.status === 'pending' ? '#EAB308' : colors.tint }]}>
                        {duel.status === 'pending' ? 'Pending' : 'Active'}
                      </ThemedText>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </>
        )}

        {/* Challenge button */}
        <Pressable
          style={[styles.challengeMainBtn, { backgroundColor: colors.tint }]}
          onPress={() => router.push('/create-duel')}
        >
          <Ionicons name="flash" size={18} color="#fff" />
          <ThemedText style={styles.challengeMainBtnText}>⚔️ Start a 1v1 Challenge</ThemedText>
        </Pressable>

        {/* Add friend */}
        <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
          Add friend
        </ThemedText>
        <View style={styles.searchRow}>
          <TextInput
            style={[
              styles.searchInput,
              { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
            ]}
            placeholder="Search by display name"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <Pressable style={[styles.searchButton, { backgroundColor: colors.tint }]} onPress={handleSearch}>
            <ThemedText style={styles.searchButtonText}>Search</ThemedText>
          </Pressable>
        </View>
        {searching && (
          <View style={styles.centeredRow}>
            <ActivityIndicator size="small" color={colors.tint} />
          </View>
        )}
        {searchResults.length > 0 && (
          <View style={[styles.resultsCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            {searchResults.map((p) => {
              const status = searchStatus[p.id] ?? 'none'
              return (
                <View key={p.id} style={[styles.resultRow, { borderBottomColor: colors.tabBarBorder }]}>
                  <View style={[styles.avatarSmall, { backgroundColor: colors.tint + '25' }]}>
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={styles.avatarSmallImage} />
                    ) : (
                      <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
                        {getInitials(p.display_name)}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.resultInfo}>
                    <ThemedText style={[styles.resultName, { color: colors.text }]}>
                      {p.display_name || 'No name'}
                    </ThemedText>
                    <ThemedText style={[styles.resultMeta, { color: colors.textMuted }]}>
                      {p.workouts_count} workouts
                    </ThemedText>
                  </View>
                  {status === 'none' && (
                    <Pressable
                      style={[styles.addButton, { backgroundColor: colors.tint }]}
                      onPress={() => handleAddFriend(p.id)}
                      disabled={actingId === p.id}
                    >
                      {actingId === p.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <ThemedText style={styles.addButtonText}>Add</ThemedText>
                      )}
                    </Pressable>
                  )}
                  {status === 'pending_sent' && (
                    <ThemedText style={[styles.statusLabel, { color: colors.textMuted }]}>Pending</ThemedText>
                  )}
                  {status === 'friends' && (
                    <ThemedText style={[styles.statusLabel, { color: colors.tint }]}>Friends</ThemedText>
                  )}
                </View>
              )
            })}
          </View>
        )}

        {/* Pending requests */}
        <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
          Pending requests
        </ThemedText>
        {pending.length === 0 ? (
          <ThemedText style={[styles.emptyHint, { color: colors.textMuted }]}>No pending requests</ThemedText>
        ) : (
          <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            {pending.map(({ friendship, requester }) => (
              <View key={friendship.id} style={[styles.friendRow, { borderBottomColor: colors.tabBarBorder }]}>
                <View style={[styles.avatarSmall, { backgroundColor: colors.tint + '25' }]}>
                  {requester.avatar_url ? (
                    <Image source={{ uri: requester.avatar_url }} style={styles.avatarSmallImage} />
                  ) : (
                    <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
                      {getInitials(requester.display_name)}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.resultInfo}>
                  <ThemedText style={[styles.resultName, { color: colors.text }]}>
                    {requester.display_name || 'No name'}
                  </ThemedText>
                  <ThemedText style={[styles.resultMeta, { color: colors.textMuted }]}>Wants to be friends</ThemedText>
                </View>
                <View style={styles.pendingActions}>
                  <Pressable
                    style={[styles.acceptButton, { backgroundColor: colors.tint }]}
                    onPress={() => handleAccept(friendship.id)}
                    disabled={actingId === friendship.id}
                  >
                    {actingId === friendship.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <ThemedText style={styles.addButtonText}>Accept</ThemedText>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.declineButton, { borderColor: colors.tabBarBorder }]}
                    onPress={() => handleDecline(friendship.id)}
                    disabled={actingId === friendship.id}
                  >
                    <ThemedText style={[styles.declineButtonText, { color: colors.textMuted }]}>Decline</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Friends list */}
        <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
          Friends
        </ThemedText>
        {loading && friends.length === 0 ? (
          <View style={styles.centeredRow}>
            <ActivityIndicator size="small" color={colors.tint} />
          </View>
        ) : friends.length === 0 ? (
          <ThemedText style={[styles.emptyHint, { color: colors.textMuted }]}>
            No friends yet. Search by display name to add someone.
          </ThemedText>
        ) : (
          <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            {friends.map((friend) => (
              <Pressable
                key={friend.id}
                style={[styles.friendRow, { borderBottomColor: colors.tabBarBorder }]}
                onPress={() => router.push(`/friend-profile?id=${friend.id}`)}
              >
                <View style={[styles.avatarSmall, { backgroundColor: colors.tint + '25' }]}>
                  {friend.avatar_url ? (
                    <Image source={{ uri: friend.avatar_url }} style={styles.avatarSmallImage} />
                  ) : (
                    <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
                      {getInitials(friend.display_name)}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.resultInfo}>
                  <ThemedText style={[styles.resultName, { color: colors.text }]}>
                    {friend.display_name || 'No name'}
                  </ThemedText>
                  <ThemedText style={[styles.resultMeta, { color: colors.textMuted }]}>
                    {friend.workouts_count} workouts
                  </ThemedText>
                </View>
                <Pressable
                  style={[styles.removeButton, { borderColor: colors.tabBarBorder }]}
                  onPress={(e) => {
                    e.stopPropagation()
                    handleUnfriend(friend)
                  }}
                  disabled={actingId === friend.id}
                >
                  <ThemedText style={[styles.removeButtonText, { color: colors.textMuted }]}>Remove</ThemedText>
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}
        {/* Suggested Friends (Mutuals) */}
        {mutualSuggestions.length > 0 && (
          <>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              People you may know
            </ThemedText>
            <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
              {mutualSuggestions.map((suggestion) => {
                const status = searchStatus[suggestion.id] ?? 'none'
                const mutualText =
                  suggestion.mutual_count === 1
                    ? `${suggestion.mutual_names[0]} is a mutual`
                    : suggestion.mutual_count === 2
                      ? `${suggestion.mutual_names[0]} and ${suggestion.mutual_names[1]} are mutuals`
                      : `${suggestion.mutual_names[0]} and ${suggestion.mutual_count - 1} other mutual${suggestion.mutual_count - 1 > 1 ? 's' : ''}`
                return (
                  <View key={suggestion.id} style={[styles.friendRow, { borderBottomColor: colors.tabBarBorder }]}>
                    <Pressable
                      style={[styles.avatarSmall, { backgroundColor: colors.tint + '25' }]}
                      onPress={() => router.push(`/friend-profile?id=${suggestion.id}`)}
                    >
                      {suggestion.avatar_url ? (
                        <Image source={{ uri: suggestion.avatar_url }} style={styles.avatarSmallImage} />
                      ) : (
                        <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
                          {getInitials(suggestion.display_name)}
                        </ThemedText>
                      )}
                    </Pressable>
                    <View style={styles.resultInfo}>
                      <ThemedText style={[styles.resultName, { color: colors.text }]}>
                        {suggestion.display_name || 'Athlete'}
                      </ThemedText>
                      <ThemedText style={[styles.resultMeta, { color: colors.textMuted }]}>
                        {mutualText}
                      </ThemedText>
                    </View>
                    {status === 'none' ? (
                      <Pressable
                        style={[styles.addButton, { backgroundColor: colors.tint }]}
                        onPress={() => handleAddFriend(suggestion.id)}
                        disabled={actingId === suggestion.id}
                      >
                        {actingId === suggestion.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <ThemedText style={styles.addButtonText}>Add</ThemedText>
                        )}
                      </Pressable>
                    ) : status === 'pending_sent' ? (
                      <ThemedText style={[styles.statusLabel, { color: colors.textMuted }]}>Pending</ThemedText>
                    ) : status === 'friends' ? (
                      <ThemedText style={[styles.statusLabel, { color: colors.tint }]}>Friends</ThemedText>
                    ) : null}
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* Workout Buddy Suggestions */}
        {buddySuggestions.length > 0 && (
          <>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              🤝 Workout Buddies
            </ThemedText>
            <ThemedText style={[styles.buddyHint, { color: colors.textMuted }]}>
              Users with similar goals and schedules
            </ThemedText>
            <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
              {buddySuggestions.map((buddy) => {
                const status = searchStatus[buddy.id] ?? 'none'
                return (
                  <View key={buddy.id} style={[styles.friendRow, { borderBottomColor: colors.tabBarBorder }]}>
                    <Pressable
                      style={[styles.avatarSmall, { backgroundColor: colors.tint + '25' }]}
                      onPress={() => router.push(`/friend-profile?id=${buddy.id}`)}
                    >
                      {buddy.avatar_url ? (
                        <Image source={{ uri: buddy.avatar_url }} style={styles.avatarSmallImage} />
                      ) : (
                        <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
                          {getInitials(buddy.display_name)}
                        </ThemedText>
                      )}
                    </Pressable>
                    <View style={styles.resultInfo}>
                      <ThemedText style={[styles.resultName, { color: colors.text }]}>
                        {buddy.display_name || 'Athlete'}
                      </ThemedText>
                      <ThemedText style={[styles.resultMeta, { color: colors.textMuted }]}>
                        {buddy.reason} • {buddy.workouts_count} workouts
                        {buddy.streak > 0 ? ` • 🔥 ${buddy.streak}` : ''}
                      </ThemedText>
                    </View>
                    {status === 'none' ? (
                      <Pressable
                        style={[styles.addButton, { backgroundColor: colors.tint }]}
                        onPress={() => handleAddFriend(buddy.id)}
                        disabled={actingId === buddy.id}
                      >
                        {actingId === buddy.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <ThemedText style={styles.addButtonText}>Add</ThemedText>
                        )}
                      </Pressable>
                    ) : status === 'pending_sent' ? (
                      <ThemedText style={[styles.statusLabel, { color: colors.textMuted }]}>Pending</ThemedText>
                    ) : status === 'friends' ? (
                      <ThemedText style={[styles.statusLabel, { color: colors.tint }]}>Friends</ThemedText>
                    ) : null}
                  </View>
                )
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarTitle: { fontSize: 28 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  sectionTitle: { marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
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
  centeredRow: { paddingVertical: 16, alignItems: 'center' },
  resultsCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 24 },
  listCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 24 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  avatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarSmallImage: { width: 44, height: 44 },
  avatarInitials: { fontSize: 16, fontWeight: '600' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 16, fontWeight: '600' },
  resultMeta: { fontSize: 13, marginTop: 2 },
  addButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  statusLabel: { fontSize: 14 },
  pendingActions: { flexDirection: 'row', gap: 8 },
  acceptButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  declineButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  declineButtonText: { fontSize: 14 },
  removeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  removeButtonText: { fontSize: 14 },
  emptyHint: { marginBottom: 24, fontSize: 14 },
  duelStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  duelStatusText: { fontSize: 12, fontWeight: '600' },
  challengeMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 24,
  },
  challengeMainBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buddyHint: { fontSize: 13, marginBottom: 10, marginTop: -4 },
})
