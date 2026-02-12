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
import {
  acceptFriendRequest,
  getFriends,
  getFriendshipStatus,
  getPendingReceived,
  removeFriendship,
  searchProfiles,
  sendFriendRequest,
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
})
