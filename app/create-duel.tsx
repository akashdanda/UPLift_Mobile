import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { createDuel, hasExistingDuel } from '@/lib/duels'
import { getFriends, type FriendWithProfile } from '@/lib/friends'
import type { DuelType } from '@/types/duel'

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  return '?'
}

const DURATION_OPTIONS = [
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
]

export default function CreateDuelScreen() {
  const { session } = useAuthContext()
  const { friendId } = useLocalSearchParams<{ friendId?: string }>()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [friends, setFriends] = useState<FriendWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFriend, setSelectedFriend] = useState<string | null>(friendId ?? null)
  const [duelType, setDuelType] = useState<DuelType>('workout_count')
  const [duration, setDuration] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [existingDuelStatus, setExistingDuelStatus] = useState<'pending' | 'active' | null>(null)
  const [checkingDuel, setCheckingDuel] = useState(false)

  useEffect(() => {
    if (!session) return
    getFriends(session.user.id)
      .then(setFriends)
      .finally(() => setLoading(false))
  }, [session])

  // Check for existing duel when friend is selected
  useEffect(() => {
    if (!session || !selectedFriend) {
      setExistingDuelStatus(null)
      return
    }
    setCheckingDuel(true)
    hasExistingDuel(session.user.id, selectedFriend)
      .then(({ hasDuel, status }) => {
        setExistingDuelStatus(hasDuel ? status : null)
      })
      .catch(() => {
        setExistingDuelStatus(null)
      })
      .finally(() => setCheckingDuel(false))
  }, [session, selectedFriend])

  const selectedProfile = friends.find((f) => f.id === selectedFriend)

  const handleCreate = useCallback(async () => {
    if (!session || !selectedFriend) return
    setSubmitting(true)
    const { duel, error } = await createDuel(session.user.id, selectedFriend, duelType, duration)
    setSubmitting(false)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    if (duel) {
      Alert.alert('Challenge Sent', 'Your friend will receive the challenge.', [
        { text: 'View', onPress: () => router.replace(`/duel-detail?id=${duel.id}`) },
        { text: 'OK', onPress: () => router.back() },
      ])
    }
  }, [session, selectedFriend, duelType, duration])

  if (!session) return null

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.header}>
          <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
            Challenge a Friend
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>
            Start a head-to-head challenge and compete directly!
          </ThemedText>
        </View>

        {/* Select Friend */}
        <View style={styles.section}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionTitle, { color: colors.text }]}>
            Select Opponent
          </ThemedText>
          {loading ? (
            <ActivityIndicator size="small" color={colors.tint} style={{ padding: 20 }} />
          ) : friends.length === 0 ? (
            <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
              Add friends first to challenge them!
            </ThemedText>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.friendScroll}
            >
              {friends.map((friend) => {
                const isSelected = selectedFriend === friend.id
                return (
                  <Pressable
                    key={friend.id}
                    style={[
                      styles.friendChip,
                      { backgroundColor: colors.card, borderColor: isSelected ? colors.tint : colors.tabBarBorder },
                      isSelected && { borderWidth: 2 },
                    ]}
                    onPress={() => setSelectedFriend(friend.id)}
                  >
                    <View style={[styles.chipAvatar, { backgroundColor: colors.tint + '20' }]}>
                      {friend.avatar_url ? (
                        <Image source={{ uri: friend.avatar_url }} style={styles.chipAvatarImage} />
                      ) : (
                        <ThemedText style={[styles.chipInitials, { color: colors.tint }]}>
                          {getInitials(friend.display_name)}
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText
                      style={[styles.chipName, { color: isSelected ? colors.tint : colors.text }]}
                      numberOfLines={1}
                    >
                      {friend.display_name || 'No name'}
                    </ThemedText>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={16} color={colors.tint} />
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>
          )}
        </View>

        {/* Challenge Type */}
        <View style={styles.section}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionTitle, { color: colors.text }]}>
            Challenge Type
          </ThemedText>
          <View style={styles.typeRow}>
            <Pressable
              style={[
                styles.typeCard,
                {
                  backgroundColor: colors.card,
                  borderColor: duelType === 'workout_count' ? colors.tint : colors.tabBarBorder,
                  borderWidth: duelType === 'workout_count' ? 2 : 1,
                },
              ]}
              onPress={() => setDuelType('workout_count')}
            >
              <ThemedText style={styles.typeEmoji}>💪</ThemedText>
              <ThemedText type="defaultSemiBold" style={[styles.typeLabel, { color: colors.text }]}>
                Workout Count
              </ThemedText>
              <ThemedText style={[styles.typeDesc, { color: colors.textMuted }]}>
                Most workouts logged wins
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.typeCard,
                {
                  backgroundColor: colors.card,
                  borderColor: duelType === 'streak' ? colors.tint : colors.tabBarBorder,
                  borderWidth: duelType === 'streak' ? 2 : 1,
                },
              ]}
              onPress={() => setDuelType('streak')}
            >
              <ThemedText style={styles.typeEmoji}>🔥</ThemedText>
              <ThemedText type="defaultSemiBold" style={[styles.typeLabel, { color: colors.text }]}>
                Streak Battle
              </ThemedText>
              <ThemedText style={[styles.typeDesc, { color: colors.textMuted }]}>
                Most days worked out wins
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Duration */}
        <View style={styles.section}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionTitle, { color: colors.text }]}>
            Duration
          </ThemedText>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.durationPill,
                  {
                    backgroundColor: duration === opt.value ? colors.tint : colors.card,
                    borderColor: duration === opt.value ? colors.tint : colors.tabBarBorder,
                  },
                ]}
                onPress={() => setDuration(opt.value)}
              >
                <ThemedText
                  style={[
                    styles.durationText,
                    { color: duration === opt.value ? '#fff' : colors.text },
                  ]}
                >
                  {opt.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Preview */}
        {selectedProfile && (
          <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.tint + '30' }]}>
            <ThemedText style={styles.previewEmoji}>🏆</ThemedText>
            <ThemedText type="defaultSemiBold" style={[styles.previewTitle, { color: colors.text }]}>
              You vs {selectedProfile.display_name || 'Friend'}
            </ThemedText>
            <ThemedText style={[styles.previewMeta, { color: colors.textMuted }]}>
              {duelType === 'workout_count' ? 'Most workouts' : 'Most active days'} in {duration} days
            </ThemedText>
            {existingDuelStatus && (
              <View style={[styles.existingDuelWarning, { backgroundColor: (existingDuelStatus === 'pending' ? '#EAB308' : colors.tint) + '20' }]}>
                <ThemedText style={[styles.existingDuelText, { color: existingDuelStatus === 'pending' ? '#EAB308' : colors.tint }]}>
                  {existingDuelStatus === 'pending'
                    ? '⚠️ You already have a pending challenge with this friend'
                    : '⚠️ You already have an active challenge with this friend'}
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Submit */}
        <Pressable
          style={[
            styles.submitButton,
            {
              backgroundColor:
                selectedFriend && !existingDuelStatus ? colors.tint : colors.tint + '50',
            },
          ]}
          onPress={handleCreate}
          disabled={!selectedFriend || submitting || !!existingDuelStatus || checkingDuel}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.submitText}>
              {existingDuelStatus ? 'Challenge Already Exists' : 'Send Challenge'}
            </ThemedText>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  header: { marginBottom: 28 },
  title: { marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 21, letterSpacing: 0.1 },
  section: { marginBottom: 28 },
  sectionTitle: { marginBottom: 12, fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  friendScroll: { gap: 10, paddingVertical: 4 },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  chipAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipAvatarImage: { width: 36, height: 36 },
  chipInitials: { fontSize: 14, fontWeight: '600' },
  chipName: { fontSize: 14, fontWeight: '700', maxWidth: 100, letterSpacing: 0.1 },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  typeEmoji: { fontSize: 28, marginBottom: 8 },
  typeLabel: { fontSize: 13, fontWeight: '700', marginBottom: 4, letterSpacing: 0.2 },
  typeDesc: { fontSize: 11, textAlign: 'center', lineHeight: 16, letterSpacing: 0.1 },
  durationRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  durationPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  durationText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  previewCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  previewEmoji: { fontSize: 36, marginBottom: 8 },
  previewTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4, letterSpacing: -0.2 },
  previewMeta: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  emptyText: { fontSize: 13, padding: 12, letterSpacing: 0.1 },
  existingDuelWarning: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  existingDuelText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
})
