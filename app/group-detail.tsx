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
  deleteGroup,
  getGroupMembers,
  getGroupMessages,
  isMember,
  joinGroup,
  leaveGroup,
  sendGroupMessage,
  type GroupMemberWithProfile,
  type GroupWithMeta,
} from '@/lib/groups'
import {
  acceptChallenge,
  getActiveCompetitions,
  isInMatchmakingQueue,
  leaveMatchmakingQueue,
  queueForMatchmaking,
  type CompetitionWithGroups,
} from '@/lib/competitions'
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
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [activeCompetitions, setActiveCompetitions] = useState<CompetitionWithGroups[]>([])
  const [inQueue, setInQueue] = useState(false)
  const [loadingCompetitions, setLoadingCompetitions] = useState(false)

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

      const member = await isMember(userId, id)
      setIsUserMember(member)

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
            void loadGroup()
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
        message: `Check out "${group.name}" on UPLift!\n\n${url}`,
      })
    } catch {}
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

  const isCreator = group.created_by === userId

  // Action buttons for the horizontal scroll
  const actionButtons = [
    ...(isUserMember
      ? [{ key: 'leave', icon: 'exit-outline' as const, label: 'Leave', color: '#ef4444', onPress: handleLeave }]
      : [{ key: 'join', icon: 'people-outline' as const, label: 'Join', color: colors.tint, onPress: handleJoin }]),
    { key: 'overview', icon: 'information-circle-outline' as const, label: 'Overview', color: colors.textMuted, onPress: () => setActiveTab('overview') },
    { key: 'members', icon: 'people-outline' as const, label: 'Members', color: colors.textMuted, onPress: () => setActiveTab('members') },
    ...(isUserMember
      ? [
          { key: 'chat', icon: 'chatbubbles-outline' as const, label: 'Chat', color: colors.textMuted, onPress: () => setActiveTab('chat') },
          { key: 'competitions', icon: 'trophy-outline' as const, label: 'Compete', color: colors.textMuted, onPress: () => setActiveTab('competitions') },
        ]
      : []),
    { key: 'share', icon: 'share-outline' as const, label: 'Share', color: colors.textMuted, onPress: handleShare },
    ...(isCreator
      ? [
          { key: 'settings', icon: 'settings-outline' as const, label: 'Settings', color: colors.textMuted, onPress: () => router.push(`/group-settings?id=${id}`) },
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
                  {members.map((member, idx) => (
                    <View
                      key={member.id}
                      style={[styles.memberCard, { backgroundColor: colors.card }]}
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
                        <ThemedText type="defaultSemiBold" style={[styles.memberCardName, { color: colors.text }]}>
                          {member.display_name ?? 'Unknown'}
                        </ThemedText>
                        <ThemedText style={[styles.memberCardStats, { color: colors.textMuted }]}>
                          {member.points} pts · {member.workouts_count} workouts
                        </ThemedText>
                      </View>
                    </View>
                  ))}
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
              {isCreator && (
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
                        {comp.status === 'pending' && comp.type === 'challenge' && isCreator && (
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
                    {isCreator
                      ? 'Queue for matchmaking or challenge another group to start competing!'
                      : 'Your group leader can start a competition by queuing for matchmaking or challenging another group.'}
                  </ThemedText>
                </View>
              )}
            </ThemedView>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  groupName: { fontSize: 26, fontWeight: '800', marginBottom: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  locationText: { fontSize: 14 },
  description: { fontSize: 15, lineHeight: 22, marginBottom: 4 },

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
  actionBtnLabel: { fontSize: 11, fontWeight: '600' },

  // Tab content
  tabContent: { paddingHorizontal: 20, paddingTop: 16 },
  contentSectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },

  // Overview
  aboutSection: { marginBottom: 20 },
  aboutText: { fontSize: 15, lineHeight: 22 },
  tagsSection: { marginBottom: 20 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  tagChipText: { fontSize: 13, fontWeight: '600' },

  // Member preview
  membersPreview: { marginBottom: 20 },
  memberPreviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAllLink: { fontSize: 14, fontWeight: '600' },
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
  memberRankNum: { fontSize: 16, fontWeight: '800' },
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
  memberCardName: { fontSize: 16, marginBottom: 2 },
  memberCardStats: { fontSize: 13 },

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
  msgSender: { fontSize: 12, fontWeight: '600', marginBottom: 3, marginLeft: 4 },
  msgBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '78%',
  },
  msgText: { fontSize: 15, lineHeight: 20 },
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
  competitionCardTitle: { fontSize: 18, marginBottom: 4 },
  competitionCardDesc: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  queueStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  queueStatusText: { fontSize: 14, fontWeight: '600' },
  competitionButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  competitionButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  competitionButtonSecondary: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  competitionButtonTextSecondary: { fontSize: 15, fontWeight: '600' },
  competitionsList: { marginTop: 8 },
  competitionSectionTitle: { fontSize: 16, marginBottom: 12 },
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
  competitionOpponentName: { fontSize: 16, marginBottom: 2 },
  competitionType: { fontSize: 12 },
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
  competitionScoreLabel: { fontSize: 12, marginBottom: 4 },
  competitionScoreValue: { fontSize: 24, fontWeight: '800' },
  competitionPendingActions: { marginTop: 12 },
  competitionAcceptBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  competitionAcceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
