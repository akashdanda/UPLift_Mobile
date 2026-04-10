import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'

import { useFocusEffect } from '@react-navigation/native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors, Fonts } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getPreviousSnapshot, saveLeaderboardSnapshot } from '@/lib/leaderboard-snapshots'
import {
  buildSeenBoardKey,
  loadSeenRanks,
  saveSeenRanks,
} from '@/lib/leaderboard-seen-ranks'
import {
  getCurrentMonthLabel,
  getLeaderboard,
  LEADERBOARD_POINTS,
  type LeaderboardRow,
  type LeaderboardScope,
} from '@/lib/leaderboard'
import { getBatchUserLevels } from '@/lib/levels'
import type { UserLevel } from '@/types/level'

function getDisplayName(row: LeaderboardRow): string {
  return row.display_name?.trim() || 'Anonymous'
}

function getInitials(displayName: string): string {
  if (displayName && displayName !== 'Anonymous') {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  return '?'
}

/** Lower rank # = moved up on the board */
function getRankMovement(
  prevRank: number | undefined,
  currentRank: number
): 'up' | 'down' | null {
  if (prevRank === undefined || prevRank === currentRank) return null
  return currentRank < prevRank ? 'up' : 'down'
}

export default function LeaderboardScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'
  const { session } = useAuthContext()
  const router = useRouter()
  const params = useLocalSearchParams<{ scope?: string }>()

  const [scope, setScope] = useState<LeaderboardScope>('friends')
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [myRow, setMyRow] = useState<LeaderboardRow | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const scopeChanged = useRef(false)
  const [levelsMap, setLevelsMap] = useState<Map<string, UserLevel>>(new Map())
  const [myPrevRank, setMyPrevRank] = useState<number | null>(null)
  const [rankDeltas, setRankDeltas] = useState<Map<string, 'up' | 'down'>>(new Map())

  useEffect(() => {
    const paramScope = params.scope
    if (paramScope === 'friends' || paramScope === 'global') {
      setScope(paramScope)
    }
  }, [params.scope])

  useEffect(() => {
    setRankDeltas(new Map())
  }, [scope])

  const load = useCallback(() => {
    setLoading(true)
    getLeaderboard(50, session?.user?.id, scope, undefined)
      .then(async ({ rows: r, myRow: m }) => {
        const now = new Date()
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const boardKey = buildSeenBoardKey(period, scope)

        const prevMap = await loadSeenRanks(boardKey)
        const deltas = new Map<string, 'up' | 'down'>()
        for (const row of r) {
          const mv = getRankMovement(prevMap[row.id], row.rank)
          if (mv) deltas.set(row.id, mv)
        }
        setRankDeltas(deltas)

        setRows(r)
        setMyRow(m)
        await saveSeenRanks(boardKey, r)

        const userIds = r.map(row => row.id)
        if (userIds.length > 0) {
          const levels = await getBatchUserLevels(userIds)
          setLevelsMap(levels)
        }

        // Save snapshot and get previous rank for movement display
        if (session?.user?.id && m) {
          const prevSnap = await getPreviousSnapshot(session.user.id, scope, period)
          setMyPrevRank(prevSnap?.rank ?? null)
          await saveLeaderboardSnapshot(session.user.id, scope, m.rank, m.points, period)
        }
      })
      .finally(() => setLoading(false))
  }, [session?.user?.id, scope])

  useFocusEffect(useCallback(() => load(), [load]))
  useEffect(() => {
    if (!scopeChanged.current) {
      scopeChanged.current = true
      return
    }
    load()
  }, [scope])

  const myPoints = myRow?.points ?? 0

  const showPointsInfo = useCallback(() => {
    Alert.alert(
      'How Points Work',
      `All Points are based on this month's activity only.\n\n💪 Each workout: +${LEADERBOARD_POINTS.perWorkout} Points\n🏆 Competition win: +${LEADERBOARD_POINTS.perCompetitionWin} Points\n👥 Friend added: +${LEADERBOARD_POINTS.perFriend} Points`,
      [{ text: 'OK' }]
    )
  }, [])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Hero header ─── */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
              Leaderboard
            </ThemedText>
            <Pressable
              onPress={showPointsInfo}
              hitSlop={12}
              style={({ pressed }) => [
                styles.infoButton,
                { backgroundColor: colors.textMuted + '18' },
                pressed && styles.infoButtonPressed,
              ]}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <ThemedText type="default" style={[styles.subtitle, { color: colors.textMuted }]}>
            {getCurrentMonthLabel()} · resets monthly
          </ThemedText>

          <View style={[styles.tabs, { backgroundColor: isDark ? colors.cardElevated : colors.card, borderColor: colors.tabBarBorder }]}>
            {(['friends', 'global'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setScope(s)}
                style={[
                  styles.tab,
                  scope === s && { backgroundColor: colors.tint },
                ]}
              >
                <ThemedText
                  type="defaultSemiBold"
                  style={[styles.tabLabel, { color: scope === s ? '#fff' : colors.textMuted }]}
                >
                  {s === 'friends' ? 'Friends' : 'Global'}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ─── Your score card ─── */}
        {session && (
          <View style={[styles.myCard, { borderColor: colors.tint + '30' }]}>
            <LinearGradient
              colors={
                isDark
                  ? [colors.tint + '28', 'rgba(20, 20, 20, 0.95)']
                  : [colors.tint + '12', colors.card]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 18 }]}
            />
            {myRow ? (
              <View style={styles.myCardContent}>
                <View style={styles.myCardRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold" style={[styles.myCardLabel, { color: colors.textMuted }]}>
                      Your score
                    </ThemedText>
                    <ThemedText type="title" style={[styles.myPoints, { color: colors.text }]}>
                      {myPoints} pts
                    </ThemedText>
                  </View>
                  <View style={[styles.rankBadge, { backgroundColor: colors.tint + '18', borderColor: colors.tint + '40' }]}>
                    <ThemedText type="defaultSemiBold" style={[styles.rankBadgeLabel, { color: colors.textMuted }]}>
                      RANK
                    </ThemedText>
                    <ThemedText type="defaultSemiBold" style={[styles.rankBadgeNum, { color: colors.tint }]}>
                      #{myRow.rank}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.myCardMeta}>
                  <ThemedText type="default" style={[styles.myRankText, { color: colors.textMuted }]}>
                    {getCurrentMonthLabel()}
                  </ThemedText>
                  {myPrevRank !== null && myPrevRank !== myRow.rank && (
                    <View style={styles.rankMovement}>
                      {myRow.rank < myPrevRank ? (
                        <>
                          <Ionicons name="arrow-up" size={14} color="#22C55E" />
                          <ThemedText style={styles.rankUp}>+{myPrevRank - myRow.rank}</ThemedText>
                        </>
                      ) : (
                        <>
                          <Ionicons name="arrow-down" size={14} color="#EF4444" />
                          <ThemedText style={styles.rankDown}>-{myRow.rank - myPrevRank}</ThemedText>
                        </>
                      )}
                    </View>
                  )}
                </View>
                {myRow.rank > 1 && rows.length > 0 && rows[0].points > myPoints && (
                  <ThemedText type="default" style={[styles.gapText, { color: colors.textMuted }]}>
                    {rows[0].points - myPoints} pts behind #1
                  </ThemedText>
                )}
              </View>
            ) : (
              <View style={styles.myCardContent}>
                <ThemedText type="defaultSemiBold" style={[styles.myCardLabel, { color: colors.textMuted }]}>
                  Your score
                </ThemedText>
                <ThemedText type="default" style={[styles.myRankText, { color: colors.textMuted, marginTop: 6 }]}>
                  No activity this month yet — log a workout to get on the board
                </ThemedText>
              </View>
            )}
          </View>
        )}

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Top athletes
          </ThemedText>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="large" color={colors.tint} />
            </View>
          ) : rows.length === 0 ? (
            <ThemedView style={[styles.emptyCard, { backgroundColor: colors.card }]}>
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                {scope === 'friends'
                  ? 'Add friends to see how you rank among them.'
                  : 'No one on the board yet. Log workouts, build streaks, and add friends to earn points.'}
              </ThemedText>
              {scope === 'friends' && (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/(tabs)/profile', params: { friends: '1' } })
                  }
                  style={[styles.emptyCta, { backgroundColor: colors.tint }]}
                >
                  <ThemedText style={styles.emptyCtaText}>Find friends</ThemedText>
                </Pressable>
              )}
            </ThemedView>
          ) : (
            <View style={styles.list}>
              {rows.map((row) => {
                const isMe = session?.user?.id === row.id
                const name = getDisplayName(row)
                const rowLevel = levelsMap.get(row.id)
                const rankDelta = rankDeltas.get(row.id)
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => {
                      if (isMe) {
                        router.push('/(tabs)/profile')
                      } else {
                        router.push({ pathname: '/friend-profile', params: { id: row.id } })
                      }
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      { backgroundColor: colors.tint + '12', borderColor: colors.tint + '30' },
                      isMe && { borderColor: colors.tint, borderWidth: 2 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={styles.rankCol}>
                      <ThemedText type="defaultSemiBold" style={[styles.rank, { color: colors.textMuted }]}>
                        #{row.rank}
                      </ThemedText>
                      {rankDelta === 'up' && (
                        <Ionicons name="arrow-up" size={13} color="#22C55E" style={styles.rankArrow} />
                      )}
                      {rankDelta === 'down' && (
                        <Ionicons name="arrow-down" size={13} color="#EF4444" style={styles.rankArrow} />
                      )}
                    </View>
                    <View
                      style={[
                        styles.avatarRing,
                        { borderColor: rowLevel?.level.color ?? colors.tint + '40' },
                      ]}
                    >
                      <View style={[styles.avatar, { backgroundColor: colors.tint + '25' }]}>
                        {row.avatar_url ? (
                          <Image source={{ uri: row.avatar_url }} style={styles.avatarImage} />
                        ) : (
                          <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
                            {getInitials(name)}
                          </ThemedText>
                        )}
                      </View>
                    </View>
                    <View style={styles.nameBlock}>
                      <View style={styles.nameRow}>
                        <ThemedText type="defaultSemiBold" style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                          {name}
                          {isMe ? ' (you)' : ''}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.statsLine, { color: colors.textMuted }]}>
                        {row.workouts_count} workouts · {row.streak} streak
                      </ThemedText>
                    </View>
                    <ThemedText type="defaultSemiBold" style={[styles.points, { color: colors.text }]}>
                      {row.points}
                    </ThemedText>
                  </Pressable>
                )
              })}
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
  header: { marginBottom: 24 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { marginBottom: 4, fontFamily: Fonts?.rounded },
  subtitle: { fontSize: 13, letterSpacing: 0.2 },
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonPressed: { opacity: 0.7 },
  tabs: {
    flexDirection: 'row',
    marginTop: 16,
    padding: 3,
    borderRadius: 14,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 11,
    alignItems: 'center',
  },
  tabLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, fontFamily: Fonts?.rounded },
  myCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden',
  },
  myCardContent: {
    padding: 20,
  },
  myCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  myCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  myPoints: { fontSize: 32, fontWeight: '800', letterSpacing: -1, lineHeight: 38, fontFamily: Fonts?.rounded },
  rankBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 78,
  },
  rankBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 2,
    lineHeight: 14,
  },
  rankBadgeNum: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 26,
    fontFamily: Fonts?.rounded,
  },
  myCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  myRankText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.15, lineHeight: 20 },
  gapText: { fontSize: 12, marginTop: 6, letterSpacing: 0.1, lineHeight: 18 },
  section: { marginBottom: 28 },
  sectionTitle: { marginBottom: 14, fontFamily: Fonts?.rounded },
  loadingRow: { paddingVertical: 32, alignItems: 'center' },
  emptyCard: { padding: 28, borderRadius: 16 },
  emptyText: { textAlign: 'center', lineHeight: 22, letterSpacing: 0.1 },
  emptyCta: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  rankCol: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, fontFamily: Fonts?.rounded },
  rankArrow: { marginTop: -1 },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 36, height: 36 },
  avatarInitials: { fontSize: 13, fontWeight: '700' },
  nameBlock: { flex: 1, marginLeft: 10, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontWeight: '700', flexShrink: 1, letterSpacing: 0.1, fontFamily: Fonts?.rounded },
  statsLine: { fontSize: 10, marginTop: 3, fontWeight: '600', letterSpacing: 0.3 },
  points: { fontSize: 16, fontWeight: '800', marginLeft: 8, letterSpacing: -0.3, fontFamily: Fonts?.rounded },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankMovement: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rankUp: { fontSize: 12, fontWeight: '800', color: '#22C55E' },
  rankDown: { fontSize: 12, fontWeight: '800', color: '#EF4444' },
})
