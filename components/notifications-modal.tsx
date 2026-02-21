import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getFriends } from '@/lib/friends'
import { getNotifications, markNotificationsAsRead, type Notification } from '@/lib/notifications'
import { supabase } from '@/lib/supabase'

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  return '?'
}

function formatNotificationTime(createdAt: string): string {
  const now = new Date()
  const time = new Date(createdAt)
  const diffMs = now.getTime() - time.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function NotificationItem({
  notification,
  colors,
  onPress,
}: {
  notification: Notification
  colors: any
  onPress: () => void
}) {
  const getNotificationContent = () => {
    switch (notification.type) {
      case 'reaction':
        return {
          icon: notification.emoji || '❤️',
          title: `${notification.actor_display_name || 'Someone'} reacted ${notification.emoji || ''}`,
          subtitle: 'to your workout',
        }
      case 'comment':
        return {
          icon: '💬',
          title: `${notification.actor_display_name || 'Someone'} commented`,
          subtitle: notification.comment_text || '',
        }
      case 'friend_streak':
        return {
          icon: '🔥',
          title: `${notification.friend_display_name || 'A friend'} hit a ${notification.streak_count}-day streak!`,
          subtitle: 'Keep up the momentum',
        }
      case 'achievement':
        return {
          icon: notification.achievement_icon || '🏆',
          title: `Achievement unlocked: ${notification.achievement_name || 'Achievement'}`,
          subtitle: 'Great work!',
        }
      case 'competition_started':
        return {
          icon: '🏅',
          title: `${notification.competition_group_name || 'Your group'} started a competition`,
          subtitle: 'Time to compete!',
        }
      case 'friend_activity':
        return {
          icon: '💪',
          title: `${notification.friend_display_name || 'A friend'} ${notification.activity_description || 'was active'}`,
          subtitle: 'Stay motivated!',
        }
      default:
        return { icon: '🔔', title: 'New notification', subtitle: '' }
    }
  }

  const content = getNotificationContent()
  const avatarUrl =
    notification.actor_avatar_url ||
    notification.friend_avatar_url ||
    notification.competition_group_avatar_url
  const displayName =
    notification.actor_display_name ||
    notification.friend_display_name ||
    notification.competition_group_name

  return (
    <Pressable
      style={({ pressed }) => [
        styles.notificationItem,
        { backgroundColor: colors.card },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <View style={styles.notificationLeft}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.tint + '20' }]}>
            <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
              {getInitials(displayName)}
            </ThemedText>
          </View>
        )}
        {notification.workout_image_url && (
          <View style={styles.workoutImageWrap}>
            <Image source={{ uri: notification.workout_image_url }} style={styles.workoutImage} />
          </View>
        )}
      </View>
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <ThemedText style={styles.notificationIcon}>{content.icon}</ThemedText>
          <ThemedText style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={2}>
            {content.title}
          </ThemedText>
        </View>
        {content.subtitle && (
          <ThemedText style={[styles.notificationSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
            {content.subtitle}
          </ThemedText>
        )}
        <ThemedText style={[styles.notificationTime, { color: colors.textMuted }]}>
          {formatNotificationTime(notification.created_at)}
        </ThemedText>
      </View>
    </Pressable>
  )
}

