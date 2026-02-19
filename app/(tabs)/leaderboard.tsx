import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { useFocusEffect } from '@react-navigation/native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  getBatchTopBadges,
  getPreviousSnapshot,
  saveLeaderboardSnapshot,
} from '@/lib/achievements'
import {
  getCurrentMonthLabel,
  getLeaderboard,
  LEADERBOARD_POINTS,
  type LeaderboardRow,
  type LeaderboardScope,
} from '@/lib/leaderboard'
import { getBatchUserLevels } from '@/lib/levels'
import { getMyGroups, type GroupWithMeta } from '@/lib/groups'
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

export default function LeaderboardScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { session } = useAuthContext()
  const router = useRouter()
  const params = useLocalSearchParams<{ scope?: string }>()

  const [scope, setScope] = useState<LeaderboardScope>('friends')
  const [groups, setGroups] = useState<GroupWithMeta[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [myRow, setMyRow] = useState<LeaderboardRow | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const scopeChanged = useRef(false)
  const [badgesMap, setBadgesMap] = useState<Map<string, Array<{ icon: string; name: string }>>>(new Map())
  const [levelsMap, setLevelsMap] = useState<Map<string, UserLevel>>(new Map())
  const [myPrevRank, setMyPrevRank] = useState<number | null>(null)

  // Current period key (e.g. "2026-02")
  const currentPeriod = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    const paramScope = params.scope
    if (paramScope === 'friends' || paramScope === 'groups' || paramScope === 'global') {
      setScope(paramScope)
    }
  }, [params.scope])

  const load = useCallback(() => {
    setLoading(true)
    const groupIdForScope = scope === 'groups' ? selectedGroupId ?? undefined : undefined
    getLeaderboard(50, session?.user?.id, scope, groupIdForScope)
      .then(async ({ rows: r, myRow: m }) => {
        setRows(r)
        setMyRow(m)

        // Fetch badges + levels for all users on the board
        const userIds = r.map(row => row.id)
        if (userIds.length > 0) {
          const [badges, levels] = await Promise.all([
            getBatchTopBadges(userIds, 2),
            getBatchUserLevels(userIds),
          ])
          setBadgesMap(badges)
          setLevelsMap(levels)
        }

        // Save snapshot and get previous rank for movement display
        if (session?.user?.id && m) {
          const prevSnap = await getPreviousSnapshot(session.user.id, scope, currentPeriod)
          setMyPrevRank(prevSnap?.rank ?? null)
          await saveLeaderboardSnapshot(session.user.id, scope, m.rank, m.points, currentPeriod)
        }
      })
      .finally(() => setLoading(false))
  }, [session?.user?.id, scope, selectedGroupId, currentPeriod])

  useEffect(() => {
    if (!session?.user?.id) return
    ;(async () => {
      const myGroups = await getMyGroups(session.user.id)
      setGroups(myGroups)
      if (!selectedGroupId && myGroups.length > 0) {
        setSelectedGroupId(myGroups[0].id)
      }
    })()
  }, [session?.user?.id])

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
      `💪 Each workout: +${LEADERBOARD_POINTS.workout} pts\n🔥 Streak bonus: +${LEADERBOARD_POINTS.streak} pts per day\n🏆 Competition win: +${LEADERBOARD_POINTS.competitionWin} pts`,
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
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
            Leaderboard
          </ThemedText>
          <View style={styles.headerRow}>
            <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>
              {getCurrentMonthLabel()} — resets monthly
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
          <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            {(['friends', 'groups', 'global'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setScope(s)}
                style={[
                  styles.tab,
                  scope === s && { backgroundColor: colors.tint, borderColor: colors.tint },
                  scope !== s && { borderColor: colors.tabBarBorder },
                ]}
              >
                <ThemedText
                  type="defaultSemiBold"
                  style={[styles.tabLabel, { color: scope === s ? '#fff' : colors.textMuted }]}
                >
                  {s === 'friends' ? 'Friends' : s === 'groups' ? 'Groups' : 'Global'}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {scope === 'groups' && groups.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.groupChipsContainer}
            >
              {groups.map((g) => {
                const selected = g.id === selectedGroupId
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => setSelectedGroupId(g.id)}
                    style={[
                      styles.groupChip,
                      {
                        backgroundColor: selected ? colors.tint : colors.card,
                        borderColor: selected ? colors.tint : colors.tabBarBorder,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.groupChipLabel,
                        { color: selected ? '#fff' : colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {g.name}
                    </ThemedText>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}
        </ThemedView>

        {session && (
          <ThemedView style={[styles.myCard, { backgroundColor: colors.tint + '18', borderColor: colors.tint + '40' }]}>
            <ThemedText type="defaultSemiBold" style={[styles.myCardTitle, { color: colors.text }]}>
              Your score
            </ThemedText>
            <ThemedText type="title" style={[styles.myPoints, { color: colors.tint }]}>
              {myPoints} pts
            </ThemedText>
            {myRow ? (
              <View>
                <View style={styles.rankRow}>
                  <ThemedText style={[styles.myRank, { color: colors.textMuted }]}>
                    Rank #{myRow.rank} this month
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
                  <ThemedText style={[styles.gapText, { color: colors.textMuted }]}>
                    {rows[0].points - myPoints} pts behind #{1}
                  </ThemedText>
                )}
              </View>
            ) : (
              <ThemedText style={[styles.myRank, { color: colors.textMuted }]}>
                No activity this month yet — log a workout to get on the board
              </ThemedText>
            )}
          </ThemedView>
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
            <ThemedView style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                {scope === 'friends'
                  ? 'Add friends to see how you rank among them.'
                  : scope === 'groups'
                    ? 'Join groups to see how you rank with other members.'
                    : 'No one on the board yet. Log workouts, build streaks, join groups and add friends to earn points.'}
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={styles.list}>
              {rows.map((row) => {
                const isMe = session?.user?.id === row.id
                const name = getDisplayName(row)
                const rowLevel = levelsMap.get(row.id)
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
                      { backgroundColor: colors.card, borderColor: colors.tabBarBorder },
                      row.rank <= 3 && { backgroundColor: colors.tint + '12', borderColor: colors.tint + '30' },
                      isMe && { borderColor: colors.tint, borderWidth: 2 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <ThemedText type="defaultSemiBold" style={[styles.rank, { color: colors.textMuted }]}>
                      #{row.rank}
                    </ThemedText>
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
                        {rowLevel && (
                          <ThemedText style={styles.levelEmojiSmall}>{rowLevel.level.emoji}</ThemedText>
                        )}
                        <ThemedText type="defaultSemiBold" style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                          {name}
                          {isMe ? ' (you)' : ''}
                        </ThemedText>
                        {badgesMap.has(row.id) && (
                          <View style={styles.badgeRow}>
                            {badgesMap.get(row.id)!.map((badge, bIdx) => (
                              <View
                                key={`badge-${bIdx}`}
                                style={[styles.badgePill, { backgroundColor: colors.tint + '15' }]}
                              >
                                <ThemedText style={styles.badgeEmoji}>{badge.icon}</ThemedText>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      <ThemedText style={[styles.statsLine, { color: colors.textMuted }]}>
                        {rowLevel ? `${rowLevel.level.title} · ` : ''}{row.workouts_count} workouts · {row.streak} streak
                      </ThemedText>
                    </View>
                    <ThemedText type="defaultSemiBold" style={[styles.points, { color: colors.tint }]}>
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
  title: { marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subtitle: { fontSize: 13, flex: 1, letterSpacing: 0.2, textTransform: 'uppercase', fontWeight: '600' },
  infoButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
    borderWidth: 1,
    alignItems: 'center',
  },
  tabLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  groupChipsContainer: {
    marginTop: 12,
    paddingHorizontal: 2,
    columnGap: 8,
  },
  groupChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  groupChipLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  myCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 0,
    marginBottom: 24,
  },
  myCardTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  myPoints: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  myRank: { fontSize: 12, marginTop: 6, fontWeight: '600', letterSpacing: 0.2 },
  section: { marginBottom: 28 },
  sectionTitle: { marginBottom: 14 },
  loadingRow: { paddingVertical: 32, alignItems: 'center' },
  emptyCard: { padding: 28, borderRadius: 16, borderWidth: 1 },
  emptyText: { textAlign: 'center', lineHeight: 22, letterSpacing: 0.1 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 0,
  },
  rank: { width: 32, fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
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
  levelEmojiSmall: { fontSize: 13 },
  nameBlock: { flex: 1, marginLeft: 10, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontWeight: '700', flexShrink: 1, letterSpacing: 0.1 },
  badgeRow: { flexDirection: 'row', gap: 3 },
  badgePill: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  badgeEmoji: { fontSize: 12 },
  statsLine: { fontSize: 10, marginTop: 3, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  points: { fontSize: 16, fontWeight: '800', marginLeft: 8, letterSpacing: -0.3 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankMovement: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rankUp: { fontSize: 12, fontWeight: '800', color: '#22C55E' },
  rankDown: { fontSize: 12, fontWeight: '800', color: '#EF4444' },
  gapText: { fontSize: 11, marginTop: 4, letterSpacing: 0.1 },
})
