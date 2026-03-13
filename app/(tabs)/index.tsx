import { CameraCapture } from '@/components/camera-capture';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationsModal } from '@/components/notifications-modal';
import { ReportModal } from '@/components/report-modal';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useAuthContext } from '@/hooks/use-auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAchievementFeedPosts, hasStreakFreezeAvailable, useStreakFreeze } from '@/lib/achievements';
import { addComment, getCommentsForWorkouts } from '@/lib/comments';
import {
  getDailyReminderInfo,
  getReminderMessage,
  type DailyReminderInfo,
} from '@/lib/daily-reminder';
import { getFriendsWorkouts, type FeedItem } from '@/lib/feed';
import { getFlashbacks, type FlashbackItem } from '@/lib/flashbacks';
import { getFriends } from '@/lib/friends';
import { computeXP, getLevelFromXP } from '@/lib/levels';
import { getUnreadNotificationCount, markNotificationsAsRead } from '@/lib/notifications';
import { addReaction, getReactionsForWorkouts, removeReaction } from '@/lib/reactions';
import { getSocialNudges, type SocialNudge } from '@/lib/social-hooks';
import { supabase } from '@/lib/supabase';
import type { AchievementFeedPost } from '@/types/achievement';
import type { WorkoutCommentWithProfile } from '@/types/comment';
import type { WorkoutReactionWithProfile } from '@/types/reaction';
import { WORKOUT_TYPES, type Workout } from '@/types/workout';

const REACTION_EMOJIS_FREQUENT = ['🔥', '💪', '👍', '❤️', '😂', '😮', '🙌', '😊'];

const REACTION_EMOJI_SECTIONS: { title: string; emojis: string[] }[] = [
  { title: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪', '😝', '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😱', '😨', '😰', '😥', '😢', '😭', '😤', '😡', '🤬', '💀', '☠️', '💩', '🤡', '👹', '👻', '👽', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'] },
  { title: 'Gestures & People', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🏋️', '🚴', '🏃', '🧘', '🏄', '⛹️', '🤸'] },
  { title: 'Hearts & Symbols', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❣️', '💯', '💢', '💥', '💫', '💦', '💨', '🔥', '⭐', '🌟', '✨', '⚡', '🎯', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎉', '🎊'] },
  { title: 'Fitness & Sport', emojis: ['💪', '🏋️', '🏃', '🚴', '🏊', '🧘', '🤸', '⛹️', '🏄', '🚣', '🧗', '🤾', '🏌️', '🤺', '🥊', '🥋', '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏓', '🏸', '🥅', '⛳', '🥏', '🎳', '🏒', '🤿'] },
  { title: 'Food & Drink', emojis: ['🍎', '🍌', '🥑', '🥦', '🥕', '🍗', '🥩', '🍳', '🥚', '🥛', '🧃', '💧', '☕', '🍵', '🧋', '🥤', '🍺', '🍷', '🥂', '🍾'] },
  { title: 'Animals & Nature', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦅', '🦋', '🌸', '🌺', '🌻', '🌹', '🌳', '🌴', '🌵', '🍀', '🌈', '☀️'] },
];

// Zoomable feed image (single or BeReal-style dual: tap to swap main/overlay)
function ZoomableFeedImage({
  imageUrl,
  secondaryImageUrl,
  style,
}: {
  imageUrl: string;
  secondaryImageUrl?: string | null;
  style: any;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const [frontImage, setFrontImage] = useState<'primary' | 'secondary'>('primary');

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      scale.value = withSpring(1);
      savedScale.value = 1;
    });

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const hasDual = secondaryImageUrl && secondaryImageUrl.trim().length > 0;

  if (!hasDual) {
    return (
      <GestureDetector gesture={pinchGesture}>
        <Animated.View style={{ overflow: 'hidden' }}>
          <Animated.Image source={{ uri: imageUrl }} style={[style, animatedImageStyle]} />
        </Animated.View>
      </GestureDetector>
    );
  }

  const mainUrl = frontImage === 'primary' ? imageUrl : secondaryImageUrl!;
  const overlayUrl = frontImage === 'primary' ? secondaryImageUrl! : imageUrl;

  const toggle = () => {
    setFrontImage((f) => (f === 'primary' ? 'secondary' : 'primary'));
  };

  return (
    <View style={[style, { position: 'relative', overflow: 'hidden' }]}>
      <GestureDetector gesture={pinchGesture}>
        <Animated.View style={{ flex: 1, overflow: 'hidden' }}>
          <Pressable style={{ width: '100%', height: '100%' }} onPress={toggle}>
            <Animated.Image source={{ uri: mainUrl }} style={[{ width: '100%', height: '100%' }, animatedImageStyle]} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
      <Pressable style={styles.dualPhotoCorner} onPress={toggle}>
        <Image source={{ uri: overlayUrl }} style={styles.dualPhotoCornerImage} contentFit="cover" />
      </Pressable>
    </View>
  );
}

function formatFeedDate(workoutDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workoutDate);
  if (!match) return '';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, monthIndex, day);
  if (Number.isNaN(d.getTime())) return '';

  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]?.[0]) return parts[0][0].toUpperCase();
  }
  return '?';
}

function getTodayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWorkoutTypeEmoji(type: string | null | undefined): string {
  return WORKOUT_TYPES.find((t) => t.value === type)?.emoji ?? '💪';
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { session, profile } = useAuthContext();
  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null);
  const [todayWorkoutReactions, setTodayWorkoutReactions] = useState<WorkoutReactionWithProfile[]>([]);
  const [todayWorkoutComments, setTodayWorkoutComments] = useState<WorkoutCommentWithProfile[]>([]);
  const todayWorkoutIdRef = useRef<string | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [achievementPosts, setAchievementPosts] = useState<AchievementFeedPost[]>([]);
  const [flashbacks, setFlashbacks] = useState<FlashbackItem[]>([]);
  const [socialNudges, setSocialNudges] = useState<SocialNudge[]>([]);
  const [freezeAvailable, setFreezeAvailable] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [streakAtRisk, setStreakAtRisk] = useState(false);
  const [reminderInfo, setReminderInfo] = useState<DailyReminderInfo | null>(null);

  // React modal (BeReal-style: photo + emoji)
  const [reactModalItem, setReactModalItem] = useState<FeedItem | null>(null);
  const [reactModalKey, setReactModalKey] = useState(0);
  const [reactPendingPhoto, setReactPendingPhoto] = useState<string | null>(null);
  const [reactPendingEmoji, setReactPendingEmoji] = useState<string | null>(null);
  const [reactSubmitting, setReactSubmitting] = useState(false);
  const [reactCameraOpen, setReactCameraOpen] = useState(false);

  // Reaction detail view modal
  const [viewReaction, setViewReaction] = useState<WorkoutReactionWithProfile | null>(null);

  // Inline comments (Instagram-style: all comments visible + add comment / reply on same card)
  const [inlineCommentWorkoutId, setInlineCommentWorkoutId] = useState<string | null>(null);
  const [inlineCommentMessage, setInlineCommentMessage] = useState('');
  const [commentSubmittingWorkoutId, setCommentSubmittingWorkoutId] = useState<string | null>(null);
  
  // Highlight workout when navigating from notification
  const [highlightedWorkoutId, setHighlightedWorkoutId] = useState<string | null>(null);
  
  // Report modal
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    workoutId?: string;
    userId?: string;
    groupId?: string;
    name?: string;
  } | null>(null);

  // Notifications
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const workoutRefs = useRef<Map<string, { ref: View | null; y: number }>>(new Map());
  const [pendingWorkoutNavigation, setPendingWorkoutNavigation] = useState<{ workoutId: string; expandComments: boolean } | null>(null);

  // Keep ref in sync for realtime subscriptions
  todayWorkoutIdRef.current = todayWorkout?.id ?? null;

  // Fetch reactions and comments for the user's own "Today's workout" post
  useEffect(() => {
    if (!todayWorkout) {
      setTodayWorkoutReactions([]);
      setTodayWorkoutComments([]);
      return;
    }
    const workoutId = todayWorkout.id;
    Promise.all([
      getReactionsForWorkouts([workoutId]),
      getCommentsForWorkouts([workoutId]),
    ]).then(([reactionsMap, commentsMap]) => {
      setTodayWorkoutReactions(reactionsMap.get(workoutId) ?? []);
      setTodayWorkoutComments(commentsMap.get(workoutId) ?? []);
    });
  }, [todayWorkout?.id]);

  const refreshFeed = useCallback(() => {
    if (session) getFriendsWorkouts(session.user.id).then(setFeedItems);
  }, [session]);

  const handleOpenNotifications = () => {
    setNotificationsVisible(true);
    // Mark as read when opened
    markNotificationsAsRead().then(() => {
      // Refresh unread count
      if (session) {
        getUnreadNotificationCount(session.user.id).then(setUnreadCount).catch(() => setUnreadCount(0));
      }
    });
  };

  const navigateToWorkout = useCallback((workoutId: string, expandComments = false) => {
    // Close notifications modal
    setNotificationsVisible(false);
    
    // Set pending navigation - will be handled when feed loads
    setPendingWorkoutNavigation({ workoutId, expandComments });
    
    // Navigate to home tab if not already there
    router.push('/(tabs)/' as any);
    
    // Refresh feed to ensure workout is loaded
    refreshFeed();
  }, [refreshFeed]);

  // Handle pending workout navigation when feed items change
  useEffect(() => {
    if (pendingWorkoutNavigation && feedItems.length > 0) {
      const { workoutId, expandComments } = pendingWorkoutNavigation;
      const workoutIndex = feedItems.findIndex((item) => item.workout.id === workoutId);
      
      if (workoutIndex >= 0) {
        // If it's a comment notification, expand comments
        if (expandComments) {
          setInlineCommentWorkoutId(workoutId);
        }
        
        // Highlight the workout temporarily
        setHighlightedWorkoutId(workoutId);
        
        // Scroll to workout after a short delay to ensure layout is complete
        setTimeout(() => {
          const workoutData = workoutRefs.current.get(workoutId);
          if (workoutData?.y !== undefined && scrollViewRef.current) {
            scrollViewRef.current.scrollTo({ y: workoutData.y - 100, animated: true });
          }
          
          // Remove highlight after a few seconds
          setTimeout(() => setHighlightedWorkoutId(null), 3000);
        }, 500);
      }
      
      // Clear pending navigation
      setPendingWorkoutNavigation(null);
    }
  }, [pendingWorkoutNavigation, feedItems]);

  const openReactModal = (item: FeedItem) => {
    setReactModalItem(item);
    setReactModalKey((k) => k + 1);
    setReactPendingPhoto(null);
    setReactPendingEmoji(null);
    setReactCameraOpen(false);
  };

  const closeReactModal = () => {
    setReactModalItem(null);
    setReactPendingPhoto(null);
    setReactPendingEmoji(null);
    setReactCameraOpen(false);
  };

  const handleTakeReactionPhoto = () => {
    setReactPendingPhoto(null);
    setReactCameraOpen(true);
  };

  const handleReactCameraCapture = (uri: string) => {
    setReactCameraOpen(false);
    setReactPendingPhoto(uri);
  };

  const handlePostReaction = async () => {
    if (!session || !reactModalItem || !reactPendingEmoji) return;
    setReactSubmitting(true);
    
    // Capture the photo URI before clearing state
    const photoUriToUpload = reactPendingPhoto;
    
    const result = await addReaction(
      reactModalItem.workout.id,
      session.user.id,
      reactPendingEmoji,
      photoUriToUpload
    );
    setReactSubmitting(false);
    if ('error' in result) {
      Alert.alert('Reaction failed', result.error.message);
      return;
    }
    
    // Clear the photo state immediately after capturing the URI
    setReactPendingPhoto(null);
    
    setFeedItems((prev) =>
      prev.map((item) =>
        item.workout.id === reactModalItem.workout.id
          ? {
              ...item,
              reactions: [
                ...(item.reactions ?? []).filter((r) => r.user_id !== session.user.id),
                {
                  id: '',
                  workout_id: reactModalItem.workout.id,
                  user_id: session.user.id,
                  emoji: reactPendingEmoji,
                  reaction_image_url: null,
                  created_at: new Date().toISOString(),
                  display_name: profile?.display_name ?? null,
                  avatar_url: profile?.avatar_url ?? null,
                } as WorkoutReactionWithProfile,
              ],
            }
          : item
      )
    );
    closeReactModal();
    refreshFeed();
  };

  const handlePostComment = async (workoutId: string, message: string) => {
    if (!session) return;
    const trimmed = message.trim() || null;
    if (!trimmed) {
      Alert.alert('Add a comment', 'Type something to post.');
      return;
    }
    setCommentSubmittingWorkoutId(workoutId);
    const result = await addComment(workoutId, session.user.id, { message: trimmed });
    setCommentSubmittingWorkoutId(null);
    if ('error' in result) {
      Alert.alert('Comment failed', result.error.message);
      return;
    }
    const newComment: WorkoutCommentWithProfile = {
      id: result.id,
      workout_id: workoutId,
      user_id: session.user.id,
      message: trimmed,
      gif_url: null,
      created_at: new Date().toISOString(),
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
    setFeedItems((prev) =>
      prev.map((i) => {
        if (i.workout.id !== workoutId) return i;
        return { ...i, comments: [...(i.comments ?? []), newComment] };
      })
    );
    if (todayWorkout?.id === workoutId) {
      setTodayWorkoutComments((prev) => [...prev, newComment]);
    }
    if (inlineCommentWorkoutId === workoutId) {
      setInlineCommentWorkoutId(null);
      setInlineCommentMessage('');
    }
    refreshFeed();
  };

  const handleRemoveReaction = async (item: FeedItem) => {
    if (!session) return;
    const existing = item.reactions?.find((r) => r.user_id === session.user.id);
    if (!existing) return;
    const result = await removeReaction(item.workout.id, session.user.id);
    if ('error' in result) {
      Alert.alert('Could not remove', result.error.message);
      return;
    }
    setFeedItems((prev) =>
      prev.map((i) =>
        i.workout.id === item.workout.id
          ? { ...i, reactions: (i.reactions ?? []).filter((r) => r.user_id !== session.user.id) }
          : i
      )
    );
  };


  // Real-time notification subscriptions
  useEffect(() => {
    if (!session) return

    const refreshUnreadCount = () => {
      getUnreadNotificationCount(session.user.id).then(setUnreadCount).catch(() => setUnreadCount(0))
    }

    const channels: ReturnType<typeof supabase.channel>[] = []
    let isMounted = true

    // Subscribe to reactions on user's workouts
    const reactionsChannel = supabase
      .channel('notifications-reactions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workout_reactions',
        },
        (payload) => {
          const workoutId = (payload.new as { workout_id: string }).workout_id
          supabase
            .from('workouts')
            .select('user_id')
            .eq('id', workoutId)
            .single()
            .then(({ data }) => {
              if (data && data.user_id === session.user.id) {
                refreshUnreadCount()
                if (workoutId === todayWorkoutIdRef.current) {
                  getReactionsForWorkouts([workoutId]).then((map) =>
                    setTodayWorkoutReactions(map.get(workoutId) ?? [])
                  )
                }
              }
            })
        }
      )
      .subscribe()
    channels.push(reactionsChannel)

    // Subscribe to comments on user's workouts
    const commentsChannel = supabase
      .channel('notifications-comments')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workout_comments',
        },
        (payload) => {
          const workoutId = (payload.new as { workout_id: string }).workout_id
          supabase
            .from('workouts')
            .select('user_id')
            .eq('id', workoutId)
            .single()
            .then(({ data }) => {
              if (data && data.user_id === session.user.id) {
                refreshUnreadCount()
                if (workoutId === todayWorkoutIdRef.current) {
                  getCommentsForWorkouts([workoutId]).then((map) =>
                    setTodayWorkoutComments(map.get(workoutId) ?? [])
                  )
                }
              }
            })
        }
      )
      .subscribe()
    channels.push(commentsChannel)

    // Subscribe to user achievements
    const achievementsChannel = supabase
      .channel('notifications-achievements')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          refreshUnreadCount()
        }
      )
      .subscribe()
    channels.push(achievementsChannel)

    // Subscribe to friend workouts (for friend_activity notifications)
    getFriends(session.user.id).then((friends) => {
      if (!isMounted) return
      const friendIds = friends.map((f) => f.id)
      if (friendIds.length > 0) {
        const friendWorkoutsChannel = supabase
          .channel('notifications-friend-workouts')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'workouts',
            },
            (payload) => {
              if (friendIds.includes(payload.new.user_id)) {
                refreshUnreadCount()
              }
            }
          )
          .subscribe()
        channels.push(friendWorkoutsChannel)
      }
    })

    // Subscribe to group competitions (user's groups)
    supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        if (!isMounted) return
        if (data && data.length > 0) {
          const userGroupIds = data.map((g) => g.group_id)
          const competitionsChannel = supabase
            .channel('notifications-competitions')
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
                  refreshUnreadCount()
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
  }, [session])

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setTodayWorkout(null);
        setFeedItems([]);
        setAchievementPosts([]);
        setFlashbacks([]);
        return;
      }
      const today = getTodayLocalDate();
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('workout_date', today)
        .maybeSingle()
        .then(({ data }) => setTodayWorkout((data as Workout) ?? null));
      getFriendsWorkouts(session.user.id).then(setFeedItems);
      // Load flashbacks
      getFlashbacks(session.user.id).then(setFlashbacks);
      // Load social nudges
      supabase
        .from('workouts')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('workout_date', today)
        .maybeSingle()
        .then(({ data: w }) => {
          const hasLogged = !!w;
          // Compute XP for level-up nudge
          const xp = computeXP(
            {
              workouts_count: profile?.workouts_count ?? 0,
              streak: profile?.streak ?? 0,
              groups_count: profile?.groups_count ?? 0,
              friends_count: profile?.friends_count ?? 0,
            },
            0 // approximate — skip achievement count for nudge check
          );
          const lvl = getLevelFromXP(xp);
          getSocialNudges(
            session.user.id,
            profile?.streak ?? 0,
            lvl.xp,
            lvl.xpToNext,
            hasLogged
          ).then(setSocialNudges);
        });
      // Load achievement feed posts
      getFriends(session.user.id).then((friends) => {
        const ids = [session.user.id, ...friends.map((f) => f.id)];
        getAchievementFeedPosts(ids, 10).then(setAchievementPosts);
      });
      // Check streak risk (after 6pm and no workout logged today)
      const now = new Date();
      const hour = now.getHours();
      if (hour >= 18 && profile?.streak && profile.streak > 0) {
        supabase
          .from('workouts')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('workout_date', today)
          .maybeSingle()
          .then(({ data: w }) => {
            setStreakAtRisk(!w);
          });
      } else {
        setStreakAtRisk(false);
      }
      // Check if streak freeze is available
      hasStreakFreezeAvailable(session.user.id).then(setFreezeAvailable);
      // Daily reminder (for in-app banner and future push)
      getDailyReminderInfo(session.user.id).then(setReminderInfo);
      // Load unread notification count
      getUnreadNotificationCount(session.user.id).then(setUnreadCount).catch(() => setUnreadCount(0));
    }, [session])
  );

  const streak = profile?.streak ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="title" style={styles.greeting}>
              Uplift
            </ThemedText>
            <ThemedText style={[styles.headerSub, { color: colors.textMuted }]}>
              Become your best self together
            </ThemedText>
          </View>
          <Pressable
            onPress={handleOpenNotifications}
            style={({ pressed }) => [
              styles.notificationsButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            {unreadCount > 0 && (
              <View style={[styles.notificationBadge, { backgroundColor: '#EF4444' }]}>
                <ThemedText style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </ThemedText>
              </View>
            )}
          </Pressable>
        </View>

        {/* Streak banner */}
        <View style={[styles.streakBanner, { backgroundColor: streakAtRisk ? '#EF4444' + '18' : colors.warm + '15' }]}>
          <Ionicons name="flame" size={28} color={streakAtRisk ? '#EF4444' : colors.warm} />
          <View style={styles.streakText}>
            <ThemedText type="defaultSemiBold" style={[styles.streakValue, { color: streakAtRisk ? '#EF4444' : colors.warm }]}>
              {streak > 0 ? `${streak} day streak` : 'No streak yet'}
              {streakAtRisk ? ' ⚠️' : ''}
            </ThemedText>
            <ThemedText style={[styles.streakHint, { color: colors.textMuted }]}>
              {streakAtRisk
                ? "Your streak is at risk! Log a workout before midnight."
                : streak > 0
                  ? 'Keep it going — log today to stay on fire'
                  : 'Log your first workout to start a streak'}
            </ThemedText>
            {streakAtRisk && freezeAvailable && (
              <Pressable
                onPress={async () => {
                  if (!session) return;
                  setFreezeLoading(true);
                  const used = await useStreakFreeze(session.user.id);
                  setFreezeLoading(false);
                  if (used) {
                    setFreezeAvailable(false);
                    setStreakAtRisk(false);
                    Alert.alert('Streak Frozen! ❄️', 'Your streak is safe for today. You get 1 freeze per month.');
                  } else {
                    Alert.alert('Already used', 'You already used your streak freeze this month.');
                  }
                }}
                disabled={freezeLoading}
                style={[styles.freezeButton, { backgroundColor: '#3B82F6' }]}
              >
                {freezeLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.freezeButtonText}>❄️ Use Streak Freeze</ThemedText>
                )}
              </Pressable>
            )}
          </View>
        </View>