export function NotificationsModal({
  visible,
  onClose,
  onNavigateToWorkout,
}: {
  visible: boolean
  onClose: () => void
  onNavigateToWorkout?: (workoutId: string, expandComments?: boolean) => void
}) {
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const loadNotifications = useCallback(() => {
    if (!session) return
    setLoading(true)
    getNotifications(session.user.id)
      .then(setNotifications)
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false))
  }, [session])

  useEffect(() => {
    if (visible && session) {
      // Mark as read when modal opens
      markNotificationsAsRead()
      loadNotifications()
    }
  }, [visible, session, loadNotifications])

  // Real-time subscription for notifications when modal is visible
  useEffect(() => {
    if (!visible || !session) return

    const channels: ReturnType<typeof supabase.channel>[] = []
    let isMounted = true

    // Subscribe to reactions on user's workouts
    const reactionsChannel = supabase
      .channel('modal-notifications-reactions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workout_reactions',
        },
        (payload) => {
          supabase
            .from('workouts')
            .select('user_id')
            .eq('id', payload.new.workout_id)
            .single()
            .then(({ data }) => {
              if (data && data.user_id === session.user.id) {
                loadNotifications()
              }
            })
        }
      )
      .subscribe()
    channels.push(reactionsChannel)

    // Subscribe to comments on user's workouts
    const commentsChannel = supabase
      .channel('modal-notifications-comments')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workout_comments',
        },
        (payload) => {
          supabase
            .from('workouts')
            .select('user_id')
            .eq('id', payload.new.workout_id)
            .single()
            .then(({ data }) => {
              if (data && data.user_id === session.user.id) {
                loadNotifications()
              }
            })
        }
      )
      .subscribe()
    channels.push(commentsChannel)

    // Subscribe to user achievements
    const achievementsChannel = supabase
      .channel('modal-notifications-achievements')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          loadNotifications()
        }
      )
      .subscribe()
    channels.push(achievementsChannel)

    // Subscribe to friend workouts
    getFriends(session.user.id).then((friends) => {
      if (!isMounted) return
      const friendIds = friends.map((f) => f.id)
      if (friendIds.length > 0) {
        const friendWorkoutsChannel = supabase
          .channel('modal-notifications-friend-workouts')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'workouts',
            },
            (payload) => {
              if (friendIds.includes(payload.new.user_id)) {
                loadNotifications()
              }
            }
          )
          .subscribe()
        channels.push(friendWorkoutsChannel)
      }
    })

    // Subscribe to group competitions
    supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        if (!isMounted) return
        if (data && data.length > 0) {
          const userGroupIds = data.map((g) => g.group_id)
          const competitionsChannel = supabase
            .channel('modal-notifications-competitions')
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'group_competitions',
              },
              (payload) => {
                if (
                  userGroupIds.includes(payload.new.group1_id) ||
                  userGroupIds.includes(payload.new.group2_id)
                ) {
                  loadNotifications()
                }
              }
            )
            .subscribe()
          channels.push(competitionsChannel)
        }
      })

    return () => {
      isMounted = false
      channels.forEach((channel) => {
        supabase.removeChannel(channel)
      })
    }
  }, [visible, session, loadNotifications])

  const handleNotificationPress = (notification: Notification) => {
    if (notification.workout_id) {
      // Navigate to the specific workout in the feed
      if (onNavigateToWorkout) {
        const expandComments = notification.type === 'comment'
        onNavigateToWorkout(notification.workout_id, expandComments)
      } else {
        // Fallback: just navigate to home
        router.push('/(tabs)/')
        onClose()
      }
    } else if (notification.competition_id) {
      router.push(`/competition-detail?id=${notification.competition_id}`)
      onClose()
    } else if (notification.friend_id) {
      router.push({ pathname: '/friend-profile', params: { id: notification.friend_id } })
      onClose()
    } else if (notification.achievement_id) {
      // Navigate to profile to see achievements
      router.push('/(tabs)/profile')
      onClose()
    } else {
      // Default: just close
      onClose()
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.tabBarBorder }]}>
          <ThemedText type="title" style={[styles.headerTitle, { color: colors.text }]}>
            Notifications
          </ThemedText>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
              No notifications yet
            </ThemedText>
            <ThemedText style={[styles.emptySubtext, { color: colors.textMuted }]}>
              You'll see reactions, comments, and updates here
            </ThemedText>
          </View>
        ) : (
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                colors={colors}
                onPress={() => handleNotificationPress(notification)}
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  notificationLeft: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '700',
  },
  workoutImageWrap: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  workoutImage: {
    width: 24,
    height: 24,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  notificationIcon: {
    fontSize: 18,
  },
  notificationTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  notificationSubtitle: {
    fontSize: 13,
    marginBottom: 4,
    letterSpacing: 0.1,
  },
  notificationTime: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
})
