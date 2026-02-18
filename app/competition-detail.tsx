import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { acceptChallenge, cancelChallenge, getCompetitionDetails } from '@/lib/competitions'
import { getGroupMembers, getMemberRole, type GroupMemberWithProfile } from '@/lib/groups'
import type { CompetitionContributionWithProfile, CompetitionWithGroups } from '@/types/group'

function formatTimeRemaining(endsAt: string): string {
  const end = new Date(endsAt)
  const now = new Date()
  const diff = end.getTime() - now.getTime()

  if (diff <= 0) return 'Ended'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${mins}m left`
  return `${mins}m left`
}

function getGroupInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function CompetitionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [competition, setCompetition] = useState<CompetitionWithGroups | null>(null)
  const [contributions, setContributions] = useState<CompetitionContributionWithProfile[]>([])
  const [group1Members, setGroup1Members] = useState<GroupMemberWithProfile[]>([])
  const [group2Members, setGroup2Members] = useState<GroupMemberWithProfile[]>([])
  const [userIsStaffGroup1, setUserIsStaffGroup1] = useState(false)
  const [userIsStaffGroup2, setUserIsStaffGroup2] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const userId = session?.user?.id ?? ''

  const loadCompetition = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const { competition: comp, contributions: contribs, error } = await getCompetitionDetails(id)
      if (error) {
        Alert.alert('Error', error.message)
        router.back()
        return
      }
      setCompetition(comp)
      setContributions(contribs)

      // Load all members of both groups + user roles
      if (comp) {
        const [m1, m2, role1, role2] = await Promise.all([
          getGroupMembers(comp.group1_id),
          getGroupMembers(comp.group2_id),
          getMemberRole(comp.group1_id, userId),
          getMemberRole(comp.group2_id, userId),
        ])
        setGroup1Members(m1)
        setGroup2Members(m2)
        setUserIsStaffGroup1(role1 === 'owner' || role1 === 'admin')
        setUserIsStaffGroup2(role2 === 'owner' || role2 === 'admin')
      }
    } catch {
      Alert.alert('Error', 'Failed to load competition')
      router.back()
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadCompetition()
  }, [loadCompetition])

  const handleAccept = async () => {
    if (!id || !userId) return
    setActing(true)
    const { error } = await acceptChallenge(id, userId)
    setActing(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      void loadCompetition()
    }
  }

  const handleCancel = async () => {
    if (!id || !userId) return
    Alert.alert('Cancel Challenge', 'Are you sure you want to cancel this challenge?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          setActing(true)
          const { error } = await cancelChallenge(id, userId)
          setActing(false)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            router.back()
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    )
  }

  if (!competition) return null

  // Determine which group the current user belongs to (if any)
  // For now, we'll show group1 vs group2. In a real app, you'd check user's membership
  const myGroup = competition.group1
  const opponentGroup = competition.group2
  const myScore = competition.group1_score
  const opponentScore = competition.group2_score
  const isWinning = myScore > opponentScore
  const isLosing = myScore < opponentScore
  const isTie = myScore === opponentScore

  // Check if user is owner/admin of either group (for accepting/cancelling)
  const canAccept = competition.status === 'pending' && competition.type === 'challenge' && userIsStaffGroup2
  const canCancel = competition.status === 'pending' && (userIsStaffGroup1 || userIsStaffGroup2)

  // Group contributions
  const group1Contribs = contributions.filter((c) => c.group_id === competition.group1_id)
  const group2Contribs = contributions.filter((c) => c.group_id === competition.group2_id)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
            Competition
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>
            {competition.type === 'matchmaking' ? 'Auto-matched Competition' : 'Direct Challenge'}
          </ThemedText>
        </View>

        {/* Status banner */}
        {competition.status === 'pending' && (
          <View style={[styles.statusBanner, { backgroundColor: colors.warm + '20' }]}>
            <Ionicons name="time-outline" size={20} color={colors.warm} />
            <ThemedText style={[styles.statusText, { color: colors.warm }]}>
              Waiting for acceptance...
            </ThemedText>
          </View>
        )}

        {competition.status === 'active' && competition.started_at && (
          <View style={[styles.statusBanner, { backgroundColor: colors.tint + '20' }]}>
            <Ionicons name="flame" size={20} color={colors.tint} />
            <ThemedText style={[styles.statusText, { color: colors.tint }]}>
              {formatTimeRemaining(competition.ends_at)}
            </ThemedText>
          </View>
        )}

        {/* Score comparison */}
        <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
          {/* Group 1 */}
          <View style={styles.scoreGroupRow}>
            {myGroup.avatar_url ? (
              <Image source={{ uri: myGroup.avatar_url }} style={styles.scoreAvatar} />
            ) : (
              <View style={[styles.scoreAvatar, { backgroundColor: colors.tint + '20' }]}>
                <ThemedText style={[styles.scoreAvatarText, { color: colors.tint }]}>
                  {getGroupInitials(myGroup.name)}
                </ThemedText>
              </View>
            )}
            <ThemedText type="defaultSemiBold" style={[styles.scoreGroupName, { color: colors.text }]} numberOfLines={1}>
              {myGroup.name}
            </ThemedText>
            <ThemedText
              style={[
                styles.scoreValue,
                {
                  color: isWinning ? colors.tint : isLosing ? '#ef4444' : colors.text,
                },
              ]}
            >
              {myScore}
            </ThemedText>
          </View>

          {/* VS divider */}
          <View style={[styles.vsDivider, { borderTopColor: colors.tabBarBorder }]}>
            <View style={[styles.vsBadge, { backgroundColor: colors.cardElevated }]}>
              <ThemedText style={[styles.vsText, { color: colors.textMuted }]}>VS</ThemedText>
            </View>
          </View>

          {/* Group 2 */}
          <View style={styles.scoreGroupRow}>
            {opponentGroup.avatar_url ? (
              <Image source={{ uri: opponentGroup.avatar_url }} style={styles.scoreAvatar} />
            ) : (
              <View style={[styles.scoreAvatar, { backgroundColor: colors.tint + '20' }]}>
                <ThemedText style={[styles.scoreAvatarText, { color: colors.tint }]}>
                  {getGroupInitials(opponentGroup.name)}
                </ThemedText>
              </View>
            )}
            <ThemedText type="defaultSemiBold" style={[styles.scoreGroupName, { color: colors.text }]} numberOfLines={1}>
              {opponentGroup.name}
            </ThemedText>
            <ThemedText
              style={[
                styles.scoreValue,
                {
                  color: isLosing ? colors.tint : isWinning ? '#ef4444' : colors.text,
                },
              ]}
            >
              {opponentScore}
            </ThemedText>
          </View>
        </View>

        {/* Actions */}
        {canAccept && (
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: colors.tint }]}
              onPress={handleAccept}
              disabled={acting}
            >
              {acting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.actionButtonText}>Accept Challenge</ThemedText>
              )}
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.actionButtonSecondary, { borderColor: colors.tabBarBorder }]}
              onPress={handleCancel}
              disabled={acting}
            >
              <ThemedText style={[styles.actionButtonTextSecondary, { color: colors.textMuted }]}>Decline</ThemedText>
            </Pressable>
          </View>
        )}

        {canCancel && !canAccept && (
          <Pressable
            style={[styles.actionButton, styles.actionButtonSecondary, { borderColor: colors.tabBarBorder }]}
            onPress={handleCancel}
            disabled={acting}
          >
            <ThemedText style={[styles.actionButtonTextSecondary, { color: '#ef4444' }]}>Cancel Challenge</ThemedText>
          </Pressable>
        )}

        {/* Leaderboard — show all members of each group */}
        {(competition.status === 'active' || competition.status === 'completed') && (
          <ThemedView style={styles.leaderboardSection}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Leaderboard
            </ThemedText>

            {/* Group 1 members */}
            <View style={styles.groupLeaderboard}>
              <View style={styles.groupLeaderboardHeader}>
                {competition.group1.avatar_url ? (
                  <Image source={{ uri: competition.group1.avatar_url }} style={styles.groupLeaderboardAvatar} />
                ) : (
                  <View style={[styles.groupLeaderboardAvatar, { backgroundColor: colors.tint + '20' }]}>
                    <ThemedText style={[styles.groupLeaderboardAvatarText, { color: colors.tint }]}>
                      {getGroupInitials(competition.group1.name)}
                    </ThemedText>
                  </View>
                )}
                <ThemedText type="defaultSemiBold" style={[styles.groupLeaderboardName, { color: colors.text }]} numberOfLines={1}>
                  {competition.group1.name}
                </ThemedText>
                <ThemedText style={[styles.groupLeaderboardScore, { color: colors.tint }]}>
                  {competition.group1_score} pts
                </ThemedText>
              </View>
              {(() => {
                // Build a map of contribution points per user
                const contribMap = new Map(
                  group1Contribs.map((c) => [c.user_id, c.points])
                )
                // Merge all members with contribution data, sorted by points desc
                const allMembers = group1Members
                  .map((m) => ({
                    ...m,
                    contrib_points: contribMap.get(m.user_id) ?? 0,
                  }))
                  .sort((a, b) => b.contrib_points - a.contrib_points)

                if (allMembers.length === 0) {
                  return (
                    <ThemedText style={[styles.emptyContribs, { color: colors.textMuted }]}>
                      No members
                    </ThemedText>
                  )
                }

                return allMembers.map((member, idx) => (
                  <View key={member.id} style={[styles.contribRow, { backgroundColor: colors.cardElevated }]}>
                    <ThemedText style={[styles.contribRank, { color: idx < 3 ? colors.tint : colors.textMuted }]}>
                      #{idx + 1}
                    </ThemedText>
                    {member.avatar_url ? (
                      <Image source={{ uri: member.avatar_url }} style={styles.contribAvatar} />
                    ) : (
                      <View style={[styles.contribAvatar, { backgroundColor: colors.tint + '20' }]}>
                        <ThemedText style={[styles.contribAvatarText, { color: colors.tint }]}>
                          {member.display_name?.charAt(0).toUpperCase() ?? '?'}
                        </ThemedText>
                      </View>
                    )}
                    <ThemedText style={[styles.contribName, { color: colors.text }]} numberOfLines={1}>
                      {member.display_name ?? 'Unknown'}
                    </ThemedText>
                    <ThemedText style={[styles.contribPoints, { color: member.contrib_points > 0 ? colors.tint : colors.textMuted }]}>
                      {member.contrib_points} pts
                    </ThemedText>
                  </View>
                ))
              })()}
            </View>

            {/* Group 2 members */}
            <View style={styles.groupLeaderboard}>
              <View style={styles.groupLeaderboardHeader}>
                {competition.group2.avatar_url ? (
                  <Image source={{ uri: competition.group2.avatar_url }} style={styles.groupLeaderboardAvatar} />
                ) : (
                  <View style={[styles.groupLeaderboardAvatar, { backgroundColor: colors.tint + '20' }]}>
                    <ThemedText style={[styles.groupLeaderboardAvatarText, { color: colors.tint }]}>
                      {getGroupInitials(competition.group2.name)}
                    </ThemedText>
                  </View>
                )}
                <ThemedText type="defaultSemiBold" style={[styles.groupLeaderboardName, { color: colors.text }]} numberOfLines={1}>
                  {competition.group2.name}
                </ThemedText>
                <ThemedText style={[styles.groupLeaderboardScore, { color: colors.tint }]}>
                  {competition.group2_score} pts
                </ThemedText>
              </View>
              {(() => {
                const contribMap = new Map(
                  group2Contribs.map((c) => [c.user_id, c.points])
                )
                const allMembers = group2Members
                  .map((m) => ({
                    ...m,
                    contrib_points: contribMap.get(m.user_id) ?? 0,
                  }))
                  .sort((a, b) => b.contrib_points - a.contrib_points)

                if (allMembers.length === 0) {
                  return (
                    <ThemedText style={[styles.emptyContribs, { color: colors.textMuted }]}>
                      No members
                    </ThemedText>
                  )
                }

                return allMembers.map((member, idx) => (
                  <View key={member.id} style={[styles.contribRow, { backgroundColor: colors.cardElevated }]}>
                    <ThemedText style={[styles.contribRank, { color: idx < 3 ? colors.tint : colors.textMuted }]}>
                      #{idx + 1}
                    </ThemedText>
                    {member.avatar_url ? (
                      <Image source={{ uri: member.avatar_url }} style={styles.contribAvatar} />
                    ) : (
                      <View style={[styles.contribAvatar, { backgroundColor: colors.tint + '20' }]}>
                        <ThemedText style={[styles.contribAvatarText, { color: colors.tint }]}>
                          {member.display_name?.charAt(0).toUpperCase() ?? '?'}
                        </ThemedText>
                      </View>
                    )}
                    <ThemedText style={[styles.contribName, { color: colors.text }]} numberOfLines={1}>
                      {member.display_name ?? 'Unknown'}
                    </ThemedText>
                    <ThemedText style={[styles.contribPoints, { color: member.contrib_points > 0 ? colors.tint : colors.textMuted }]}>
                      {member.contrib_points} pts
                    </ThemedText>
                  </View>
                ))
              })()}
            </View>
          </ThemedView>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 15 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusText: { fontSize: 14, fontWeight: '600' },
  scoreCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  scoreGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  scoreAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scoreAvatarText: { fontSize: 20, fontWeight: '700' },
  scoreGroupName: { flex: 1, fontSize: 16 },
  scoreValue: { fontSize: 28, fontWeight: '800', minWidth: 50, textAlign: 'right' },
  vsDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  vsBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: -14,
  },
  vsText: { fontSize: 13, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  actionButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actionButtonTextSecondary: { fontSize: 15, fontWeight: '600' },
  leaderboardSection: { marginTop: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  groupLeaderboard: { marginBottom: 24 },
  groupLeaderboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  groupLeaderboardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groupLeaderboardAvatarText: { fontSize: 16, fontWeight: '700' },
  groupLeaderboardName: { flex: 1, fontSize: 16 },
  groupLeaderboardScore: { fontSize: 16, fontWeight: '700' },
  emptyContribs: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  contribRank: { width: 30, fontSize: 14, fontWeight: '600' },
  contribAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  contribAvatarText: { fontSize: 14, fontWeight: '600' },
  contribName: { flex: 1, fontSize: 15 },
  contribPoints: { fontSize: 15, fontWeight: '700', minWidth: 50, textAlign: 'right' },
})
