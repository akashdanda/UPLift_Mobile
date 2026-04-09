import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { ReportModal } from '@/components/report-modal'
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
  addFeedComment,
  createGroupFeedPost,
  createGroupPoll,
  deleteGroupFeedPost,
  getCommentsForPosts,
  getGroupFeedPosts,
  getPollOptions,
  getReactionsForPosts,
  getUserPollVote,
  toggleFeedReaction,
  togglePinPost,
  voteOnPoll,
} from '@/lib/group-feed'
import { uploadGroupImage } from '@/lib/group-upload'
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
import type {
  GroupFeedCommentWithProfile,
  GroupFeedPostWithAuthor,
  GroupFeedReactionWithProfile,
  GroupMessage,
  GroupPollOption,
} from '@/types/group'
import * as ImagePicker from 'expo-image-picker'

const SCREEN_WIDTH = Dimensions.get('window').width
const SCREEN_HEIGHT = Dimensions.get('window').height
/** Fixed height so the friend list gets a bounded flex region and scrolls reliably */
const INVITE_SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.72)
const BANNER_HEIGHT = 180

type DetailTab = 'overview' | 'members' | 'feed' | 'chat' | 'competitions'

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

type ThemeColors = (typeof Colors)['light']
type FeedPollCache = Record<string, { options: GroupPollOption[]; userVote: string | null; loading: boolean }>

