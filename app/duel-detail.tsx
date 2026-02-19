import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
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
import { acceptDuel, cancelDuel, declineDuel, finalizeExpiredDuels, getDuel } from '@/lib/duels'
import type { DuelWithProfiles } from '@/types/duel'

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  return '?'
}

function formatTimeRemaining(endsAt: string): string {
  const end = new Date(endsAt)
  const now = new Date()
  const diff = end.getTime() - now.getTime()
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h remaining`
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

export default function DuelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [duel, setDuel] = useState<DuelWithProfiles | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const userId = session?.user?.id ?? ''

  const loadDuel = useCallback(async () => {
    if (!id) return
    setLoading(true)
    // Finalize any expired duels first
    await finalizeExpiredDuels().catch(() => {})
    const d = await getDuel(id)
    setDuel(d)
    setLoading(false)
  }, [id])

  useFocusEffect(
    useCallback(() => {
      void loadDuel()
    }, [loadDuel])
  )

  const handleAccept = async () => {
    if (!duel) return
    setActing(true)
    const { error } = await acceptDuel(duel.id, userId)
    setActing(false)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    Alert.alert('Challenge Accepted! 🔥', 'The duel has begun!')
    loadDuel()
  }

  const handleDecline = async () => {
    if (!duel) return
    Alert.alert('Decline Challenge', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setActing(true)
          const { error } = await declineDuel(duel.id, userId)
          setActing(false)
          if (error) Alert.alert('Error', error.message)
          else router.back()
        },
      },
    ])
  }

  const handleCancel = async () => {
    if (!duel) return
    Alert.alert('Cancel Challenge', 'Are you sure?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Challenge',
        style: 'destructive',
        onPress: async () => {
          setActing(true)
          const { error } = await cancelDuel(duel.id, userId)
          setActing(false)
          if (error) Alert.alert('Error', error.message)
          else router.back()
        },
      },
    ])
  }

  if (!session) return null

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    )
  }

  if (!duel) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ThemedText style={{ color: colors.textMuted }}>Challenge not found</ThemedText>
        </View>
      </SafeAreaView>
    )
  }

  const iAmChallenger = duel.challenger_id === userId
  const myScore = iAmChallenger ? duel.challenger_score : duel.opponent_score
  const theirScore = iAmChallenger ? duel.opponent_score : duel.challenger_score
  const myName = iAmChallenger ? duel.challenger_display_name : duel.opponent_display_name
  const theirName = iAmChallenger ? duel.opponent_display_name : duel.challenger_display_name
  const myAvatar = iAmChallenger ? duel.challenger_avatar_url : duel.opponent_avatar_url
  const theirAvatar = iAmChallenger ? duel.opponent_avatar_url : duel.challenger_avatar_url

  const isActive = duel.status === 'active'
  const isPending = duel.status === 'pending'
  const isCompleted = duel.status === 'completed'
  const iWon = duel.winner_id === userId
  const isTie = isCompleted && !duel.winner_id

  const statusColors: Record<string, string> = {
    pending: '#EAB308',
    active: '#3B82F6',
    completed: '#10B981',
    declined: '#EF4444',
    cancelled: '#6B7280',
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status badge */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: (statusColors[duel.status] ?? '#6B7280') + '20' }]}>
            <ThemedText style={[styles.statusText, { color: statusColors[duel.status] ?? '#6B7280' }]}>
              {duel.status.toUpperCase()}
            </ThemedText>
          </View>
          {isActive && duel.ends_at && (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <ThemedText style={[styles.timeText, { color: colors.textMuted }]}>
                {formatTimeRemaining(duel.ends_at)}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Challenge type */}
        <View style={[styles.typeCard, { backgroundColor: colors.card }]}>
          <ThemedText style={styles.typeEmoji}>
            {duel.type === 'workout_count' ? '💪' : '🔥'}
          </ThemedText>
          <View>
            <ThemedText type="defaultSemiBold" style={[styles.typeLabel, { color: colors.text }]}>
              {duel.type === 'workout_count' ? 'Workout Count' : 'Streak Battle'}
            </ThemedText>
            <ThemedText style={[styles.typeMeta, { color: colors.textMuted }]}>
              {duel.duration_days} day challenge
            </ThemedText>
          </View>
        </View>

        {/* VS Display */}
        <View style={styles.vsSection}>
          {/* Me */}
          <View style={styles.playerColumn}>
            <View style={[styles.playerAvatar, { backgroundColor: colors.tint + '20' }]}>
              {myAvatar ? (
                <Image source={{ uri: myAvatar }} style={styles.playerAvatarImg} />
              ) : (
                <ThemedText style={[styles.playerInitials, { color: colors.tint }]}>
                  {getInitials(myName)}
                </ThemedText>
              )}
            </View>
            <ThemedText type="defaultSemiBold" style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
              You
            </ThemedText>
            <ThemedText type="title" style={[styles.playerScore, { color: colors.tint }]}>
              {myScore}
            </ThemedText>
            <ThemedText style={[styles.playerScoreLabel, { color: colors.textMuted }]}>
              {duel.type === 'workout_count' ? 'workouts' : 'days'}
            </ThemedText>
          </View>

          {/* VS */}
          <View style={styles.vsDivider}>
            <ThemedText style={[styles.vsText, { color: colors.textMuted }]}>VS</ThemedText>
            {isCompleted && (
              <ThemedText style={styles.resultEmoji}>
                {isTie ? '🤝' : iWon ? '🏆' : '😤'}
              </ThemedText>
            )}
          </View>

          {/* Opponent */}
          <View style={styles.playerColumn}>
            <Pressable
              style={[styles.playerAvatar, { backgroundColor: '#EF4444' + '20' }]}
              onPress={() => {
                const opId = iAmChallenger ? duel.opponent_id : duel.challenger_id
                router.push(`/friend-profile?id=${opId}`)
              }}
            >
              {theirAvatar ? (
                <Image source={{ uri: theirAvatar }} style={styles.playerAvatarImg} />
              ) : (
                <ThemedText style={[styles.playerInitials, { color: '#EF4444' }]}>
                  {getInitials(theirName)}
                </ThemedText>
              )}
            </Pressable>
            <ThemedText type="defaultSemiBold" style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
              {theirName || 'Opponent'}
            </ThemedText>
            <ThemedText type="title" style={[styles.playerScore, { color: '#EF4444' }]}>
              {theirScore}
            </ThemedText>
            <ThemedText style={[styles.playerScoreLabel, { color: colors.textMuted }]}>
              {duel.type === 'workout_count' ? 'workouts' : 'days'}
            </ThemedText>
          </View>
        </View>

        {/* Score comparison bar */}
        {(isActive || isCompleted) && (myScore > 0 || theirScore > 0) && (
          <View style={styles.barSection}>
            <View style={[styles.barTrack, { backgroundColor: colors.card }]}>
              <View
                style={[
                  styles.barFillLeft,
                  {
                    backgroundColor: colors.tint,
                    flex: myScore || 0.5,
                  },
                ]}
              />
              <View
                style={[
                  styles.barFillRight,
                  {
                    backgroundColor: '#EF4444',
                    flex: theirScore || 0.5,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Result banner */}
        {isCompleted && (
          <View style={[styles.resultBanner, { backgroundColor: isTie ? '#EAB308' + '15' : iWon ? '#10B981' + '15' : '#EF4444' + '15' }]}>
            <ThemedText type="defaultSemiBold" style={[styles.resultText, { color: isTie ? '#EAB308' : iWon ? '#10B981' : '#EF4444' }]}>
              {isTie
                ? "It's a tie! 🤝"
                : iWon
                  ? 'You won! 🏆'
                  : `${theirName || 'Opponent'} won! 😤`}
            </ThemedText>
          </View>
        )}

        {/* Actions */}
        {isPending && duel.opponent_id === userId && (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.acceptBtn, { backgroundColor: colors.tint }]}
              onPress={handleAccept}
              disabled={acting}
            >
              {acting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.actionBtnText}>✅ Accept</ThemedText>
              )}
            </Pressable>
            <Pressable
              style={[styles.declineBtn, { borderColor: '#EF4444' }]}
              onPress={handleDecline}
              disabled={acting}
            >
              <ThemedText style={[styles.declineBtnText, { color: '#EF4444' }]}>Decline</ThemedText>
            </Pressable>
          </View>
        )}

        {isPending && duel.challenger_id === userId && (
          <View style={styles.pendingInfo}>
            <Ionicons name="hourglass-outline" size={20} color={colors.textMuted} />
            <ThemedText style={[styles.pendingText, { color: colors.textMuted }]}>
              Waiting for {theirName || 'opponent'} to accept…
            </ThemedText>
            <Pressable
              style={[styles.cancelBtn, { borderColor: colors.tabBarBorder }]}
              onPress={handleCancel}
              disabled={acting}
            >
              <ThemedText style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</ThemedText>
            </Pressable>
          </View>
        )}

        {isActive && (
          <View style={[styles.tipCard, { backgroundColor: colors.tint + '10' }]}>
            <Ionicons name="bulb-outline" size={18} color={colors.tint} />
            <ThemedText style={[styles.tipText, { color: colors.text }]}>
              Log workouts daily to increase your score! Scores update automatically.
            </ThemedText>
          </View>
        )}

        {/* Timeline info */}
        {duel.started_at && (
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <ThemedText style={[styles.infoLabel, { color: colors.textMuted }]}>
                Started: {new Date(duel.started_at).toLocaleDateString()}
              </ThemedText>
            </View>
            {duel.ends_at && (
              <View style={styles.infoRow}>
                <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
                <ThemedText style={[styles.infoLabel, { color: colors.textMuted }]}>
                  Ends: {new Date(duel.ends_at).toLocaleDateString()}
                </ThemedText>
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
  content: { padding: 24, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    gap: 12,
    marginBottom: 28,
  },
  typeEmoji: { fontSize: 28 },
  typeLabel: { fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
  typeMeta: { fontSize: 12, marginTop: 2, fontWeight: '600', letterSpacing: 0.1 },
  vsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  playerColumn: { alignItems: 'center', flex: 1 },
  playerAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  playerAvatarImg: { width: 72, height: 72 },
  playerInitials: { fontSize: 24, fontWeight: '700' },
  playerName: { fontSize: 14, fontWeight: '700', marginBottom: 4, letterSpacing: 0.1 },
  playerScore: { fontSize: 36, lineHeight: 44, fontWeight: '800', letterSpacing: -1 },
  playerScoreLabel: { fontSize: 10, marginTop: 3, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  vsDivider: { alignItems: 'center', paddingHorizontal: 16 },
  vsText: { fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  resultEmoji: { fontSize: 28, marginTop: 8 },
  barSection: { marginBottom: 20 },
  barTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFillLeft: { borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  barFillRight: { borderTopRightRadius: 5, borderBottomRightRadius: 5 },
  resultBanner: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  resultText: { fontSize: 17, fontWeight: '700', letterSpacing: 0.1 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  acceptBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  declineBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  pendingInfo: { alignItems: 'center', gap: 8, marginBottom: 20, paddingVertical: 12 },
  pendingText: { fontSize: 15, textAlign: 'center' },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  cancelBtnText: { fontSize: 14 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    marginBottom: 20,
  },
  tipText: { fontSize: 14, flex: 1, lineHeight: 20 },
  infoSection: { gap: 8, marginTop: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 13 },
})