{/* Daily reminder banner — only when notifications on and haven't posted today */}
        {profile?.notifications_enabled !== false &&
          reminderInfo &&
          !reminderInfo.hasPostedToday &&
          getReminderMessage(reminderInfo) && (
            <Pressable
              onPress={() => router.push('/log-workout')}
              style={[
                styles.reminderBanner,
                {
                  backgroundColor:
                    reminderInfo.hoursLeftUntilCutoff !== null &&
                    reminderInfo.hoursLeftUntilCutoff <= 3
                      ? colors.tint + '20'
                      : colors.cardElevated,
                  borderColor: colors.tabBarBorder,
                },
              ]}
            >
              <Ionicons
                name="notifications"
                size={22}
                color={
                  reminderInfo.hoursLeftUntilCutoff !== null &&
                  reminderInfo.hoursLeftUntilCutoff <= 3
                    ? colors.tint
                    : colors.textMuted
                }
              />
              <ThemedText
                style={[styles.reminderBannerText, { color: colors.text }]}
                numberOfLines={2}
              >
                {getReminderMessage(reminderInfo)}
              </ThemedText>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          )}

        {/* Social nudges */}
        {socialNudges.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nudgeScroll}
            style={styles.nudgeScrollView}
          >
            {socialNudges.map((nudge, idx) => (
              <View
                key={`nudge-${idx}`}
                style={[styles.nudgeCard, { backgroundColor: colors.card }]}
              >
                <ThemedText style={styles.nudgeEmoji}>{nudge.emoji}</ThemedText>
                <ThemedText style={[styles.nudgeTitle, { color: colors.text }]} numberOfLines={2}>
                  {nudge.title}
                </ThemedText>
                <ThemedText style={[styles.nudgeMessage, { color: colors.textMuted }]} numberOfLines={2}>
                  {nudge.message}
                </ThemedText>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionPill,
              { backgroundColor: todayWorkout ? colors.tint : colors.tint },
              pressed && styles.actionPillPressed,
            ]}
            onPress={() => router.push('/log-workout')}
          >
            <Ionicons
              name={todayWorkout ? 'checkmark-circle' : 'camera'}
              size={18}
              color="#fff"
            />
            <ThemedText style={styles.actionPillText}>
              {todayWorkout ? 'Logged' : 'Log workout'}
            </ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionPillOutline,
              { borderColor: colors.tint + '50', backgroundColor: colors.cardElevated },
              pressed && styles.actionPillPressed,
            ]}
            onPress={() => router.push({ pathname: '/leaderboard', params: { scope: 'global' } })}
          >
            <Ionicons name="trophy" size={18} color={colors.tint} />
            <ThemedText style={[styles.actionPillTextOutline, { color: colors.text }]}>
              Top athletes
            </ThemedText>
          </Pressable>
        </View>

        {/* Today's workout */}
        {todayWorkout && (
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Today&apos;s workout
            </ThemedText>
            <View style={[styles.todayCard, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.tint + '10' }]}>
              <ZoomableFeedImage
                imageUrl={todayWorkout.image_url}
                secondaryImageUrl={todayWorkout.secondary_image_url}
                style={styles.todayImage}
              />
              <View style={styles.captionRow}>
                <ThemedText style={styles.todayTypeEmoji}>{getWorkoutTypeEmoji(todayWorkout.workout_type)}</ThemedText>
                {todayWorkout.caption ? (
                  <ThemedText style={[styles.todayCaption, { color: colors.text }]}>
                    {todayWorkout.caption}
                  </ThemedText>
                ) : null}
              </View>
              {/* Friends' reactions on your post */}
              <View style={[styles.reactionRow, { borderTopColor: colors.tint + '10' }]}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.reactionBubbles}
                >
                  {todayWorkoutReactions.map((r) => (
                    <Pressable key={r.id} onPress={() => setViewReaction(r)} style={({ pressed }) => [styles.reactionBubbleWrap, pressed && { opacity: 0.7 }]}>
                      <View style={styles.reactionBubble}>
                        <View style={styles.reactionBubblePhotoWrap}>
                          {r.reaction_image_url ? (
                            <Image source={{ uri: r.reaction_image_url }} style={styles.reactionBubbleImage} />
                          ) : (
                            <View style={[styles.reactionBubblePlaceholder, { backgroundColor: colors.tint + '25' }]}>
                              {r.avatar_url ? (
                                <Image source={{ uri: r.avatar_url }} style={styles.reactionBubbleImage} />
                              ) : (
                                <ThemedText style={[styles.reactionBubbleInitials, { color: colors.tint }]}>
                                  {getInitials(r.display_name)}
                                </ThemedText>
                              )}
                            </View>
                          )}
                        </View>
                        <View style={styles.reactionEmojiBadge}>
                          <ThemedText style={styles.reactionEmojiText}>{r.emoji}</ThemedText>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              {/* Comments on your post */}
              <View style={[styles.commentsSection, { borderTopColor: colors.tint + '10' }]}>
                {todayWorkoutComments.map((c) => (
                  <View key={c.id} style={styles.commentRow}>
                    <Pressable
                      style={[styles.commentAvatar, { backgroundColor: colors.tint + '20' }]}
                      onPress={() => c.user_id !== session?.user?.id && router.push(`/friend-profile?id=${c.user_id}`)}
                    >
                      {c.avatar_url ? (
                        <Image source={{ uri: c.avatar_url }} style={styles.commentAvatarImage} />
                      ) : (
                        <ThemedText style={[styles.commentAvatarInitials, { color: colors.tint }]}>
                          {getInitials(c.display_name)}
                        </ThemedText>
                      )}
                    </Pressable>
                    <View style={styles.commentBody}>
                      <ThemedText type="defaultSemiBold" style={[styles.commentAuthor, { color: colors.text }]}>
                        {c.display_name || 'Anonymous'}
                      </ThemedText>
                      {c.message ? (
                        <ThemedText style={[styles.commentText, { color: colors.text }]}>{c.message}</ThemedText>
                      ) : null}
                    </View>
                  </View>
                ))}
                {session && (
                  <View style={styles.commentInlineRow}>
                    <TextInput
                      style={[
                        styles.commentInlineInput,
                        {
                          backgroundColor: colors.cardElevated,
                          color: colors.text,
                          borderColor: colors.tabBarBorder,
                        },
                      ]}
                      placeholder="Add a comment..."
                      placeholderTextColor={colors.textMuted}
                      value={inlineCommentWorkoutId === todayWorkout.id ? inlineCommentMessage : ''}
                      onChangeText={(text) => {
                        if (inlineCommentWorkoutId === todayWorkout.id) setInlineCommentMessage(text);
                      }}
                      onFocus={() => {
                        setInlineCommentWorkoutId(todayWorkout.id);
                        setInlineCommentMessage('');
                      }}
                      multiline
                      maxLength={500}
                    />
                    <Pressable
                      onPress={() =>
                        handlePostComment(
                          todayWorkout.id,
                          inlineCommentWorkoutId === todayWorkout.id ? inlineCommentMessage : ''
                        )
                      }
                      disabled={
                        commentSubmittingWorkoutId === todayWorkout.id ||
                        (inlineCommentWorkoutId === todayWorkout.id ? !inlineCommentMessage.trim() : true)
                      }
                      style={({ pressed }) => [
                        styles.commentInlinePostBtn,
                        {
                          opacity:
                            inlineCommentWorkoutId === todayWorkout.id && inlineCommentMessage.trim()
                              ? pressed ? 0.7 : 1
                              : 0.4,
                        },
                      ]}
                    >
                      {commentSubmittingWorkoutId === todayWorkout.id ? (
                        <ActivityIndicator color={colors.tint} size="small" />
                      ) : (
                        <ThemedText
                          style={[
                            styles.commentInlinePostText,
                            {
                              color:
                                inlineCommentWorkoutId === todayWorkout.id && inlineCommentMessage.trim()
                                  ? colors.tint
                                  : colors.textMuted,
                            },
                          ]}
                        >
                          Post
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Flashbacks — nostalgia cards */}
        {flashbacks.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Flashbacks ✨
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.flashbackScroll}
            >
              {flashbacks.map((fb) => (
                <View
                  key={fb.period}
                  style={[styles.flashbackCard, { backgroundColor: colors.card }]}
                >
                  <View style={[styles.flashbackBadge, { backgroundColor: colors.tint + '18' }]}>
                    <ThemedText style={styles.flashbackEmoji}>{fb.emoji}</ThemedText>
                    <ThemedText style={[styles.flashbackLabel, { color: colors.tint }]}>
                      {fb.label}
                    </ThemedText>
                  </View>
                  <ZoomableFeedImage
                    imageUrl={fb.workout.image_url}
                    secondaryImageUrl={fb.workout.secondary_image_url}
                    style={styles.flashbackImage}
                  />
                  {(fb.workout.caption || fb.workout.workout_type) ? (
                    <View style={styles.flashbackCaptionWrap}>
                      {fb.workout.workout_type ? (
                        <ThemedText style={styles.flashbackTypeEmoji}>{getWorkoutTypeEmoji(fb.workout.workout_type)}</ThemedText>
                      ) : null}
                      {fb.workout.caption ? (
                        <ThemedText
                          style={[styles.flashbackCaption, { color: colors.text }]}
                          numberOfLines={2}
                        >
                          {fb.workout.caption}
                        </ThemedText>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.flashbackDateWrap}>
                    <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                    <ThemedText style={[styles.flashbackDate, { color: colors.textMuted }]}>
                      {new Date(
                        Number(fb.workout.workout_date.slice(0, 4)),
                        Number(fb.workout.workout_date.slice(5, 7)) - 1,
                        Number(fb.workout.workout_date.slice(8, 10))
                      ).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Achievement announcements */}
        {achievementPosts.length > 0 && (
          <View style={styles.section}>
            {achievementPosts.map((post) => (
              <Pressable
                key={post.id}
                style={[styles.achievementFeedCard, { backgroundColor: colors.card, borderColor: colors.tint + '30' }]}
                onPress={() => {
                  if (post.user_id !== session?.user?.id) {
                    router.push(`/friend-profile?id=${post.user_id}`);
                  }
                }}
              >
                <View style={styles.achievementFeedRow}>
                  <View style={[styles.achievementFeedIconWrap, { backgroundColor: colors.tint + '15' }]}>
                    <ThemedText style={styles.achievementFeedIcon}>
                      {post.achievement_icon ?? '🏅'}
                    </ThemedText>
                  </View>
                  <View style={styles.achievementFeedTextBlock}>
                    <ThemedText style={[styles.achievementFeedMessage, { color: colors.text }]}>
                      {post.message}
                    </ThemedText>
                    <ThemedText style={[styles.achievementFeedTime, { color: colors.textMuted }]}>
                      {formatFeedDate(post.created_at.slice(0, 10))}
                    </ThemedText>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Feed */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Feed
          </ThemedText>
          {feedItems.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardElevated }]}>
              <Ionicons name="people-outline" size={32} color={colors.textMuted + '60'} style={{ marginBottom: 8 }} />
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                Add friends to see their workout posts here
              </ThemedText>
            </View>
          ) : (
            <View style={styles.feedList}>
              {feedItems.map((item, index) => {
                const isHighlighted = highlightedWorkoutId === item.workout.id;
                return (
                <View
                  key={item.workout.id}
                  ref={(ref) => {
                    if (ref) {
                      const existing = workoutRefs.current.get(item.workout.id) || { ref: null, y: 0 };
                      workoutRefs.current.set(item.workout.id, { ...existing, ref });
                    }
                  }}
                  onLayout={(event) => {
                    const { y } = event.nativeEvent.layout;
                    const existing = workoutRefs.current.get(item.workout.id) || { ref: null, y: 0 };
                    workoutRefs.current.set(item.workout.id, { ...existing, y });
                  }}
                  style={[
                    styles.feedCard,
                    { backgroundColor: colors.card, borderColor: colors.tint + '10' },
                    isHighlighted && { borderWidth: 2, borderColor: colors.tint },
                  ]}
                >
                  <View style={styles.feedCardHeader}>
                    <Pressable
                      style={styles.feedCardHeaderLeft}
                      onPress={() => router.push(`/friend-profile?id=${item.workout.user_id}`)}
                    >
                      <View style={[styles.feedAvatar, { backgroundColor: colors.tint + '18', borderColor: colors.tint + '50' }]}>
                        {item.avatar_url ? (
                          <Image source={{ uri: item.avatar_url }} style={styles.feedAvatarImage} />
                        ) : (
                          <ThemedText style={[styles.feedAvatarInitials, { color: colors.tint }]}>
                            {getInitials(item.display_name)}
                          </ThemedText>
                        )}
                      </View>
                      <View style={styles.feedCardMeta}>
                        <ThemedText type="defaultSemiBold" style={[styles.feedName, { color: colors.text }]}>
                          {item.display_name || 'Anonymous'}
                        </ThemedText>
                        <ThemedText style={[styles.feedDate, { color: colors.textMuted }]}>
                          {formatFeedDate(item.workout.workout_date)}
                          {' · '}
                          <ThemedText style={styles.feedTypeEmoji}>{getWorkoutTypeEmoji(item.workout.workout_type)}</ThemedText>
                        </ThemedText>
                      </View>
                    </Pressable>
                    {item.workout.user_id !== session?.user?.id && (
                      <Pressable
                        onPress={() => {
                          setReportTarget({
                            workoutId: item.workout.id,
                            name: `${item.display_name}'s post`,
                          });
                          setReportModalVisible(true);
                        }}
                        style={({ pressed }) => [
                          styles.feedCardMenuButton,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                  <ZoomableFeedImage
                    imageUrl={item.workout.image_url}
                    secondaryImageUrl={item.workout.secondary_image_url}
                    style={styles.feedImage}
                  />
                  {item.workout.caption ? (
                    <ThemedText style={[styles.feedCaption, { color: colors.text }]}>
                      {item.workout.caption}
                    </ThemedText>
                  ) : null}
                  {/* Tagged friends */}
                  {(item.tags ?? []).length > 0 && (
                    <View style={styles.taggedRow}>
                      <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                      <ThemedText style={[styles.taggedLabel, { color: colors.textMuted }]}>with </ThemedText>
                      {(item.tags ?? []).map((tag, tIdx) => (
                        <Pressable key={tag.id} onPress={() => router.push(`/friend-profile?id=${tag.tagged_user_id}`)}>
                          <ThemedText style={[styles.taggedName, { color: colors.tint }]}>
                            {tag.display_name || 'Friend'}{tIdx < (item.tags?.length ?? 0) - 1 ? ', ' : ''}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <View style={[styles.reactionRow, { borderTopColor: colors.tint + '10' }]}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.reactionBubbles}
                    >
                      {(item.reactions ?? []).map((r) => (
                        <Pressable key={r.id} onPress={() => setViewReaction(r)} style={({ pressed }) => [styles.reactionBubbleWrap, pressed && { opacity: 0.7 }]}>
                          <View style={styles.reactionBubble}>
                            <View style={styles.reactionBubblePhotoWrap}>
                              {r.reaction_image_url ? (
                                <Image source={{ uri: r.reaction_image_url }} style={styles.reactionBubbleImage} />
                              ) : (
                                <View style={[styles.reactionBubblePlaceholder, { backgroundColor: colors.tint + '25' }]}>
                                  {r.avatar_url ? (
                                    <Image source={{ uri: r.avatar_url }} style={styles.reactionBubbleImage} />
                                  ) : (
                                    <ThemedText style={[styles.reactionBubbleInitials, { color: colors.tint }]}>
                                      {getInitials(r.display_name)}
                                    </ThemedText>
                                  )}
                                </View>
                              )}
                            </View>
                            <View style={styles.reactionEmojiBadge}>
                              <ThemedText style={styles.reactionEmojiText}>{r.emoji}</ThemedText>
                            </View>
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                    {session && (() => {
                      const myReaction = item.reactions?.find((r) => r.user_id === session.user.id);
                      return myReaction ? (
                        <Pressable
                          onPress={() => handleRemoveReaction(item)}
                          style={[styles.reactButton, { backgroundColor: colors.textMuted + '15', borderColor: colors.textMuted + '25' }]}
                        >
                          <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                          <ThemedText style={[styles.reactButtonText, { color: colors.textMuted }]}>
                            Remove
                          </ThemedText>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => openReactModal(item)}
                          style={[styles.reactButton, { backgroundColor: colors.tint + '15', borderColor: colors.tint + '30' }]}
                        >
                          <Ionicons name="add-circle-outline" size={16} color={colors.tint} />
                          <ThemedText style={[styles.reactButtonText, { color: colors.tint }]}>React</ThemedText>
                        </Pressable>
                      );
                    })()}
                  </View>
                  {/* Comments — Instagram-style: all comments visible + inline add */}
                  <View style={[styles.commentsSection, { borderTopColor: colors.tint + '10' }]}>
                    {(item.comments ?? []).map((c) => {
                      const isOwner = session?.user?.id === item.workout.user_id;
                      return (
                        <View key={c.id} style={styles.commentRow}>
                          <View style={[styles.commentAvatar, { backgroundColor: colors.tint + '20' }]}>
                            {c.avatar_url ? (
                              <Image source={{ uri: c.avatar_url }} style={styles.commentAvatarImage} />
                            ) : (
                              <ThemedText style={[styles.commentAvatarInitials, { color: colors.tint }]}>
                                {getInitials(c.display_name)}
                              </ThemedText>
                            )}
                          </View>
                          <View style={styles.commentBody}>
                            <ThemedText type="defaultSemiBold" style={[styles.commentAuthor, { color: colors.text }]}>
                              {c.display_name || 'Anonymous'}
                            </ThemedText>
                            {c.message ? (
                              <ThemedText style={[styles.commentText, { color: colors.text }]}>{c.message}</ThemedText>
                            ) : null}
                            {isOwner && (
                              <Pressable
                                style={styles.commentReplyBtn}
                                onPress={() => {
                                  const firstName =
                                    (c.display_name || '')
                                      .trim()
                                      .split(/\s+/)[0] || 'friend';
                                  setInlineCommentWorkoutId(item.workout.id);
                                  setInlineCommentMessage(`@${firstName} `);
                                }}
                              >
                                <ThemedText style={[styles.commentReplyText, { color: colors.textMuted }]}>
                                  Reply
                                </ThemedText>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    })}
                    {session && (
                      <View style={styles.commentInlineRow}>
                        <TextInput
                          style={[
                            styles.commentInlineInput,
                            {
                              backgroundColor: colors.cardElevated,
                              color: colors.text,
                              borderColor: colors.tabBarBorder,
                            },
                          ]}
                          placeholder="Add a comment..."
                          placeholderTextColor={colors.textMuted}
                          value={inlineCommentWorkoutId === item.workout.id ? inlineCommentMessage : ''}
                          onChangeText={(text) => {
                            if (inlineCommentWorkoutId === item.workout.id) setInlineCommentMessage(text);
                          }}
                          onFocus={() => {
                            setInlineCommentWorkoutId(item.workout.id);
                            setInlineCommentMessage('');
                          }}
                          multiline
                          maxLength={500}
                        />
                        <Pressable
                          onPress={() =>
                            handlePostComment(
                              item.workout.id,
                              inlineCommentWorkoutId === item.workout.id ? inlineCommentMessage : ''
                            )
                          }
                          disabled={
                            commentSubmittingWorkoutId === item.workout.id ||
                            (inlineCommentWorkoutId === item.workout.id ? !inlineCommentMessage.trim() : true)
                          }
                          style={({ pressed }) => [
                            styles.commentInlinePostBtn,
                            {
                              opacity:
                                inlineCommentWorkoutId === item.workout.id && inlineCommentMessage.trim()
                                  ? pressed
                                    ? 0.7
                                    : 1
                                  : 0.4,
                            },
                          ]}
                        >
                          {commentSubmittingWorkoutId === item.workout.id ? (
                            <ActivityIndicator color={colors.tint} size="small" />
                          ) : (
                            <ThemedText
                              style={[
                                styles.commentInlinePostText,
                                {
                                  color:
                                    inlineCommentWorkoutId === item.workout.id && inlineCommentMessage.trim()
                                      ? colors.tint
                                      : colors.textMuted,
                                },
                              ]}
                            >
                              Post
                            </ThemedText>
                          )}
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!reactModalItem && !reactCameraOpen}
        transparent
        animationType="slide"
        onRequestClose={closeReactModal}
      >
        <Pressable style={styles.reactModalOverlay} onPress={closeReactModal}>
          <View key={reactModalKey} style={[styles.reactModalContent, { backgroundColor: colors.card }]}>
            <ThemedText type="subtitle" style={[styles.reactModalTitle, { color: colors.text }]}>
              Add reaction
            </ThemedText>
            <ThemedText style={[styles.reactModalHint, { color: colors.textMuted }]}>
              Take a selfie and pick an emoji
            </ThemedText>
            <Pressable
              onPress={handleTakeReactionPhoto}
              style={[styles.reactPhotoBox, { backgroundColor: colors.cardElevated, borderColor: colors.tabBarBorder }]}
            >
              {reactPendingPhoto ? (
                <Image source={{ uri: reactPendingPhoto }} style={styles.reactPhotoPreview} />
              ) : (
                <>
                  <Ionicons name="camera" size={36} color={colors.textMuted} />
                  <ThemedText style={[styles.reactPhotoLabel, { color: colors.textMuted }]}>Take photo</ThemedText>
                </>
              )}
            </Pressable>
            <View style={styles.reactEmojiRow}>
              {REACTION_EMOJIS_FREQUENT.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => setReactPendingEmoji(emoji)}
                  style={[
                    styles.reactEmojiOption,
                    { backgroundColor: reactPendingEmoji === emoji ? colors.tint + '25' : colors.cardElevated },
                    reactPendingEmoji === emoji && { borderColor: colors.tint, borderWidth: 2 },
                  ]}
                >
                  <ThemedText style={styles.reactEmojiOptionText}>{emoji}</ThemedText>
                </Pressable>
              ))}
            </View>
            <ScrollView style={styles.reactEmojiScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {REACTION_EMOJI_SECTIONS.map((section) => (
                <View key={section.title} style={styles.reactEmojiSection}>
                  <ThemedText style={[styles.reactEmojiSectionTitle, { color: colors.textMuted }]}>{section.title}</ThemedText>
                  <View style={styles.reactEmojiGrid}>
                    {section.emojis.map((emoji) => (
                      <Pressable
                        key={emoji}
                        onPress={() => setReactPendingEmoji(emoji)}
                        style={[
                          styles.reactEmojiGridItem,
                          reactPendingEmoji === emoji && { backgroundColor: colors.tint + '25', borderColor: colors.tint, borderWidth: 2 },
                        ]}
                      >
                        <ThemedText style={styles.reactEmojiOptionText}>{emoji}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.reactModalActions}>
              <Pressable
                onPress={handlePostReaction}
                disabled={!reactPendingEmoji || reactSubmitting}
                style={[
                  styles.reactSubmitButton,
                  { backgroundColor: reactPendingEmoji ? colors.tint : colors.textMuted + '40' },
                ]}
              >
                {reactSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText style={styles.reactSubmitButtonText}>Post reaction</ThemedText>
                )}
              </Pressable>
              <Pressable onPress={closeReactModal} style={[styles.reactCancelButton, { borderColor: colors.tabBarBorder }]}>
                <ThemedText style={[styles.reactCancelText, { color: colors.textMuted }]}>Cancel</ThemedText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>


      <Modal visible={reactCameraOpen} animationType="slide" presentationStyle="fullScreen">
        <CameraCapture
          onCapture={handleReactCameraCapture}
          onClose={() => setReactCameraOpen(false)}
          quality={0.7}
        />
      </Modal>

      {/* Reaction detail view modal */}
      <Modal
        visible={!!viewReaction}
        transparent
        animationType="fade"
        onRequestClose={() => setViewReaction(null)}
      >
        <Pressable style={styles.reactionViewOverlay} onPress={() => setViewReaction(null)}>
          <View style={styles.reactionViewCenter}>
            {/* Tappable profile ring — like Instagram story */}
            <Pressable
              onPress={() => {
                const userId = viewReaction?.user_id;
                setViewReaction(null);
                if (userId && userId !== session?.user?.id) {
                  router.push({ pathname: '/friend-profile', params: { id: userId } });
                } else if (userId === session?.user?.id) {
                  router.push('/(tabs)/profile');
                }
              }}
              style={({ pressed }) => [
                styles.reactionViewRing,
                { borderColor: colors.tint },
                pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
              ]}
            >
              <View style={[styles.reactionViewImageWrap, { backgroundColor: colors.tint + '15' }]}>
                {viewReaction?.reaction_image_url ? (
                  <Image
                    source={{ uri: viewReaction.reaction_image_url }}
                    style={styles.reactionViewImage}
                    contentFit="cover"
                  />
                ) : viewReaction?.avatar_url ? (
                  <Image
                    source={{ uri: viewReaction.avatar_url }}
                    style={styles.reactionViewImage}
                    contentFit="cover"
                  />
                ) : (
                  <ThemedText style={[styles.reactionViewInitials, { color: colors.tint }]}>
                    {getInitials(viewReaction?.display_name ?? null)}
                  </ThemedText>
                )}
              </View>
            </Pressable>

            {/* Emoji below the ring */}
            <ThemedText style={styles.reactionViewEmoji}>{viewReaction?.emoji}</ThemedText>

            {/* Name + "View profile" hint */}
            <ThemedText type="defaultSemiBold" style={[styles.reactionViewName, { color: '#fff' }]} numberOfLines={1}>
              {viewReaction?.display_name || 'Anonymous'}
            </ThemedText>
            <ThemedText style={styles.reactionViewHint}>Tap photo to view profile</ThemedText>
          </View>
        </Pressable>
      </Modal>

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => {
          setNotificationsVisible(false);
          // Refresh unread count after closing
          if (session) {
            getUnreadNotificationCount(session.user.id).then(setUnreadCount).catch(() => setUnreadCount(0));
          }
        }}
        onNavigateToWorkout={navigateToWorkout}
      />

      {/* Report Modal */}
      {session && reportTarget && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => {
            setReportModalVisible(false);
            setReportTarget(null);
          }}
          reporterId={session.user.id}
          reportedUserId={reportTarget.userId}
          reportedWorkoutId={reportTarget.workoutId}
          reportedGroupId={reportTarget.groupId}
          reportedEntityName={reportTarget.name}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  greeting: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 3, letterSpacing: 0.2 },
  notificationsButton: {
    position: 'relative',
    padding: 8,
    marginLeft: 12,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },

  // Streak banner
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 18,
    marginBottom: 20,
    gap: 14,
  },
  streakText: { flex: 1 },
  streakValue: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  streakHint: { fontSize: 12, marginTop: 3, letterSpacing: 0.1 },
  freezeButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: 'flex-start',
    alignItems: 'center',
  },
  freezeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  reminderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reminderBannerText: { flex: 1, fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },

  // Quick actions — pill buttons
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 15,
    borderRadius: 14,
  },
  actionPillOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  actionPillPressed: { opacity: 0.75 },
  actionPillText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  actionPillTextOutline: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  // Sections
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14, letterSpacing: -0.3, textTransform: 'uppercase' },

  // Today's workout — rectangular (4:5) like BeReal so photos aren't cropped
  todayCard: { borderRadius: 16, overflow: 'hidden' },
  todayImage: { width: '100%', aspectRatio: 4 / 5 },
  dualPhotoCorner: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: '30%',
    aspectRatio: 4 / 5,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
  },
  dualPhotoCornerImage: { width: '100%', height: '100%' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  todayTypeEmoji: { fontSize: 18 },
  todayCaption: { flex: 1, fontSize: 14, lineHeight: 21, letterSpacing: 0.1 },

  // Empty state
  emptyCard: {
    padding: 36,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 22, letterSpacing: 0.1 },

  // Feed
  feedList: { gap: 28 },
  feedCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  feedCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  feedCardMenuButton: {
    padding: 8,
    marginLeft: 8,
  },
  feedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
    borderWidth: 2,
  },
  feedAvatarImage: { width: 44, height: 44 },
  feedAvatarInitials: { fontSize: 15, fontWeight: '700' },
  feedCardMeta: { flex: 1 },
  feedName: { fontSize: 15, fontWeight: '800', letterSpacing: 0.1 },
  feedDate: { fontSize: 11, marginTop: 2, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: '500' },
  feedTypeEmoji: { textTransform: 'none' },
  feedImage: { width: '100%', aspectRatio: 4 / 5 },
  feedCaption: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, fontSize: 14, lineHeight: 21, letterSpacing: 0.15 },

  // Tagged friends
  taggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 4,
    flexWrap: 'wrap',
  },
  taggedLabel: { fontSize: 13, fontWeight: '500' },
  taggedName: { fontSize: 13, fontWeight: '700' },

  // Reactions (BeReal-style)
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  reactionBubbles: { flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 0 },
  reactionBubbleWrap: {
    width: 48,
    height: 48,
  },
  reactionBubble: {
    width: 48,
    height: 48,
  },
  reactionBubblePhotoWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  reactionBubblePlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reactionBubbleImage: { width: 38, height: 38 },
  reactionBubbleInitials: { fontSize: 12, fontWeight: '600' },
  reactionEmojiBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    overflow: 'visible',
  },
  reactionEmojiText: { fontSize: 15, lineHeight: 20 },

  // Reaction detail view modal — Instagram-style
  reactionViewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionViewCenter: {
    alignItems: 'center',
  },
  reactionViewRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  reactionViewImageWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionViewImage: {
    width: 120,
    height: 120,
  },
  reactionViewInitials: {
    fontSize: 34,
    fontWeight: '700',
  },
  reactionViewEmoji: {
    fontSize: 32,
    lineHeight: 38,
    textAlign: 'center',
    marginBottom: 6,
  },
  reactionViewName: {
    fontSize: 15,
    maxWidth: 180,
    textAlign: 'center',
    marginBottom: 4,
  },
  reactionViewHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },

  reactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  reactButtonText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  // Comments
  commentsSection: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  commentAvatarImage: { width: 30, height: 30 },
  commentAvatarInitials: { fontSize: 11, fontWeight: '700' },
  commentBody: { flex: 1, minWidth: 0 },
  commentAuthor: { fontSize: 13, fontWeight: '800', marginBottom: 2, letterSpacing: 0.1 },
  commentText: { fontSize: 13, lineHeight: 19, letterSpacing: 0.15 },
  commentReplyBtn: { marginTop: 4 },
  commentReplyText: { fontSize: 12, fontWeight: '600' },
  commentGif: { width: 120, height: 90, borderRadius: 10, marginTop: 6 },
  commentInlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  commentInlineInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 40,
    maxHeight: 80,
  },
  commentInlinePostBtn: { paddingVertical: 10, paddingHorizontal: 6, justifyContent: 'center' },
  commentInlinePostText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  // React modal
  reactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reactModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  reactModalTitle: { marginBottom: 4, textAlign: 'center', fontWeight: '800', letterSpacing: -0.3 },
  reactModalHint: { fontSize: 12, textAlign: 'center', marginBottom: 20, letterSpacing: 0.1 },
  reactPhotoBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    overflow: 'hidden',
  },
  reactPhotoPreview: { width: 120, height: 120, borderRadius: 60 },
  reactPhotoLabel: { fontSize: 12, marginTop: 6 },
  reactEmojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  reactEmojiScroll: {
    flexShrink: 1,
    marginBottom: 20,
  },
  reactEmojiSection: {
    marginBottom: 12,
  },
  reactEmojiSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 2,
  },
  reactEmojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reactEmojiGridItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactEmojiOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'visible',
  },
  reactEmojiOptionText: { fontSize: 24, lineHeight: 32 },
  reactModalActions: { gap: 10 },
  reactSubmitButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  reactSubmitButtonText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  reactCancelButton: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  reactCancelText: { fontSize: 15 },

  // Social nudge cards
  nudgeScrollView: { marginBottom: 16 },
  nudgeScroll: { gap: 10, paddingRight: 4 },
  nudgeCard: {
    width: 200,
    padding: 14,
    borderRadius: 14,
    overflow: 'visible',
  },
  nudgeEmoji: { fontSize: 22, marginBottom: 6, lineHeight: 30 },
  nudgeTitle: { fontSize: 12, fontWeight: '800', marginBottom: 3, letterSpacing: 0.2 },
  nudgeMessage: { fontSize: 11, lineHeight: 16, letterSpacing: 0.1 },

  // Flashback cards
  flashbackScroll: { gap: 14, paddingRight: 4 },
  flashbackCard: {
    width: 220,
    borderRadius: 16,
    overflow: 'hidden',
  },
  flashbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  flashbackEmoji: { fontSize: 18 },
  flashbackLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  flashbackImage: {
    width: 220,
    aspectRatio: 4 / 5,
  },
  flashbackCaptionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  flashbackTypeEmoji: { fontSize: 16 },
  flashbackCaption: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  flashbackDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },
  flashbackDate: { fontSize: 11 },

  // Achievement feed cards
  achievementFeedCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    overflow: 'visible',
  },
  achievementFeedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  achievementFeedIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  achievementFeedIcon: { fontSize: 22, lineHeight: 30 },
  achievementFeedTextBlock: { flex: 1, minWidth: 0 },
  achievementFeedMessage: { fontSize: 13, fontWeight: '700', lineHeight: 19, letterSpacing: 0.1 },
  achievementFeedTime: { fontSize: 10, marginTop: 3, fontWeight: '600', letterSpacing: 0.2, textTransform: 'uppercase' },
});