type FeedPostCardProps = {
  post: GroupFeedPostWithAuthor
  colors: ThemeColors
  userId: string
  isStaff: boolean
  pollCache: FeedPollCache
  loadPollData: (postId: string) => void
  handleVote: (postId: string, optionId: string) => void
  reactions: GroupFeedReactionWithProfile[]
  comments: GroupFeedCommentWithProfile[]
  openComments: Set<string>
  setOpenComments: Dispatch<SetStateAction<Set<string>>>
  commentDrafts: Record<string, string>
  setCommentDrafts: Dispatch<SetStateAction<Record<string, string>>>
  commentSending: Record<string, boolean>
  setCommentSending: Dispatch<SetStateAction<Record<string, boolean>>>
  setFeedPosts: Dispatch<SetStateAction<GroupFeedPostWithAuthor[]>>
  setFeedReactions: Dispatch<SetStateAction<Record<string, GroupFeedReactionWithProfile[]>>>
  setFeedComments: Dispatch<SetStateAction<Record<string, GroupFeedCommentWithProfile[]>>>
  handleDeletePost: (postId: string) => void
  onPressFeedImage?: (uri: string) => void
}

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session, refreshProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'
  const safeInsets = useSafeAreaInsets()

  const [group, setGroup] = useState<GroupWithMeta | null>(null)
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([])
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [isUserMember, setIsUserMember] = useState(false)
  const [userRole, setUserRole] = useState<GroupRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('feed')
  const [activeCompetitions, setActiveCompetitions] = useState<CompetitionWithGroups[]>([])
  const [inQueue, setInQueue] = useState(false)
  const [loadingCompetitions, setLoadingCompetitions] = useState(false)

  // Feed
  const [feedPosts, setFeedPosts] = useState<GroupFeedPostWithAuthor[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedReactions, setFeedReactions] = useState<Record<string, GroupFeedReactionWithProfile[]>>({})
  const [feedComments, setFeedComments] = useState<Record<string, GroupFeedCommentWithProfile[]>>({})
  const [openComments, setOpenComments] = useState<Set<string>>(new Set())
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [commentSending, setCommentSending] = useState<Record<string, boolean>>({})
  const [composeVisible, setComposeVisible] = useState(false)
  const [composeType, setComposeType] = useState<'post' | 'announcement' | 'poll'>('post')
  const [composeText, setComposeText] = useState('')
  const [composeImageUri, setComposeImageUri] = useState<string | null>(null)
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [composeSending, setComposeSending] = useState(false)
  const [pollCache, setPollCache] = useState<Record<string, { options: GroupPollOption[]; userVote: string | null; loading: boolean }>>({})
  const feedExtrasRefreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [zoomImageUri, setZoomImageUri] = useState<string | null>(null)
  const feedZoomScale = useSharedValue(1)
  const feedZoomSavedScale = useSharedValue(1)

  /** Same pinch behavior as `ZoomableFeedImage` on the home workout feed — zoom while pinching, spring back on release. */
  const feedImagePinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      feedZoomScale.value = feedZoomSavedScale.value * e.scale
    })
    .onEnd(() => {
      feedZoomScale.value = withSpring(1)
      feedZoomSavedScale.value = 1
    })

  const feedImageZoomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: feedZoomScale.value }],
  }))

  const openFeedImageZoom = useCallback((uri: string) => {
    setZoomImageUri(uri)
    feedZoomScale.value = 1
    feedZoomSavedScale.value = 1
  }, [])

  const closeFeedImageZoom = useCallback(() => {
    setZoomImageUri(null)
    feedZoomScale.value = withTiming(1)
    feedZoomSavedScale.value = 1
  }, [])

  const [inviteModalVisible, setInviteModalVisible] = useState(false)
  const [inviteFriends, setInviteFriends] = useState<FriendWithProfile[]>([])
  const [invitePendingIds, setInvitePendingIds] = useState<Set<string>>(new Set())
  const [inviteSendingId, setInviteSendingId] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [reportModalVisible, setReportModalVisible] = useState(false)

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
        async (payload) => {
          const newMessage = payload.new as GroupMessage
          // Check if message already exists (avoid duplicates)
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev
            }
            return [...prev, newMessage]
          })
          // Refresh messages to get latest (ensures we have all messages in order)
          const messagesData = await getGroupMessages(id)
          setMessages(messagesData.reverse())
          setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isUserMember, id])

  // Reload messages when chat tab becomes active
  useEffect(() => {
    if (activeTab === 'chat' && isUserMember && id) {
      getGroupMessages(id).then((messagesData) => {
        setMessages(messagesData.reverse())
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100)
      })
    }
  }, [activeTab, isUserMember, id])

  // Load feed when feed tab becomes active
  useEffect(() => {
    if (activeTab === 'feed' && isUserMember && id) {
      setFeedLoading(true)
      getGroupFeedPosts(id)
        .then(async (posts) => {
          setFeedPosts(posts)
          const postIds = posts.map((p) => p.id)
          const [reactionsMap, commentsMap] = await Promise.all([
            getReactionsForPosts(postIds),
            getCommentsForPosts(postIds),
          ])
          setFeedReactions(Object.fromEntries([...reactionsMap.entries()]))
          setFeedComments(Object.fromEntries([...commentsMap.entries()]))
        })
        .finally(() => setFeedLoading(false))
    }
  }, [activeTab, isUserMember, id])

  // Realtime updates for feed posts
  useEffect(() => {
    if (!id || !isUserMember) return
    const channel = supabase
      .channel(`group_feed:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_feed_posts', filter: `group_id=eq.${id}` },
        async () => {
          const data = await getGroupFeedPosts(id)
          setFeedPosts(data)
          const postIds = data.map((p) => p.id)
          const [reactionsMap, commentsMap] = await Promise.all([
            getReactionsForPosts(postIds),
            getCommentsForPosts(postIds),
          ])
          setFeedReactions(Object.fromEntries([...reactionsMap.entries()]))
          setFeedComments(Object.fromEntries([...commentsMap.entries()]))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, isUserMember])

  // Realtime updates for reactions/comments (refresh current feed extras)
  useEffect(() => {
    if (!id || !isUserMember || activeTab !== 'feed') return

    const refresh = () => {
      if (feedExtrasRefreshTimeout.current) clearTimeout(feedExtrasRefreshTimeout.current)
      feedExtrasRefreshTimeout.current = setTimeout(async () => {
        const postIds = feedPosts.map((p) => p.id)
        const [reactionsMap, commentsMap] = await Promise.all([
          getReactionsForPosts(postIds),
          getCommentsForPosts(postIds),
        ])
        setFeedReactions(Object.fromEntries([...reactionsMap.entries()]))
        setFeedComments(Object.fromEntries([...commentsMap.entries()]))
      }, 250)
    }

    const channel = supabase
      .channel(`group_feed_extras:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_feed_reactions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_feed_comments' }, refresh)
      .subscribe()

    return () => {
      if (feedExtrasRefreshTimeout.current) {
        clearTimeout(feedExtrasRefreshTimeout.current)
        feedExtrasRefreshTimeout.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [id, isUserMember, activeTab, feedPosts])

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
      // Reload messages immediately to show the sent message
      const messagesData = await getGroupMessages(id)
      setMessages(messagesData.reverse())
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  // ─── Feed handlers ─────────────────────────────────────
  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to attach an image.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    })
    if (!result.canceled && result.assets?.[0]?.uri) setComposeImageUri(result.assets[0].uri)
  }

  const loadPollData = useCallback(
    async (postId: string) => {
      if (!userId) return
      setPollCache((prev) => ({
        ...prev,
        [postId]: { options: prev[postId]?.options ?? [], userVote: prev[postId]?.userVote ?? null, loading: true },
      }))
      const [options, userVote] = await Promise.all([getPollOptions(postId), getUserPollVote(postId, userId)])
      setPollCache((prev) => ({ ...prev, [postId]: { options, userVote, loading: false } }))
    },
    [userId]
  )

  const handleVote = async (postId: string, optionId: string) => {
    if (!userId) return
    const { error } = await voteOnPoll(optionId, userId, postId)
    if (error) Alert.alert('Error', error.message)
    else await loadPollData(postId)
  }

  const handleSubmitPost = async () => {
    if (!id || !userId) return
    setComposeSending(true)
    try {
      if (composeType === 'poll') {
        const { error } = await createGroupPoll(id, userId, composeText, pollOptions)
        if (error) {
          Alert.alert('Error', error.message)
          return
        }
      } else {
        let imageUrl: string | null = null
        if (composeImageUri) {
          const upload = await uploadGroupImage(id, composeImageUri)
          if ('error' in upload) {
            Alert.alert('Error', upload.error.message)
            return
          }
          imageUrl = upload.url
        }
        const { error } = await createGroupFeedPost(id, userId, composeText, imageUrl, composeType)
        if (error) {
          Alert.alert('Error', error.message)
          return
        }
      }

      setComposeText('')
      setComposeImageUri(null)
      setComposeType('post')
      setPollOptions(['', ''])
      setComposeVisible(false)
      const data = await getGroupFeedPosts(id)
      setFeedPosts(data)
    } catch {
      Alert.alert('Error', 'Failed to create post')
    } finally {
      setComposeSending(false)
    }
  }

  const handleDeletePost = (postId: string) => {
    Alert.alert('Delete Post', 'Delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteGroupFeedPost(postId)
          if (error) Alert.alert('Error', error.message)
          else setFeedPosts((prev) => prev.filter((p) => p.id !== postId))
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
          { key: 'feed', icon: 'newspaper-outline' as const, label: 'Feed', color: colors.textMuted, onPress: () => setActiveTab('feed') },
          { key: 'invite', icon: 'person-add-outline' as const, label: 'Invite', color: colors.tint, onPress: handleOpenInvite },
          { key: 'chat', icon: 'chatbubbles-outline' as const, label: 'Chat', color: colors.textMuted, onPress: () => setActiveTab('chat') },
        ]
      : []),
    { key: 'share', icon: 'share-outline' as const, label: 'Share', color: colors.textMuted, onPress: handleShare },
    { key: 'report', icon: 'flag-outline' as const, label: 'Report', color: '#ef4444', onPress: () => setReportModalVisible(true) },
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
            style={[styles.actionsContainer, { borderBottomColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}
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

          {activeTab === 'feed' && isUserMember && (
            <ThemedView style={styles.tabContent}>
              <View style={styles.feedHeaderRow}>
                <ThemedText type="subtitle" style={[styles.contentSectionTitle, { color: colors.text }]}>
                  Group Feed
                </ThemedText>
                <Pressable
                  onPress={() => setComposeVisible(true)}
                  style={({ pressed }) => [
                    styles.feedComposeBtn,
                    { backgroundColor: pressed ? colors.tint + '15' : colors.cardElevated, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') },
                  ]}
                >
                  <Ionicons name="pencil" size={16} color={colors.textMuted} />
                  <ThemedText style={[styles.feedComposeBtnText, { color: colors.textMuted }]}>Write something…</ThemedText>
                </Pressable>
              </View>

              {feedLoading ? (
                <View style={styles.centered}>
                  <ActivityIndicator color={colors.tint} />
                </View>
              ) : feedPosts.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                  <Ionicons name="newspaper-outline" size={40} color={colors.textMuted + '50'} style={{ marginBottom: 12 }} />
                  <ThemedText type="defaultSemiBold" style={[styles.emptyTitle, { color: colors.text }]}>
                    No posts yet
                  </ThemedText>
                  <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                    Be the first to post something to your group.
                  </ThemedText>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {feedPosts.map((p) => (
                    <FeedPostCard
                      key={p.id}
                      post={p}
                      colors={colors}
                      userId={userId}
                      isStaff={isStaff}
                      pollCache={pollCache}
                      loadPollData={loadPollData}
                      handleVote={handleVote}
                      reactions={feedReactions[p.id] ?? []}
                      comments={feedComments[p.id] ?? []}
                      openComments={openComments}
                      setOpenComments={setOpenComments}
                      commentDrafts={commentDrafts}
                      setCommentDrafts={setCommentDrafts}
                      commentSending={commentSending}
                      setCommentSending={setCommentSending}
                      setFeedPosts={setFeedPosts}
                      setFeedReactions={setFeedReactions}
                      setFeedComments={setFeedComments}
                      handleDeletePost={handleDeletePost}
                      onPressFeedImage={openFeedImageZoom}
                    />
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
              <View style={[styles.chatContainer, { backgroundColor: colors.card, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
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
                <View style={[styles.chatInputRow, { borderTopColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
                  <TextInput
                    style={[
                      styles.chatInput,
                      { backgroundColor: colors.background, color: colors.text, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') },
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
                <View style={[styles.competitionCard, { backgroundColor: colors.card, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
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
                    style={[styles.competitionButtonSecondary, { borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}
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
                        style={[styles.competitionItem, { backgroundColor: colors.card, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}
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

      {/* Compose Feed Post Modal */}
      <Modal
        visible={composeVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setComposeVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.composeOverlay} onPress={() => setComposeVisible(false)}>
            <Pressable
              style={[styles.composeSheet, { backgroundColor: colors.card }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={[styles.composeHandle, { backgroundColor: colors.textMuted + '30' }]} />

              <View style={styles.composeHeaderRow}>
                <ThemedText type="subtitle" style={[styles.composeTitle, { color: colors.text }]}>
                  Create
                </ThemedText>
                <Pressable onPress={() => setComposeVisible(false)} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* Type row */}
              <View style={styles.composeTypeRow}>
                {([
                  { key: 'post' as const, label: 'Post', icon: 'chatbubble-ellipses-outline' as const },
                  { key: 'announcement' as const, label: 'Announce', icon: 'megaphone-outline' as const },
                  { key: 'poll' as const, label: 'Poll', icon: 'stats-chart-outline' as const },
                ] as const).map((t) => {
                  const active = composeType === t.key
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setComposeType(t.key)}
                      style={({ pressed }) => [
                        styles.composeTypeBtn,
                        {
                          backgroundColor: active ? colors.tint + '15' : colors.cardElevated,
                          borderColor: active ? colors.tint + '40' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Ionicons name={t.icon} size={16} color={active ? colors.tint : colors.textMuted} />
                      <ThemedText style={[styles.composeTypeText, { color: active ? colors.tint : colors.textMuted }]}>
                        {t.label}
                      </ThemedText>
                    </Pressable>
                  )
                })}
              </View>

              {/* Text */}
              <TextInput
                value={composeText}
                onChangeText={setComposeText}
                placeholder={composeType === 'poll' ? 'Ask a question…' : 'Write something…'}
                placeholderTextColor={colors.textMuted + '90'}
                style={[
                  styles.composeInput,
                  { backgroundColor: colors.cardElevated, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), color: colors.text },
                ]}
                multiline
                maxLength={1000}
              />

              {/* Image attach (not for polls) */}
              {composeType !== 'poll' && (
                <View style={styles.composeImageRow}>
                  <Pressable
                    onPress={handlePickImage}
                    style={({ pressed }) => [
                      styles.composeImageBtn,
                      {
                        backgroundColor: pressed ? colors.tint + '10' : colors.cardElevated,
                        borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                      },
                    ]}
                  >
                    <Ionicons name="image-outline" size={18} color={colors.textMuted} />
                    <ThemedText style={[styles.composeImageBtnText, { color: colors.textMuted }]}>
                      {composeImageUri ? 'Change image' : 'Add image'}
                    </ThemedText>
                  </Pressable>

                  {composeImageUri ? (
                    <View style={styles.composeThumbWrap}>
                      <Pressable onPress={() => openFeedImageZoom(composeImageUri)}>
                        <Image source={{ uri: composeImageUri }} style={styles.composeThumb} contentFit="cover" />
                      </Pressable>
                      <Pressable
                        onPress={() => setComposeImageUri(null)}
                        style={[styles.composeThumbRemove, { backgroundColor: colors.background + 'CC' }]}
                      >
                        <Ionicons name="close" size={16} color={colors.text} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Poll options */}
              {composeType === 'poll' && (
                <View style={styles.pollOptionsContainer}>
                  {pollOptions.map((opt, idx) => (
                    <View key={idx} style={styles.pollOptionRow}>
                      <View style={[styles.pollOptionNumber, { backgroundColor: colors.tint + '15' }]}>
                        <ThemedText style={[styles.pollOptionNumberText, { color: colors.tint }]}>{idx + 1}</ThemedText>
                      </View>
                      <TextInput
                        value={opt}
                        onChangeText={(v) =>
                          setPollOptions((prev) => prev.map((p, i) => (i === idx ? v : p)))
                        }
                        placeholder={`Option ${idx + 1}`}
                        placeholderTextColor={colors.textMuted + '90'}
                        style={[
                          styles.pollOptionInput,
                          { backgroundColor: colors.cardElevated, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), color: colors.text },
                        ]}
                      />
                      {pollOptions.length > 2 && (
                        <Pressable
                          onPress={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                          style={styles.pollOptionRemoveBtn}
                          hitSlop={10}
                        >
                          <Ionicons name="remove-circle-outline" size={20} color={colors.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  <Pressable
                    onPress={() => setPollOptions((prev) => [...prev, ''])}
                    style={[styles.pollAddOptionBtn, { borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}
                  >
                    <Ionicons name="add" size={18} color={colors.textMuted} />
                    <ThemedText style={[styles.pollAddOptionText, { color: colors.textMuted }]}>Add option</ThemedText>
                  </Pressable>
                </View>
              )}

              {/* Submit */}
              <Pressable
                onPress={handleSubmitPost}
                disabled={composeSending}
                style={({ pressed }) => [
                  styles.composeSubmitBtn,
                  {
                    backgroundColor: colors.tint,
                    opacity: composeSending ? 0.6 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {composeSending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <ThemedText style={styles.composeSubmitText}>
                      {composeType === 'poll' ? 'Post Poll' : composeType === 'announcement' ? 'Post Announcement' : 'Post'}
                    </ThemedText>
                  </>
                )}
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Post / compose image — pinch zoom (resets on release); tap dark area outside the photo to dismiss */}
      <Modal
        visible={!!zoomImageUri}
        transparent
        animationType="fade"
        onRequestClose={closeFeedImageZoom}
      >
        <View style={styles.feedImageZoomOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close image"
            style={StyleSheet.absoluteFill}
            onPress={closeFeedImageZoom}
          />
          <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, styles.feedImageZoomCenter]}>
            <GestureDetector gesture={feedImagePinchGesture}>
              <Animated.View style={[styles.feedImageZoomInner, feedImageZoomAnimatedStyle]}>
                {!!zoomImageUri && (
                  <Image
                    source={{ uri: zoomImageUri }}
                    style={styles.feedImageZoomImg}
                    contentFit="contain"
                  />
                )}
              </Animated.View>
            </GestureDetector>
          </View>
        </View>
      </Modal>

      {/* Invite Friends Modal — View (not Pressable) for sheet so FlatList receives pan gestures */}
      <Modal
        visible={inviteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <View style={styles.inviteOverlay}>
          <Pressable
            accessibilityRole="button"
            style={StyleSheet.absoluteFill}
            onPress={() => setInviteModalVisible(false)}
          />
          <View
            style={[
              styles.inviteSheet,
              { backgroundColor: colors.card, height: INVITE_SHEET_HEIGHT },
            ]}
          >
            <View style={styles.inviteSheetHeader}>
              <View style={styles.inviteHandle} />
              <ThemedText type="subtitle" style={[styles.inviteTitle, { color: colors.text }]}>
                Invite Friends
              </ThemedText>
              <ThemedText style={[styles.inviteSubtitle, { color: colors.textMuted }]}>
                Select friends to invite to {group?.name}
              </ThemedText>
            </View>

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
              <FlatList
                data={inviteFriends}
                keyExtractor={(item) => item.id}
                style={styles.inviteList}
                contentContainerStyle={{ paddingBottom: Math.max(16, safeInsets.bottom) }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
                renderItem={({ item: friend }) => {
                  const isPending = invitePendingIds.has(friend.id)
                  const isSending = inviteSendingId === friend.id
                  return (
                    <View style={[styles.inviteRow, { borderBottomColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
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
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Report Modal */}
      {userId && id && group && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          reporterId={userId}
          reportedGroupId={id}
          reportedEntityName={group.name}
        />
      )}
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
    overflow: 'visible',
  },
  groupAvatarText: { fontSize: 28, fontWeight: '700', lineHeight: 34 },

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
    position: 'relative',
  },
  competeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
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
  actionBtnLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Tab content
  tabContent: { paddingHorizontal: 20, paddingTop: 16 },
  contentSectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 14, letterSpacing: 0.5 },

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
  seeAllLink: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
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
  roleBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // Chat
  chatContainer: {
    borderRadius: 16,
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

  // Feed
  feedHeaderRow: { gap: 10, marginBottom: 12 },
  feedComposeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  feedComposeBtnText: { fontSize: 13, fontWeight: '600' },
  feedCard: { borderRadius: 16, borderWidth: 1, padding: 14, overflow: 'hidden' },
  feedAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  feedAuthorAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedAuthorInitial: { fontSize: 15, fontWeight: '800' },
  feedAuthorName: { fontSize: 15, fontWeight: '700' },
  feedRoleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  feedRoleBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  feedPostTime: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  feedPostContent: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  feedPostImageWrap: { marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  feedPostImage: { width: '100%', aspectRatio: 4 / 3 },
  feedImageZoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  feedImageZoomCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedImageZoomInner: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 14,
  },
  feedImageZoomImg: {
    width: SCREEN_WIDTH * 0.94,
    height: SCREEN_HEIGHT * 0.78,
    borderRadius: 14,
  },
  feedPollQuestion: { fontSize: 15, fontWeight: '700' },
  feedPollOption: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedPollProgress: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  feedPollOptionText: { fontSize: 14, fontWeight: '600' },
  feedPollPct: { fontSize: 12, fontWeight: '800' },
  feedPollVotes: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 4 },

  feedMetaRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  feedReactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  feedReactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  feedReactionEmoji: { fontSize: 14, fontWeight: '700' },
  feedReactionCount: { fontSize: 12, fontWeight: '800' },
  feedCommentToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  feedCommentToggleText: { fontSize: 12, fontWeight: '700' },
  feedCommentsWrap: { marginTop: 10, gap: 10 },
  feedCommentsEmpty: { fontSize: 13, fontWeight: '600' },
  feedCommentsList: { gap: 10 },
  feedCommentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  feedCommentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  feedCommentAvatarText: { fontSize: 12, fontWeight: '800' },
  feedCommentBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  feedCommentName: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  feedCommentMessage: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  feedCommentTime: { fontSize: 10, fontWeight: '600', marginTop: 3, marginLeft: 6 },
  feedCommentsMoreHint: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  feedCommentComposerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  feedCommentInput: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 90,
  },
  feedCommentSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Compose modal
  composeOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  composeSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 24 },
  composeHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  composeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  composeTitle: { fontSize: 18, fontWeight: '800' },
  composeTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  composeTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },
  composeTypeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  composeInput: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 90 },
  composeImageRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  composeImageBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, flex: 1 },
  composeImageBtnText: { fontSize: 13, fontWeight: '600' },
  composeThumbWrap: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' },
  composeThumb: { width: '100%', height: '100%' },
  composeThumbRemove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  composeSubmitBtn: { marginTop: 14, borderRadius: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, },
  composeSubmitText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },

  // Poll compose
  pollOptionsContainer: { marginTop: 12, gap: 10 },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pollOptionNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pollOptionNumberText: { fontSize: 12, fontWeight: '800' },
  pollOptionInput: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  pollOptionRemoveBtn: { padding: 4 },
  pollAddOptionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  pollAddOptionText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },

  // Competitions
  competitionCard: {
    borderRadius: 16,
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
  competitionButtonText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  competitionButtonSecondary: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  competitionButtonTextSecondary: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  competitionsList: { marginTop: 8 },
  competitionSectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 12, letterSpacing: 0.5 },
  competitionItem: {
    borderRadius: 16,
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
  competitionType: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
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
  competitionScoreLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 },
  competitionScoreValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  competitionPendingActions: { marginTop: 12 },
  competitionAcceptBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    },
  competitionAcceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },

  // Invite modal
  inviteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  inviteSheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    zIndex: 1,
    ...Platform.select({
      android: { },
    }),
  },
  inviteSheetHeader: {
    flexShrink: 0,
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    flex: 1,
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

function FeedPostCard({
  post,
  colors,
  userId,
  isStaff,
  pollCache,
  loadPollData,
  handleVote,
  reactions,
  comments,
  openComments,
  setOpenComments,
  commentDrafts,
  setCommentDrafts,
  commentSending,
  setCommentSending,
  setFeedPosts,
  setFeedReactions,
  setFeedComments,
  handleDeletePost,
  onPressFeedImage,
}: FeedPostCardProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const isPoll = post.post_type === 'poll'
  const cached = pollCache[post.id]
  const commentsVisible = openComments.has(post.id)

  useEffect(() => {
    if (isPoll && !cached) loadPollData(post.id)
  }, [isPoll, cached, post.id, loadPollData])

  const totalVotes = cached?.options.reduce((sum, o) => sum + o.vote_count, 0) ?? 0
  const roleLabel = post.role === 'owner' ? 'Owner' : post.role === 'admin' ? 'Admin' : null
  const draft = commentDrafts[post.id] ?? ''
  const isSending = commentSending[post.id] ?? false

  const emojis = ['💪', '🔥', '👏', '❤️'] as const
  const counts = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1
    return acc
  }, {})
  const userHasReacted = (emoji: string) => reactions.some((r) => r.user_id === userId && r.emoji === emoji)
  const totalReactions = reactions.length

  const handleToggleReaction = async (emoji: string) => {
    if (!userId) return
    const { error } = await toggleFeedReaction(post.id, userId, emoji)
    if (error) Alert.alert('Error', error.message)
    const map = await getReactionsForPosts([post.id])
    setFeedReactions((prev) => ({ ...prev, [post.id]: map.get(post.id) ?? [] }))
  }

  const handleSendComment = async () => {
    if (!userId) return
    setCommentSending((prev) => ({ ...prev, [post.id]: true }))
    try {
      const { error } = await addFeedComment(post.id, userId, draft)
      if (error) {
        Alert.alert('Error', error.message)
        return
      }
      setCommentDrafts((prev) => ({ ...prev, [post.id]: '' }))
      setOpenComments((prev) => new Set([...prev, post.id]))
      const map = await getCommentsForPosts([post.id])
      setFeedComments((prev) => ({ ...prev, [post.id]: map.get(post.id) ?? [] }))
    } finally {
      setCommentSending((prev) => ({ ...prev, [post.id]: false }))
    }
  }

  return (
    <View style={[styles.feedCard, { backgroundColor: colors.card, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
      <View style={styles.feedAuthorRow}>
        {post.avatar_url ? (
          <Image source={{ uri: post.avatar_url }} style={styles.feedAuthorAvatar} />
        ) : (
          <View style={[styles.feedAuthorAvatar, { backgroundColor: colors.tint + '15' }]}>
            <ThemedText style={[styles.feedAuthorInitial, { color: colors.tint }]}>
              {post.display_name?.charAt(0).toUpperCase() ?? '?'}
            </ThemedText>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemedText style={[styles.feedAuthorName, { color: colors.text }]}>{post.display_name ?? 'Unknown'}</ThemedText>
            {roleLabel ? (
              <View style={[styles.feedRoleBadge, { backgroundColor: colors.tint + '15' }]}>
                <ThemedText style={[styles.feedRoleBadgeText, { color: colors.tint }]}>{roleLabel}</ThemedText>
              </View>
            ) : null}
          </View>
          <ThemedText style={[styles.feedPostTime, { color: colors.textMuted }]}>{formatMessageTime(post.created_at)}</ThemedText>
        </View>
        {(post.user_id === userId || isStaff) && (
          <Pressable
            hitSlop={10}
            onPress={() => {
              const options: Array<{ text: string; onPress: () => void; style?: 'destructive' | 'cancel' }> = []
              if (isStaff) {
                options.push({
                  text: post.is_pinned ? 'Unpin' : 'Pin',
                  onPress: async () => {
                    const { error } = await togglePinPost(post.id, !post.is_pinned)
                    if (error) Alert.alert('Error', error.message)
                    else setFeedPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_pinned: !post.is_pinned } : p)))
                  },
                })
              }
              options.push({ text: 'Delete', style: 'destructive', onPress: () => handleDeletePost(post.id) })
              options.push({ text: 'Cancel', style: 'cancel', onPress: () => {} })
              Alert.alert('Post', undefined, options)
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {!isPoll && post.content ? (
        <ThemedText style={[styles.feedPostContent, { color: colors.text }]}>{post.content}</ThemedText>
      ) : null}

      {post.image_url ? (
        <Pressable
          onPress={() => onPressFeedImage?.(post.image_url!)}
          style={({ pressed }) => [styles.feedPostImageWrap, pressed && { opacity: 0.92 }]}
        >
          <Image source={{ uri: post.image_url }} style={styles.feedPostImage} contentFit="cover" />
        </Pressable>
      ) : null}

      {isPoll && (
        <View style={{ marginTop: 10 }}>
          <ThemedText style={[styles.feedPollQuestion, { color: colors.text }]}>{post.content}</ThemedText>
          {cached ? (
            <View style={{ marginTop: 10, gap: 10 }}>
              {cached.options.map((opt) => {
                const isVoted = cached.userVote === opt.id
                const hasVoted = !!cached.userVote
                const pct = totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => handleVote(post.id, opt.id)}
                    style={({ pressed }) => [
                      styles.feedPollOption,
                      {
                        borderColor: isVoted ? colors.tint : colors.tint + '20',
                        backgroundColor: pressed ? colors.tint + '10' : colors.cardElevated,
                      },
                    ]}
                  >
                    {hasVoted && (
                      <View
                        style={[
                          styles.feedPollProgress,
                          { width: `${pct}%`, backgroundColor: isVoted ? colors.tint + '25' : colors.textMuted + '10' },
                        ]}
                      />
                    )}
                    <ThemedText style={[styles.feedPollOptionText, { color: colors.text }]}>{opt.label}</ThemedText>
                    {hasVoted && <ThemedText style={[styles.feedPollPct, { color: isVoted ? colors.tint : colors.textMuted }]}>{pct}%</ThemedText>}
                  </Pressable>
                )
              })}
              <ThemedText style={[styles.feedPollVotes, { color: colors.textMuted }]}>{totalVotes} votes</ThemedText>
            </View>
          ) : (
            <ActivityIndicator color={colors.tint} style={{ marginTop: 10 }} />
          )}
        </View>
      )}

      <View style={[styles.feedMetaRow, { borderTopColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
        <View style={styles.feedReactionsRow}>
          {emojis.map((e) => {
            const c = counts[e] ?? 0
            const active = userHasReacted(e)
            return (
              <Pressable
                key={e}
                onPress={() => handleToggleReaction(e)}
                style={({ pressed }) => [
                  styles.feedReactionPill,
                  {
                    backgroundColor: active ? colors.tint + '18' : colors.cardElevated,
                    borderColor: active ? colors.tint + '55' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText style={[styles.feedReactionEmoji, { color: colors.text }]}>{e}</ThemedText>
                {c > 0 ? <ThemedText style={[styles.feedReactionCount, { color: active ? colors.tint : colors.textMuted }]}>{c}</ThemedText> : null}
              </Pressable>
            )
          })}
        </View>

        <Pressable
          onPress={() =>
            setOpenComments((prev) => {
              const next = new Set(prev)
              if (next.has(post.id)) next.delete(post.id)
              else next.add(post.id)
              return next
            })
          }
          style={({ pressed }) => [styles.feedCommentToggle, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
          <ThemedText style={[styles.feedCommentToggleText, { color: colors.textMuted }]}>
            {comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Comment'}
            {totalReactions > 0 ? ` · ${totalReactions} reaction${totalReactions === 1 ? '' : 's'}` : ''}
          </ThemedText>
        </Pressable>
      </View>

      {commentsVisible && (
        <View style={styles.feedCommentsWrap}>
          {comments.length === 0 ? (
            <ThemedText style={[styles.feedCommentsEmpty, { color: colors.textMuted }]}>Be the first to comment.</ThemedText>
          ) : (
            <View style={styles.feedCommentsList}>
              {(comments.length > 3 ? comments.slice(-3) : comments).map((c) => (
                <View key={c.id} style={styles.feedCommentRow}>
                  {c.avatar_url ? (
                    <Image source={{ uri: c.avatar_url }} style={styles.feedCommentAvatar} />
                  ) : (
                    <View style={[styles.feedCommentAvatar, { backgroundColor: colors.tint + '15' }]}>
                      <ThemedText style={[styles.feedCommentAvatarText, { color: colors.tint }]}>
                        {c.display_name?.charAt(0).toUpperCase() ?? '?'}
                      </ThemedText>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={[styles.feedCommentBubble, { backgroundColor: colors.cardElevated }]}>
                      <ThemedText style={[styles.feedCommentName, { color: colors.text }]}>{c.display_name ?? 'Unknown'}</ThemedText>
                      <ThemedText style={[styles.feedCommentMessage, { color: colors.text }]}>{c.message}</ThemedText>
                    </View>
                    <ThemedText style={[styles.feedCommentTime, { color: colors.textMuted }]}>{formatMessageTime(c.created_at)}</ThemedText>
                  </View>
                </View>
              ))}
              {comments.length > 3 ? (
                <ThemedText style={[styles.feedCommentsMoreHint, { color: colors.textMuted }]}>Showing latest 3 comments</ThemedText>
              ) : null}
            </View>
          )}

          <View style={[styles.feedCommentComposerRow, { borderTopColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
            <TextInput
              style={[styles.feedCommentInput, { backgroundColor: colors.background, color: colors.text, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}
              placeholder="Write a comment…"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={(t) => setCommentDrafts((prev) => ({ ...prev, [post.id]: t }))}
              editable={!isSending}
            />
            <Pressable
              style={[styles.feedCommentSendBtn, { backgroundColor: colors.tint, opacity: !draft.trim() || isSending ? 0.5 : 1 }]}
              onPress={handleSendComment}
              disabled={!draft.trim() || isSending}
            >
              {isSending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}
