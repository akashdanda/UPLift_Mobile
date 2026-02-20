import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  acceptChallenge,
  getActiveCompetitions,
  isInMatchmakingQueue,
  leaveMatchmakingQueue,
  queueForMatchmaking,
  type CompetitionWithGroups,
} from '@/lib/competitions'
import { getFriends, type FriendWithProfile } from '@/lib/friends'
import {
  deleteGroup,
  demoteMember,
  getGroupMembers,
  getGroupMessages,
  getGroupPendingInvites,
  getMemberRole,
  inviteToGroup,
  isMember,
  joinGroup,
  kickMember,
  leaveGroup,
  promoteMember,
  sendGroupMessage,
  type GroupMemberWithProfile,
  type GroupRole,
  type GroupWithMeta,
} from '@/lib/groups'
import { supabase } from '@/lib/supabase'
import type { GroupMessage } from '@/types/group'

const SCREEN_WIDTH = Dimensions.get('window').width
const BANNER_HEIGHT = 180

type DetailTab = 'overview' | 'members' | 'chat' | 'competitions'

function getGroupInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatMessageTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session, refreshProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [group, setGroup] = useState<GroupWithMeta | null>(null)
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([])
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [isUserMember, setIsUserMember] = useState(false)
  const [userRole, setUserRole] = useState<GroupRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [activeCompetitions, setActiveCompetitions] = useState<CompetitionWithGroups[]>([])
  const [inQueue, setInQueue] = useState(false)
  const [loadingCompetitions, setLoadingCompetitions] = useState(false)

  const [inviteModalVisible, setInviteModalVisible] = useState(false)
  const [inviteFriends, setInviteFriends] = useState<FriendWithProfile[]>([])
  const [invitePendingIds, setInvitePendingIds] = useState<Set<string>>(new Set())
  const [inviteSendingId, setInviteSendingId] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)

  const chatScrollRef = useRef<ScrollView>(null)
  const userId = session?.user?.id ?? ''

  const loadGroup = useCallback(async () => {
    if (!id || !userId) return
    setLoading(true)

    try {
      const { data: groupData } = await supabase.from('groups').select('*').eq('id', id).single()
      if (!groupData) {
        Alert.alert('Error', 'Group not found')
        router.back()
        return
      }

      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', id)

      setGroup({ ...groupData, member_count: count ?? 0 } as GroupWithMeta)

      const [member, role] = await Promise.all([
        isMember(userId, id),
        getMemberRole(id, userId),
      ])
      setIsUserMember(member)
      setUserRole(role)

      // Always load members for display
      const membersData = await getGroupMembers(id)
      setMembers(membersData)

      if (member) {
        const messagesData = await getGroupMessages(id)
        setMessages(messagesData.reverse())
      }

      // Load competitions if user is member
      if (member) {
        const [competitions, queued] = await Promise.all([
          getActiveCompetitions(id),
          isInMatchmakingQueue(id),
        ])
        setActiveCompetitions(competitions)
        setInQueue(queued)
      }
    } catch {
      Alert.alert('Error', 'Failed to load group')
    } finally {
      setLoading(false)
    }
  }, [id, userId])

  useFocusEffect(
    useCallback(() => {
      void loadGroup()
    }, [loadGroup])
  )

  // Realtime messages
  useEffect(() => {
    if (!isUserMember || !id) return

    const channel = supabase
      .channel(`group:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${id}`,
        },
        (payload) => {
          const newMessage = payload.new as GroupMessage
          setMessages((prev) => [...prev, newMessage])
          setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isUserMember, id])

  const handleJoin = async () => {
    if (!userId || !id) return
    setJoining(true)
    const { error } = await joinGroup(userId, id)
    setJoining(false)
    if (error) Alert.alert('Error', error.message)
    else {
      await refreshProfile()
      void loadGroup()
    }
  }

  const handleLeave = () => {
    if (!userId || !id) return
    Alert.alert('Leave group', `Leave "${group?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const { error } = await leaveGroup(userId, id)
          if (error) Alert.alert('Error', error.message)
          else {
            await refreshProfile()
            router.back()
          }
        },
      },
    ])
  }

  const handleDelete = () => {
    if (!userId || !id) return
    Alert.alert('Delete group', `Permanently delete "${group?.name}"? All members will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteGroup(userId, id)
          if (error) Alert.alert('Error', error.message)
          else {
            await refreshProfile()
            router.back()
          }
        },
      },
    ])
  }

  const handleShare = async () => {
    if (!group || !id) return
    const url = Linking.createURL(`/group-detail?id=${id}`)
    try {
      await Share.share({
        message: `Check out "${group.name}" on Uplift!\n\n${url}`,
      })
    } catch {}
  }

  const handleOpenInvite = async () => {
    if (!userId || !id) return
    setInviteModalVisible(true)
    setInviteLoading(true)
    try {
      const [friends, pendingIds] = await Promise.all([
        getFriends(userId),
        getGroupPendingInvites(id),
      ])
      const memberIds = new Set(members.map((m) => m.user_id))
      const pendingSet = new Set(pendingIds)
      setInviteFriends(friends.filter((f) => !memberIds.has(f.id)))
      setInvitePendingIds(pendingSet)
    } catch {
      Alert.alert('Error', 'Failed to load friends')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleSendInvite = async (friendId: string) => {
    if (!userId || !id) return
    setInviteSendingId(friendId)
    const { error } = await inviteToGroup(id, userId, friendId)
    setInviteSendingId(null)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setInvitePendingIds((prev) => new Set([...prev, friendId]))
    }
  }

  const handleSendMessage = async () => {
    if (!messageText.trim() || !isUserMember || !id || !userId) return
    setSending(true)
    const { error } = await sendGroupMessage(userId, id, messageText)
    setSending(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setMessageText('')
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100)
    }
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

  if (!group) return null

  const isOwner = userRole === 'owner'
  const isAdmin = userRole === 'admin'
  const isStaff = isOwner || isAdmin // owner or admin

  const handleMemberAction = (member: GroupMemberWithProfile) => {
    if (!isStaff || member.user_id === userId) return // can't act on yourself

    const memberRole = member.role as GroupRole

    // Build action options
    const options: Array<{ text: string; onPress: () => void; style?: 'destructive' | 'cancel' }> = []

    if (memberRole === 'owner') {
      // Nobody can act on the owner
      return
    }

    if (memberRole === 'member') {
      options.push({
        text: '⬆️ Promote to Admin',
        onPress: async () => {
          const { error } = await promoteMember(id, userId, member.user_id)
          if (error) Alert.alert('Error', error.message)
          else void loadGroup()
        },
      })
    }

    if (memberRole === 'admin' && isOwner) {
      options.push({
        text: '⬇️ Demote to Member',
        onPress: async () => {
          const { error } = await demoteMember(id, userId, member.user_id)
          if (error) Alert.alert('Error', error.message)
          else void loadGroup()
        },
      })
    }

    // Kick option (owner can kick anyone except owner; admin can kick members only)
    if (isOwner || (isAdmin && memberRole === 'member')) {
      options.push({
        text: '🚫 Kick from Group',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Kick Member',
            `Remove ${member.display_name ?? 'this user'} from the group?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Kick',
                style: 'destructive',
                onPress: async () => {
                  const { error } = await kickMember(id, userId, member.user_id)
                  if (error) Alert.alert('Error', error.message)
                  else void loadGroup()
                },
              },
            ]
          )
        },
      })
    }

    options.push({ text: 'Cancel', style: 'cancel', onPress: () => {} })

    Alert.alert(
      member.display_name ?? 'Member',
      `Role: ${memberRole.charAt(0).toUpperCase() + memberRole.slice(1)}`,
      options
    )
  }

  // Action buttons for the horizontal scroll (Compete is now separate and prominent)
  const actionButtons = [
    ...(isUserMember
      ? [{ key: 'leave', icon: 'exit-outline' as const, label: 'Leave', color: '#ef4444', onPress: handleLeave }]
      : [{ key: 'join', icon: 'people-outline' as const, label: 'Join', color: colors.tint, onPress: handleJoin }]),
    { key: 'overview', icon: 'information-circle-outline' as const, label: 'Overview', color: colors.textMuted, onPress: () => setActiveTab('overview') },
    { key: 'members', icon: 'people-outline' as const, label: 'Members', color: colors.textMuted, onPress: () => setActiveTab('members') },
    ...(isUserMember
      ? [
          { key: 'invite', icon: 'person-add-outline' as const, label: 'Invite', color: colors.tint, onPress: handleOpenInvite },
          { key: 'chat', icon: 'chatbubbles-outline' as const, label: 'Chat', color: colors.textMuted, onPress: () => setActiveTab('chat') },
        ]
      : []),
    { key: 'share', icon: 'share-outline' as const, label: 'Share', color: colors.textMuted, onPress: handleShare },
    ...(isStaff
      ? [
          { key: 'settings', icon: 'settings-outline' as const, label: 'Settings', color: colors.textMuted, onPress: () => router.push(`/group-settings?id=${id}`) },
        ]
      : []),
    ...(isOwner
      ? [
          { key: 'delete', icon: 'trash-outline' as const, label: 'Delete', color: '#ef4444', onPress: handleDelete },
        ]
      : []),
  ]

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Banner */}
          <View style={[styles.banner, { backgroundColor: colors.tint + '25' }]}>
            {group.avatar_url && (
              <Image
                source={{ uri: group.avatar_url }}
                style={styles.bannerImage}
                contentFit="cover"
              />
            )}
            {/* Overlay gradient effect */}
            <View style={[styles.bannerOverlay, { backgroundColor: colors.background }]} />
          </View>

          {/* Profile picture overlapping banner */}
          <View style={styles.profileSection}>
            <View style={[styles.avatarContainer, { borderColor: colors.background }]}>
              {group.avatar_url ? (
                <Image source={{ uri: group.avatar_url }} style={styles.groupAvatar} />
              ) : (
                <View style={[styles.groupAvatarPlaceholder, { backgroundColor: colors.card }]}>
                  <ThemedText style={[styles.groupAvatarText, { color: colors.tint }]}>
                    {getGroupInitials(group.name)}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>

          {/* Group Info */}
          <View style={styles.infoSection}>
            <ThemedText type="title" style={[styles.groupName, { color: colors.text }]}>
              {group.name}
            </ThemedText>

            {/* Meta row: tags, members, visibility */}
            <View style={styles.metaRow}>
              {group.tags && group.tags.length > 0 && (
                <View style={styles.metaItem}>
                  <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
                  <ThemedText style={[styles.metaText, { color: colors.textMuted }]}>
                    {group.tags.join(', ')}
                  </ThemedText>
                </View>
              )}
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                <ThemedText style={[styles.metaText, { color: colors.textMuted }]}>
                  {group.member_count ?? 0} Member{(group.member_count ?? 0) !== 1 ? 's' : ''}
                </ThemedText>
              </View>
              <View style={styles.metaItem}>
                <Ionicons
                  name={group.is_public ? 'globe-outline' : 'lock-closed-outline'}
                  size={14}
                  color={colors.textMuted}
                />
                <ThemedText style={[styles.metaText, { color: colors.textMuted }]}>
                  {group.is_public ? 'Public' : 'Private'}
                </ThemedText>
              </View>
            </View>
            {group.location && (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                <ThemedText style={[styles.locationText, { color: colors.textMuted }]}>
                  {group.location}
                </ThemedText>
              </View>
            )}

            {/* Description */}
            {group.description && (
              <ThemedText style={[styles.description, { color: colors.text }]} numberOfLines={3}>
                {group.description}
              </ThemedText>
            )}

          </View>

          {/* Prominent Compete Button (only for members) */}
          {isUserMember && (
            <View style={styles.competeButtonContainer}>
              <Pressable
                style={[styles.competeButton, { backgroundColor: colors.tint }]}
                onPress={() => setActiveTab(activeTab === 'competitions' ? 'overview' : 'competitions')}
              >
                <Ionicons name="trophy" size={28} color="#fff" />
                <ThemedText style={styles.competeButtonText}>Compete</ThemedText>
              </Pressable>
            </View>
          )}

          {/* Action buttons row (horizontal scroll) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionsScroll}
            style={[styles.actionsContainer, { borderBottomColor: colors.tabBarBorder }]}
          >
            {actionButtons.map((btn) => {
              const isActive =
                (btn.key === 'overview' && activeTab === 'overview') ||
                (btn.key === 'members' && activeTab === 'members') ||
                (btn.key === 'chat' && activeTab === 'chat') ||
                (btn.key === 'competitions' && activeTab === 'competitions')

              return (
                <Pressable
                  key={btn.key}
                  style={styles.actionBtn}
                  onPress={btn.onPress}
                  disabled={btn.key === 'join' && joining}
                >
                  <View
                    style={[
                      styles.actionBtnCircle,
                      {
                        backgroundColor: isActive ? colors.tint + '20' : colors.card,
                      },
                    ]}
                  >
                    {btn.key === 'join' && joining ? (
                      <ActivityIndicator color={colors.tint} size="small" />
                    ) : (
                      <Ionicons
                        name={btn.icon}
                        size={22}
                        color={isActive ? colors.tint : btn.color}
                      />
                    )}
                  </View>
                  <ThemedText
                    style={[
                      styles.actionBtnLabel,
                      { color: isActive ? colors.tint : btn.color },
                    ]}
                  >
                    {btn.label}
                  </ThemedText>
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Tab content */}
          {activeTab === 'overview' && (
            <ThemedView style={styles.tabContent}>
              {/* About */}
              {group.description && (
                <View style={styles.aboutSection}>
                  <ThemedText type="subtitle" style={[styles.contentSectionTitle, { color: colors.text }]}>
                    About
                  </ThemedText>
                  <ThemedText style={[styles.aboutText, { color: colors.text }]}>
                    {group.description}
                  </ThemedText>
                </View>
              )}

              {/* Tags */}
              {group.tags && group.tags.length > 0 && (
                <View style={styles.tagsSection}>
                  <ThemedText type="subtitle" style={[styles.contentSectionTitle, { color: colors.text }]}>
                    Tags
                  </ThemedText>
                  <View style={styles.tagsWrap}>
                    {group.tags.map((tag, idx) => (
                      <View key={idx} style={[styles.tagChip, { backgroundColor: colors.tint + '15' }]}>
                        <ThemedText style={[styles.tagChipText, { color: colors.tint }]}>{tag}</ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Quick members preview */}
              <View style={styles.membersPreview}>
                <View style={styles.memberPreviewHeader}>
                  <ThemedText type="subtitle" style={[styles.contentSectionTitle, { color: colors.text }]}>
                    Members ({members.length})
                  </ThemedText>
                  <Pressable onPress={() => setActiveTab('members')}>
                    <ThemedText style={[styles.seeAllLink, { color: colors.tint }]}>See all</ThemedText>
                  </Pressable>
                </View>
                <View style={styles.memberAvatarsRow}>
                  {members.slice(0, 6).map((m) => (
                    <View key={m.id} style={styles.memberAvatarPreviewWrap}>
                      {m.avatar_url ? (
                        <Image source={{ uri: m.avatar_url }} style={styles.memberAvatarPreview} />
                      ) : (
                        <View style={[styles.memberAvatarPreview, { backgroundColor: colors.tint + '20' }]}>
                          <ThemedText style={[styles.memberPreviewInitial, { color: colors.tint }]}>
                            {m.display_name?.charAt(0).toUpperCase() ?? '?'}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  ))}
                  {members.length > 6 && (
                    <View style={[styles.memberAvatarPreview, { backgroundColor: colors.cardElevated }]}>
                      <ThemedText style={[styles.memberPreviewMore, { color: colors.textMuted }]}>
                        +{members.length - 6}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </View>
            </ThemedView>
          )}

          {activeTab === 'members' && (
            <ThemedView style={styles.tabContent}>
              <ThemedText type="subtitle" style={[styles.contentSectionTitle, { color: colors.text }]}>
                Members ({members.length})
              </ThemedText>
              {members.length === 0 ? (
                <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>No members yet</ThemedText>
              ) : (
                <View style={styles.membersList}>
                  {members.map((member, idx) => {
                    const mRole = member.role as GroupRole
                    const canTap = isStaff && member.user_id !== userId && mRole !== 'owner'
                    const roleBadge =
                      mRole === 'owner'
                        ? { label: 'Owner', color: '#f59e0b' }
                        : mRole === 'admin'
                        ? { label: 'Admin', color: colors.tint }
                        : null

                    return (
                      <Pressable
                        key={member.id}
                        style={({ pressed }) => [
                          styles.memberCard,
                          { backgroundColor: colors.card },
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => {
                          if (member.user_id === userId) {
                            router.push('/(tabs)/profile')
                          } else {
                            router.push({ pathname: '/friend-profile', params: { id: member.user_id } })
                          }
                        }}
                      >
                        <View style={styles.memberRankWrap}>
                          <ThemedText
                            style={[
                              styles.memberRankNum,
                              {
                                color:
                                  idx === 0
                                    ? colors.gold
                                    : idx === 1
                                    ? colors.silver
                                    : idx === 2
                                    ? colors.bronze
                                    : colors.textMuted,
                              },
                            ]}
                          >
                            #{idx + 1}
                          </ThemedText>
                        </View>
                        {member.avatar_url ? (
                          <Image source={{ uri: member.avatar_url }} style={styles.memberAvatar} />
                        ) : (
                          <View style={[styles.memberAvatar, { backgroundColor: colors.tint + '20' }]}>
                            <ThemedText style={[styles.memberAvatarInitials, { color: colors.tint }]}>
                              {member.display_name?.charAt(0).toUpperCase() ?? '?'}
                            </ThemedText>
                          </View>
                        )}
                        <View style={styles.memberCardInfo}>
                          <View style={styles.memberNameRow}>
                            <ThemedText type="defaultSemiBold" style={[styles.memberCardName, { color: colors.text }]}>
                              {member.display_name ?? 'Unknown'}
                            </ThemedText>
                            {roleBadge && (
                              <View style={[styles.roleBadge, { backgroundColor: roleBadge.color + '20' }]}>
                                <ThemedText style={[styles.roleBadgeText, { color: roleBadge.color }]}>
                                  {roleBadge.label}
                                </ThemedText>
                              </View>
                            )}
                          </View>
                          <ThemedText style={[styles.memberCardStats, { color: colors.textMuted }]}>
                            {member.points} pts · {member.workouts_count} workouts
                          </ThemedText>
                        </View>
                        {canTap && (
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation()
                              handleMemberAction(member)
                            }}
                            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                          >
                            <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                          </Pressable>
                        )}
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </ThemedView>
          )}

          {activeTab === 'chat' && isUserMember && (
            <ThemedView style={styles.tabContent}>
              <ThemedText type="subtitle" style={[styles.contentSectionTitle, { color: colors.text }]}>
                Group Chat
              </ThemedText>
              <View style={[styles.chatContainer, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
                <ScrollView
                  ref={chatScrollRef}
                  style={styles.chatMessagesList}
                  nestedScrollEnabled
                  onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
                >
                  {messages.length === 0 ? (
                    <View style={styles.chatEmptyWrap}>
                      <Ionicons name="chatbubbles-outline" size={32} color={colors.textMuted + '50'} />
                      <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                        No messages yet. Start the conversation!
                      </ThemedText>
                    </View>
                  ) : (
                    messages.map((msg) => {
                      const isOwn = msg.user_id === userId
                      const sender = members.find((m) => m.user_id === msg.user_id)
                      return (
                        <View key={msg.id} style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
                          {!isOwn && (
                            <ThemedText style={[styles.msgSender, { color: colors.tint }]}>
                              {sender?.display_name ?? 'Unknown'}
                            </ThemedText>
                          )}
                          <View
                            style={[
                              styles.msgBubble,
                              isOwn
                                ? { backgroundColor: colors.tint, alignSelf: 'flex-end' }
                                : { backgroundColor: colors.cardElevated, alignSelf: 'flex-start' },
                            ]}
                          >
                            <ThemedText style={[styles.msgText, { color: isOwn ? '#fff' : colors.text }]}>
                              {msg.message}
                            </ThemedText>
                          </View>
                          <ThemedText style={[styles.msgTime, { color: colors.textMuted, alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
                            {formatMessageTime(msg.created_at)}
                          </ThemedText>
                        </View>
                      )
                    })
                  )}
                </ScrollView>
                <View style={[styles.chatInputRow, { borderTopColor: colors.tabBarBorder }]}>
                  <TextInput
                    style={[
                      styles.chatInput,
                      { backgroundColor: colors.background, color: colors.text, borderColor: colors.tabBarBorder },
                    ]}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.textMuted}
                    value={messageText}
                    onChangeText={setMessageText}
                    multiline
                    editable={!sending}
                  />
                  <Pressable
                    style={[styles.sendBtn, { backgroundColor: colors.tint, opacity: !messageText.trim() || sending ? 0.5 : 1 }]}
                    onPress={handleSendMessage}
                    disabled={!messageText.trim() || sending}
                  >
                    {sending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="send" size={18} color="#fff" />
                    )}
                  </Pressable>
                </View>
              </View>
            </ThemedView>
          )}

          {activeTab === 'competitions' && isUserMember && (
            <ThemedView style={styles.tabContent}>
              <ThemedText type="subtitle" style={[styles.contentSectionTitle, { color: colors.text }]}>
                Compete
              </ThemedText>

              {/* Matchmaking queue status */}
              {isStaff && (
                <View style={[styles.competitionCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
                  <ThemedText type="defaultSemiBold" style={[styles.competitionCardTitle, { color: colors.text }]}>
                    Matchmaking
                  </ThemedText>
                  <ThemedText style={[styles.competitionCardDesc, { color: colors.textMuted }]}>
                    Queue your group to be automatically matched with another group
                  </ThemedText>
                  {inQueue ? (
                    <View style={styles.queueStatusRow}>
                      <ActivityIndicator size="small" color={colors.tint} />
                      <ThemedText style={[styles.queueStatusText, { color: colors.tint }]}>
                        In queue... Waiting for match
                      </ThemedText>
                    </View>
                  ) : null}
                  <Pressable
                    style={[
                      styles.competitionButton,
                      { backgroundColor: inQueue ? colors.cardElevated : colors.tint },
                    ]}
                    onPress={async () => {
                      if (!id || !userId) return
                      if (inQueue) {
                        const { error } = await leaveMatchmakingQueue(id, userId)
                        if (error) Alert.alert('Error', error.message)
                        else {
                          setInQueue(false)
                          void loadGroup()
                        }
                      } else {
                        const { error } = await queueForMatchmaking(id, userId)
                        if (error) Alert.alert('Error', error.message)
                        else {
                          setInQueue(true)
                          void loadGroup()
                        }
                      }
                    }}
                  >
                    <ThemedText
                      style={[
                        styles.competitionButtonText,
                        { color: inQueue ? colors.textMuted : '#fff' },
                      ]}
                    >
                      {inQueue ? 'Leave Queue' : 'Queue for Matchmaking'}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.competitionButtonSecondary, { borderColor: colors.tabBarBorder }]}
                    onPress={() => router.push(`/challenge-group?groupId=${id}`)}
                  >
                    <ThemedText style={[styles.competitionButtonTextSecondary, { color: colors.text }]}>
                      Challenge a Group
                    </ThemedText>
                  </Pressable>
                </View>
              )}

              {/* Active competitions */}
              {activeCompetitions.length > 0 && (
                <View style={styles.competitionsList}>
                  <ThemedText type="defaultSemiBold" style={[styles.competitionSectionTitle, { color: colors.text }]}>
                    Active Competitions
                  </ThemedText>
                  {activeCompetitions.map((comp) => {
                    const isGroup1 = comp.group1_id === id
                    const opponent = isGroup1 ? comp.group2 : comp.group1
                    const myScore = isGroup1 ? comp.group1_score : comp.group2_score
                    const opponentScore = isGroup1 ? comp.group2_score : comp.group1_score
                    const isWinning = myScore > opponentScore
                    const isLosing = myScore < opponentScore

                    return (
                      <Pressable
                        key={comp.id}
                        style={[styles.competitionItem, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}
                        onPress={() => router.push(`/competition-detail?id=${comp.id}`)}
                      >
                        <View style={styles.competitionHeader}>
                          <View style={styles.competitionGroupInfo}>
                            {opponent.avatar_url ? (
                              <Image source={{ uri: opponent.avatar_url }} style={styles.competitionOpponentAvatar} />
                            ) : (
                              <View style={[styles.competitionOpponentAvatar, { backgroundColor: colors.tint + '20' }]}>
                                <ThemedText style={[styles.competitionOpponentInitials, { color: colors.tint }]}>
                                  {opponent.name.slice(0, 2).toUpperCase()}
                                </ThemedText>
                              </View>
                            )}
                            <View>
                              <ThemedText type="defaultSemiBold" style={[styles.competitionOpponentName, { color: colors.text }]}>
                                vs {opponent.name}
                              </ThemedText>
                              <ThemedText style={[styles.competitionType, { color: colors.textMuted }]}>
                                {comp.type === 'matchmaking' ? 'Auto-matched' : 'Direct Challenge'}
                              </ThemedText>
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                        </View>
                        <View style={styles.competitionScoreRow}>
                          <View style={styles.competitionScoreBox}>
                            <ThemedText style={[styles.competitionScoreLabel, { color: colors.textMuted }]}>Your Score</ThemedText>
                            <ThemedText
                              style={[
                                styles.competitionScoreValue,
                                {
                                  color: isWinning ? colors.tint : isLosing ? '#ef4444' : colors.text,
                                },
                              ]}
                            >
                              {myScore}
                            </ThemedText>
                          </View>
                          <View style={styles.competitionScoreBox}>
                            <ThemedText style={[styles.competitionScoreLabel, { color: colors.textMuted }]}>Opponent</ThemedText>
                            <ThemedText
                              style={[
                                styles.competitionScoreValue,
                                {
                                  color: isLosing ? colors.tint : isWinning ? '#ef4444' : colors.text,
                                },
                              ]}
                            >
                              {opponentScore}
                            </ThemedText>
                          </View>
                        </View>
                        {comp.status === 'pending' && comp.type === 'challenge' && isStaff && (
                          <View style={styles.competitionPendingActions}>
                            <Pressable
                              style={[styles.competitionAcceptBtn, { backgroundColor: colors.tint }]}
                              onPress={async () => {
                                const { error } = await acceptChallenge(comp.id, userId)
                                if (error) Alert.alert('Error', error.message)
                                else void loadGroup()
                              }}
                            >
                              <ThemedText style={styles.competitionAcceptBtnText}>Accept Challenge</ThemedText>
                            </Pressable>
                          </View>
                        )}
                      </Pressable>
                    )
                  })}
                </View>
              )}

              {activeCompetitions.length === 0 && !inQueue && (
                <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                  <Ionicons name="trophy-outline" size={40} color={colors.textMuted + '50'} style={{ marginBottom: 12 }} />
                  <ThemedText type="defaultSemiBold" style={[styles.emptyTitle, { color: colors.text }]}>
                    No active competitions
                  </ThemedText>
                  <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                    {isStaff
                      ? 'Queue for matchmaking or challenge another group to start competing!'
                      : 'Your group owner or admin can start a competition by queuing for matchmaking or challenging another group.'}
                  </ThemedText>
                </View>
              )}
            </ThemedView>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Invite Friends Modal */}
      <Modal
        visible={inviteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <Pressable style={styles.inviteOverlay} onPress={() => setInviteModalVisible(false)}>
          <Pressable style={[styles.inviteSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.inviteHandle} />
            <ThemedText type="subtitle" style={[styles.inviteTitle, { color: colors.text }]}>
              Invite Friends
            </ThemedText>
            <ThemedText style={[styles.inviteSubtitle, { color: colors.textMuted }]}>
              Select friends to invite to {group?.name}
            </ThemedText>

            {inviteLoading ? (
              <View style={styles.inviteCentered}>
                <ActivityIndicator size="large" color={colors.tint} />
              </View>
            ) : inviteFriends.length === 0 ? (
              <View style={styles.inviteCentered}>
                <Ionicons name="people-outline" size={36} color={colors.textMuted + '50'} />
                <ThemedText style={[styles.inviteEmptyText, { color: colors.textMuted }]}>
                  No friends to invite — they may already be members
                </ThemedText>
              </View>
            ) : (
              <ScrollView style={styles.inviteList} showsVerticalScrollIndicator={false}>
                {inviteFriends.map((friend) => {
                  const isPending = invitePendingIds.has(friend.id)
                  const isSending = inviteSendingId === friend.id
                  return (
                    <View key={friend.id} style={[styles.inviteRow, { borderBottomColor: colors.tabBarBorder }]}>
                      <View style={styles.inviteRowLeft}>
                        {friend.avatar_url ? (
                          <Image source={{ uri: friend.avatar_url }} style={styles.inviteAvatar} />
                        ) : (
                          <View style={[styles.inviteAvatar, { backgroundColor: colors.tint + '20' }]}>
                            <ThemedText style={[styles.inviteAvatarInitial, { color: colors.tint }]}>
                              {friend.display_name?.charAt(0).toUpperCase() ?? '?'}
                            </ThemedText>
                          </View>
                        )}
                        <ThemedText type="defaultSemiBold" style={[styles.inviteName, { color: colors.text }]}>
                          {friend.display_name ?? 'Unknown'}
                        </ThemedText>
                      </View>
                      {isPending ? (
                        <View style={[styles.inviteSentBadge, { backgroundColor: colors.textMuted + '15' }]}>
                          <Ionicons name="checkmark" size={14} color={colors.textMuted} />
                          <ThemedText style={[styles.inviteSentText, { color: colors.textMuted }]}>Sent</ThemedText>
                        </View>
                      ) : (
                        <Pressable
                          style={[styles.inviteBtn, { backgroundColor: colors.tint }]}
                          onPress={() => handleSendInvite(friend.id)}
                          disabled={isSending}
                        >
                          {isSending ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <ThemedText style={styles.inviteBtnText}>Invite</ThemedText>
                          )}
                        </Pressable>
                      )}
                    </View>
                  )
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Banner
  banner: {
    width: SCREEN_WIDTH,
    height: BANNER_HEIGHT,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    opacity: 0.7,
  },

  // Profile picture
  profileSection: {
    alignItems: 'flex-start',
    marginTop: -45,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  avatarContainer: {
    borderWidth: 4,
    borderRadius: 18,
    overflow: 'hidden',
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 14,
  },
  groupAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarText: { fontSize: 28, fontWeight: '700' },

  // Info
  infoSection: { paddingHorizontal: 20, marginBottom: 16 },
  groupName: { fontSize: 24, fontWeight: '800', marginBottom: 10, letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  locationText: { fontSize: 13, fontWeight: '600' },
  description: { fontSize: 14, lineHeight: 21, marginBottom: 4, letterSpacing: 0.1 },

  // Prominent Compete Button
  competeButtonContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  competeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  competeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  competeButtonActiveIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },

  // Action buttons
  actionsContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  actionsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 20,
  },
  actionBtn: { alignItems: 'center', width: 64 },
  actionBtnCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionBtnLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },

  // Tab content
  tabContent: { paddingHorizontal: 20, paddingTop: 16 },
  contentSectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Overview
  aboutSection: { marginBottom: 20 },
  aboutText: { fontSize: 14, lineHeight: 21, letterSpacing: 0.1 },
  tagsSection: { marginBottom: 20 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12 },
  tagChipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },

  // Member preview
  membersPreview: { marginBottom: 20 },
  memberPreviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAllLink: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  memberAvatarsRow: { flexDirection: 'row', gap: 8 },
  memberAvatarPreviewWrap: {},
  memberAvatarPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberPreviewInitial: { fontSize: 16, fontWeight: '600' },
  memberPreviewMore: { fontSize: 12, fontWeight: '700' },

  // Members list
  membersList: { gap: 8 },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  memberRankWrap: { width: 36, alignItems: 'center' },
  memberRankNum: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberAvatarInitials: { fontSize: 18, fontWeight: '600' },
  memberCardInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  memberCardName: { fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
  memberCardStats: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Chat
  chatContainer: {
    borderRadius: 16,
    borderWidth: 1,
    height: 420,
    overflow: 'hidden',
  },
  chatMessagesList: {
    flex: 1,
    padding: 16,
  },
  chatEmptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  msgRow: { marginBottom: 14 },
  msgRowOwn: { alignItems: 'flex-end' },
  msgSender: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 4, letterSpacing: 0.2 },
  msgBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '78%',
  },
  msgText: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  msgTime: { fontSize: 10, marginTop: 3, marginHorizontal: 4 },
  chatInputRow: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    gap: 8,
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  emptyTitle: { fontSize: 18, marginBottom: 6 },
  emptyCard: { padding: 24, borderRadius: 16, alignItems: 'center' },

  // Competitions
  competitionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  competitionCardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4, letterSpacing: -0.2 },
  competitionCardDesc: { fontSize: 13, lineHeight: 19, marginBottom: 12, letterSpacing: 0.1 },
  queueStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  queueStatusText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  competitionButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  competitionButtonText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
  competitionButtonSecondary: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  competitionButtonTextSecondary: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  competitionsList: { marginTop: 8 },
  competitionSectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  competitionItem: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  competitionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  competitionGroupInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  competitionOpponentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  competitionOpponentInitials: { fontSize: 16, fontWeight: '700' },
  competitionOpponentName: { fontSize: 15, fontWeight: '700', marginBottom: 2, letterSpacing: 0.1 },
  competitionType: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, textTransform: 'uppercase' },
  competitionScoreRow: {
    flexDirection: 'row',
    gap: 12,
  },
  competitionScoreBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  competitionScoreLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' },
  competitionScoreValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  competitionPendingActions: { marginTop: 12 },
  competitionAcceptBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  competitionAcceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Invite modal
  inviteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  inviteSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  inviteHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  inviteTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  inviteSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.1,
  },
  inviteCentered: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  inviteEmptyText: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 20,
  },
  inviteList: {
    flexGrow: 0,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inviteRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  inviteAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inviteAvatarInitial: { fontSize: 16, fontWeight: '700' },
  inviteName: { fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
  inviteBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  inviteSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  inviteSentText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
