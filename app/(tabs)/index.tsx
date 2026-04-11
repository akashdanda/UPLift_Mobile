import { CameraCapture } from '@/components/camera-capture';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';

import { NotificationsModal } from '@/components/notifications-modal';
import { ReactionsAddIcon } from '@/components/reactions-add-icon';
import { ReportModal } from '@/components/report-modal';
import { ThemedText } from '@/components/themed-text';
import { BrandViolet, Colors, Fonts } from '@/constants/theme';
import { useAuthContext } from '@/hooks/use-auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { hasStreakFreezeAvailable } from '@/lib/streak-freeze';
import { addComment, getCommentsForWorkouts } from '@/lib/comments';
import {
  getDailyReminderInfo,
  type DailyReminderInfo
} from '@/lib/daily-reminder';
import { formatGymLabel, getFriendsWorkouts, getGlobalWorkouts, type FeedItem } from '@/lib/feed';
import { getFriends } from '@/lib/friends';
import { computeXP, getLevelFromXP } from '@/lib/levels';
import { getUnreadNotificationCount, markNotificationsAsRead } from '@/lib/notifications';
import { addReaction, getReactionsForWorkouts, removeReaction } from '@/lib/reactions';
import { getSocialNudges, type SocialNudge } from '@/lib/social-hooks';
import { supabase } from '@/lib/supabase';
import type { WorkoutCommentWithProfile } from '@/types/comment';
import type { WorkoutReactionWithProfile } from '@/types/reaction';
import { WORKOUT_TYPES, type Workout } from '@/types/workout';

const { width: SCREEN_W } = Dimensions.get('window');
const REACT_MODAL_H_PAD = 48;
const REACT_EMOJI_GAP = 8;
const REACT_EMOJI_COLS = 6;
/** One screen — no nested emoji scroll */
const reactEmojiCellSize = Math.min(
  46,
  Math.floor(
    (SCREEN_W - REACT_MODAL_H_PAD - REACT_EMOJI_GAP * (REACT_EMOJI_COLS - 1)) / REACT_EMOJI_COLS,
  ),
);

/** Curated picker (gym + hype + faces); 6×3 grid */
const REACTION_PICKER_EMOJIS = [
  '🔥', '💪', '👍', '❤️', '😂', '😮',
  '🙌', '😊', '🏋️', '🏃', '⚡', '🎯',
  '🤩', '😍', '👏', '🫶', '💯', '✨',
] as const;

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
    // Make the tap-to-swap feel instant (before finger lifts),
    // and reset any pinch zoom so the swap isn't delayed by zoom state.
    scale.value = 1
    savedScale.value = 1
    setFrontImage((f) => (f === 'primary' ? 'secondary' : 'primary'));
  };

  return (
    <View style={[style, { position: 'relative', overflow: 'hidden' }]}>
      <GestureDetector gesture={pinchGesture}>
        <Animated.View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.Image source={{ uri: mainUrl }} style={[{ width: '100%', height: '100%' }, animatedImageStyle]} />
        </Animated.View>
      </GestureDetector>
      <Pressable style={styles.dualPhotoCorner} onPressIn={toggle}>
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
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuthContext();
  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null);
  const [todayWorkoutGymLabel, setTodayWorkoutGymLabel] = useState<string | null>(null);
  const [todayWorkoutReactions, setTodayWorkoutReactions] = useState<WorkoutReactionWithProfile[]>([]);
  const [todayWorkoutComments, setTodayWorkoutComments] = useState<WorkoutCommentWithProfile[]>([]);
  const todayWorkoutIdRef = useRef<string | null>(null);
  const [feedTab, setFeedTab] = useState<'friends' | 'public'>('friends');
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [globalFeedItems, setGlobalFeedItems] = useState<FeedItem[]>([]);
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
  const [commentModalWorkoutId, setCommentModalWorkoutId] = useState<string | null>(null);
  const [commentModalMessage, setCommentModalMessage] = useState('');
  const [commentSubmittingWorkoutId, setCommentSubmittingWorkoutId] = useState<string | null>(null);
  const commentInputRef = useRef<TextInput>(null);

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

  useEffect(() => {
    const gymId = todayWorkout?.gym_id;
    if (!gymId) {
      setTodayWorkoutGymLabel(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('gyms')
      .select('name,address')
      .eq('id', gymId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setTodayWorkoutGymLabel(formatGymLabel(data.name, data.address));
      });
    return () => {
      cancelled = true;
    };
  }, [todayWorkout?.gym_id]);

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
    if (!session) return;
    getFriendsWorkouts(session.user.id).then((items) => {
      setFeedItems(items);
      if (items.length === 0) setFeedTab('public');
    });
    getGlobalWorkouts(session.user.id).then(setGlobalFeedItems);
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
        // If it's a comment notification, open comment modal
        if (expandComments) {
          setCommentModalWorkoutId(workoutId);
          setCommentModalMessage('');
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
    // Clear the message but keep modal open
    setCommentModalMessage('');
    refreshFeed();
  };

  // Share state: when set, renders a hidden composite view that gets captured
  type ShareData = {
    primaryUrl: string;
    secondaryUrl?: string | null;
    workoutType?: string | null;
    workoutDate?: string | null;
    caption?: string | null;
    displayName?: string | null;
  };
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const shareViewRef = useRef<ViewShot>(null);

  const handleShareWorkout = (
    imageUrl: string,
    secondaryImageUrl?: string | null,
    workoutType?: string | null,
    workoutDate?: string | null,
    caption?: string | null,
    displayName?: string | null,
  ) => {
    // Always render the branded composite card (with or without dual camera)
    setShareData({
      primaryUrl: imageUrl,
      secondaryUrl: secondaryImageUrl,
      workoutType,
      workoutDate,
      caption,
      displayName,
    });
  };

  // Capture the composite view once it renders
  useEffect(() => {
    if (!shareData) return;
    // Give the images a moment to load before capturing
    const timer = setTimeout(async () => {
      try {
        const uri = await shareViewRef.current?.capture?.();
        if (!uri) {
          Alert.alert('Share failed', 'Could not compose the image.');
          setShareData(null);
          return;
        }
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert('Sharing not available', 'Sharing is not supported on this device.');
          setShareData(null);
          return;
        }
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          UTI: 'public.jpeg',
        });
      } catch (e: any) {
        console.warn('Share error:', e);
        Alert.alert('Share failed', e?.message ?? 'Could not share this workout.');
      } finally {
        setShareData(null);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [shareData]);

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

    const refreshTodayReactions = (workoutId: string) => {
      if (workoutId !== todayWorkoutIdRef.current) return
      getReactionsForWorkouts([workoutId]).then((map) =>
        setTodayWorkoutReactions(map.get(workoutId) ?? [])
      )
    }

    const refreshTodayComments = (workoutId: string) => {
      if (workoutId !== todayWorkoutIdRef.current) return
      getCommentsForWorkouts([workoutId]).then((map) =>
        setTodayWorkoutComments(map.get(workoutId) ?? [])
      )
    }

    // Subscribe to reactions on user's workouts (INSERT/UPDATE/DELETE)
    const reactionsChannel = supabase.channel('notifications-reactions')
    ;(['INSERT', 'UPDATE', 'DELETE'] as const).forEach((eventType) => {
      reactionsChannel.on(
        'postgres_changes',
        {
          event: eventType,
          schema: 'public',
          table: 'workout_reactions',
        },
        (payload: any) => {
          const workoutId =
            payload?.new?.workout_id ?? payload?.old?.workout_id ?? undefined
          if (!workoutId) return

          supabase
            .from('workouts')
            .select('user_id')
            .eq('id', workoutId)
            .maybeSingle()
            .then(({ data }) => {
              if (data && data.user_id === session.user.id) {
                refreshUnreadCount()
                refreshTodayReactions(workoutId)
              }
            })
        }
      )
    })
    reactionsChannel.subscribe()
    channels.push(reactionsChannel)

    // Subscribe to comments on user's workouts (INSERT/UPDATE/DELETE)
    const commentsChannel = supabase.channel('notifications-comments')
    ;(['INSERT', 'UPDATE', 'DELETE'] as const).forEach((eventType) => {
      commentsChannel.on(
        'postgres_changes',
        {
          event: eventType,
          schema: 'public',
          table: 'workout_comments',
        },
        (payload: any) => {
          const workoutId =
            payload?.new?.workout_id ?? payload?.old?.workout_id ?? undefined
          if (!workoutId) return

          supabase
            .from('workouts')
            .select('user_id')
            .eq('id', workoutId)
            .maybeSingle()
            .then(({ data }) => {
              if (data && data.user_id === session.user.id) {
                refreshUnreadCount()
                refreshTodayComments(workoutId)
              }
            })
        }
      )
    })
    commentsChannel.subscribe()
    channels.push(commentsChannel)

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
        return;
      }
      const today = getTodayLocalDate();
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('workout_date', today)
        .maybeSingle()
        .then(async ({ data }) => {
          const workout = (data as Workout) ?? null;
          setTodayWorkout(workout);
        });
      getFriendsWorkouts(session.user.id).then((items) => {
        setFeedItems(items);
        if (items.length === 0) setFeedTab('public');
      });
      getGlobalWorkouts(session.user.id).then(setGlobalFeedItems);
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
            0
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
  const reactionPostButtonSolid = !!reactPendingEmoji || reactSubmitting;

  return (
  <>
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — Friends / Global feed scope + notifications */}
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.greeting}>
            UPLIFT
          </ThemedText>
          <View style={styles.headerActions}>
            <View
              style={[
                styles.feedScopeSegmented,
                {
                  backgroundColor: colorScheme === 'dark' ? colors.cardElevated : colors.card,
                  borderColor: colors.tabBarBorder,
                },
              ]}
            >
              <Pressable
                onPress={() => setFeedTab('friends')}
                accessibilityRole="button"
                accessibilityLabel="Friends feed"
                accessibilityState={{ selected: feedTab === 'friends' }}
                style={[
                  styles.feedScopeSeg,
                  feedTab === 'friends' && { backgroundColor: colors.tint },
                ]}
              >
                <Ionicons
                  name={feedTab === 'friends' ? 'people' : 'people-outline'}
                  size={18}
                  color={feedTab === 'friends' ? '#fff' : colors.textMuted}
                />
              </Pressable>
              <Pressable
                onPress={() => setFeedTab('public')}
                accessibilityRole="button"
                accessibilityLabel="Global feed"
                accessibilityState={{ selected: feedTab === 'public' }}
                style={[
                  styles.feedScopeSeg,
                  feedTab === 'public' && { backgroundColor: colors.tint },
                ]}
              >
                <Ionicons
                  name={feedTab === 'public' ? 'globe' : 'globe-outline'}
                  size={18}
                  color={feedTab === 'public' ? '#fff' : colors.textMuted}
                />
              </Pressable>
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
        </View>

        {/* Today's workout */}
        {todayWorkout && (
          <View style={styles.feedCard}>
            <View style={styles.feedImageContainer}>
              <ZoomableFeedImage
                imageUrl={todayWorkout.image_url}
                secondaryImageUrl={todayWorkout.secondary_image_url}
                style={styles.feedImage}
              />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.feedGradient}>
                <View style={styles.feedOverlayInfo}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold" style={styles.feedOverlayName}>
                      Your workout
            </ThemedText>
                    {todayWorkout.caption ? (
                      <ThemedText style={styles.feedOverlayCaption} numberOfLines={1}>
                        {todayWorkout.caption}
                      </ThemedText>
                    ) : null}
                    {todayWorkoutGymLabel ? (
                      <View style={styles.feedOverlayLocationRow}>
                        <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.78)" />
                        <ThemedText style={styles.feedOverlayLocation} numberOfLines={2}>
                          {todayWorkoutGymLabel}
                        </ThemedText>
                      </View>
                    ) : null}
                    <ThemedText style={styles.feedOverlayMeta}>
                      {getWorkoutTypeEmoji(todayWorkout.workout_type)} Today
            </ThemedText>
          </View>
        </View>
              </LinearGradient>
              {/* Action buttons on right side */}
              <View style={styles.feedActionColumn}>
          <Pressable
                  onPress={() => {
                    setCommentModalWorkoutId(todayWorkout.id);
                    setCommentModalMessage('');
                  }}
                  style={styles.feedActionBtn}
                >
                  <Ionicons name="chatbubble" size={24} color="rgba(255,255,255,0.9)" />
                  {todayWorkoutComments.length > 0 && (
                    <ThemedText style={styles.feedActionCount}>
                      {todayWorkoutComments.length}
            </ThemedText>
                  )}
          </Pressable>
          <Pressable
                  onPress={() => handleShareWorkout(todayWorkout.image_url, todayWorkout.secondary_image_url, todayWorkout.workout_type, todayWorkout.workout_date, todayWorkout.caption, profile?.display_name)}
                  style={styles.feedActionBtn}
                >
                  <Ionicons name="paper-plane" size={22} color="rgba(255,255,255,0.9)" />
                </Pressable>
              </View>
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
              {/* Comments tap-to-open */}
              {todayWorkoutComments.length > 0 && (
                <Pressable
                  style={styles.viewCommentsBtn}
                  onPress={() => {
                    setCommentModalWorkoutId(todayWorkout.id);
                    setCommentModalMessage('');
                  }}
                >
                  <ThemedText style={[styles.viewCommentsText, { color: colors.textMuted }]}>
                    View {todayWorkoutComments.length === 1 ? '1 comment' : `all ${todayWorkoutComments.length} comments`}
                  </ThemedText>
                </Pressable>
              )}
          </View>
        )}

        {/* Feed */}
        <View style={styles.feedSection}>
          {(feedTab === 'friends' ? feedItems : globalFeedItems).length === 0 ? (
            !todayWorkout ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.cardElevated, marginHorizontal: 20, borderColor: colors.tint + '25' }]}>
                <Ionicons
                  name={feedTab === 'friends' ? 'people-outline' : 'globe-outline'}
                  size={32}
                  color={colors.textMuted + '60'}
                  style={{ marginBottom: 8 }}
                />
                <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                  {feedTab === 'friends'
                    ? 'Add friends to see their workout posts here'
                    : 'No global posts yet — be the first to share with everyone!'}
                </ThemedText>
                {feedTab === 'friends' && (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/(tabs)/profile', params: { friends: '1' } })
                    }
                    style={[styles.emptyCta, { backgroundColor: colors.tint }]}
                  >
                    <ThemedText style={styles.emptyCtaText}>Find friends</ThemedText>
                  </Pressable>
                )}
              </View>
            ) : null
          ) : (
            <View style={styles.feedList}>
              {(feedTab === 'friends' ? feedItems : globalFeedItems).map((item) => {
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
                    isHighlighted && { borderWidth: 2, borderColor: colors.tint },
                  ]}
                >
                  {/* Image with overlays */}
                  <View style={styles.feedImageContainer}>
                    <ZoomableFeedImage
                      imageUrl={item.workout.image_url}
                      secondaryImageUrl={item.workout.secondary_image_url}
                      style={styles.feedImage}
                    />
                    {/* Bottom gradient with user info */}
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.feedGradient}>
                      <Pressable
                        style={styles.feedOverlayInfo}
                        onPress={() => router.push(`/friend-profile?id=${item.workout.user_id}`)}
                      >
                        <View style={styles.feedOverlayAvatar}>
                      {item.avatar_url ? (
                            <Image source={{ uri: item.avatar_url }} style={styles.feedOverlayAvatarImg} />
                      ) : (
                            <ThemedText style={styles.feedOverlayAvatarInitials}>
                          {getInitials(item.display_name)}
                        </ThemedText>
                      )}
                    </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText type="defaultSemiBold" style={styles.feedOverlayName}>
                        {item.display_name || 'Anonymous'}
                      </ThemedText>
                          {item.workout.caption ? (
                            <ThemedText style={styles.feedOverlayCaption} numberOfLines={1}>
                              {item.workout.caption}
                            </ThemedText>
                          ) : null}
                          {item.gym_label ? (
                            <View style={styles.feedOverlayLocationRow}>
                              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.78)" />
                              <ThemedText style={styles.feedOverlayLocation} numberOfLines={2}>
                                {item.gym_label}
                              </ThemedText>
                            </View>
                          ) : null}
                          <ThemedText style={styles.feedOverlayMeta}>
                            {getWorkoutTypeEmoji(item.workout.workout_type)}{' '}
                        {formatFeedDate(item.workout.workout_date)}
                      </ThemedText>
                    </View>
                      </Pressable>
                    </LinearGradient>
                    {/* Action buttons on right side */}
                    <View style={styles.feedActionColumn}>
                <Pressable
                  onPress={() => {
                    setCommentModalWorkoutId(item.workout.id);
                    setCommentModalMessage('');
                  }}
                  style={styles.feedActionBtn}
                >
                        <Ionicons name="chatbubble" size={24} color="rgba(255,255,255,0.9)" />
                        {(item.comments ?? []).length > 0 && (
                          <ThemedText style={styles.feedActionCount}>
                            {(item.comments ?? []).length}
                          </ThemedText>
                        )}
                      </Pressable>
                      {item.workout.user_id === session?.user?.id && (
                        <Pressable
                          onPress={() => handleShareWorkout(item.workout.image_url, item.workout.secondary_image_url, item.workout.workout_type, item.workout.workout_date, item.workout.caption, item.display_name)}
                          style={styles.feedActionBtn}
                        >
                          <Ionicons name="paper-plane" size={22} color="rgba(255,255,255,0.9)" />
                        </Pressable>
                      )}
                      {item.workout.user_id !== session?.user?.id && (
                        <Pressable
                          onPress={() => {
                            setReportTarget({
                              workoutId: item.workout.id,
                              name: `${item.display_name}'s post`,
                            });
                            setReportModalVisible(true);
                          }}
                          style={styles.feedActionBtn}
                        >
                          <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.6)" />
                        </Pressable>
                      )}
                  </View>
                  </View>
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
                  {/* Reaction row — add control uses reactions glyph (not a plain +) */}
                  <View style={[styles.reactionRow, { borderTopColor: colors.tint + '10' }]}>
                    {/* Add reaction */}
                    {session && (
                      <Pressable
                        onPress={() => {
                          const myReaction = item.reactions?.find((r) => r.user_id === session.user.id);
                          if (myReaction) {
                            handleRemoveReaction(item);
                          } else {
                            openReactModal(item);
                          }
                        }}
                        style={({ pressed }) => [
                          styles.addReactionBtn,
                          { borderColor: colors.tint + '50' },
                          pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
                        ]}
                      >
                        <ReactionsAddIcon size={20} color={colors.tint} />
                      </Pressable>
                    )}
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
                  </View>
                  {/* Comments — tap to open modal */}
                  {(item.comments ?? []).length > 0 && (
                    <Pressable
                      style={styles.viewCommentsBtn}
                      onPress={() => {
                        setCommentModalWorkoutId(item.workout.id);
                        setCommentModalMessage('');
                      }}
                    >
                      <ThemedText style={[styles.viewCommentsText, { color: colors.textMuted }]}>
                        {(item.comments ?? []).length === 1
                          ? 'View 1 comment'
                          : `View all ${(item.comments ?? []).length} comments`}
                      </ThemedText>
                    </Pressable>
                  )}
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
        <View style={styles.reactModalOverlay}>
          <Pressable style={styles.reactModalDismiss} onPress={closeReactModal} />
          <View
            key={reactModalKey}
            style={[
              styles.reactModalContent,
              {
                backgroundColor: colors.card,
                paddingBottom: Math.max(20, insets.bottom + 16),
              },
            ]}
          >
            <LinearGradient
              colors={[BrandViolet.deep, BrandViolet.primary, BrandViolet.highlight]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.reactModalAccentBar, { width: SCREEN_W, marginLeft: -24 }]}
            />
            <View style={[styles.reactModalHandle, { backgroundColor: colors.textMuted + '40' }]} />
            <View
              style={[
                styles.reactModalHeaderBlock,
                { borderBottomColor: colors.tint + '12', backgroundColor: colors.tint + '06' },
              ]}
            >
              <View style={styles.reactModalTitleRow}>
                <View style={[styles.reactModalIconBadge, { backgroundColor: colors.tint + '18', borderColor: colors.tint + '35' }]}>
                  <ReactionsAddIcon size={22} color={colors.tint} />
                </View>
                <View style={styles.reactModalTitleStack}>
                  <ThemedText style={[styles.reactModalTitle, { color: colors.text }]}>
                    Add reaction
                  </ThemedText>
                  <ThemedText style={[styles.reactModalHint, { color: colors.textMuted }]}>
                    Optional selfie — choose an emoji to send
                  </ThemedText>
                </View>
              </View>
            </View>
            <Pressable
              onPress={handleTakeReactionPhoto}
              style={({ pressed }) => [
                styles.reactPhotoBox,
                {
                  borderColor: reactPendingPhoto ? colors.tint + '70' : colors.tint + '40',
                  shadowColor: BrandViolet.primary,
                  opacity: pressed ? 0.94 : 1,
                },
              ]}
            >
              {reactPendingPhoto ? (
                <Image source={{ uri: reactPendingPhoto }} style={styles.reactPhotoPreview} />
              ) : (
                <>
                  <LinearGradient
                    colors={
                      colorScheme === 'dark'
                        ? [BrandViolet.shadow, BrandViolet.deep + 'E6', colors.cardElevated]
                        : [colors.cardElevated, BrandViolet.primary + '18', '#F5F2FC']
                    }
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={styles.reactPhotoInner}>
                    <Ionicons name="camera" size={34} color={colors.tint} />
                    <ThemedText style={[styles.reactPhotoLabel, { color: colors.text }]}>Take photo</ThemedText>
                  </View>
                </>
              )}
            </Pressable>
            <ThemedText style={[styles.reactEmojiSectionLabel, { color: colors.tint + 'CC' }]}>
              Pick emoji
            </ThemedText>
            <View style={[styles.reactEmojiPickerGrid, { gap: REACT_EMOJI_GAP }]}>
              {REACTION_PICKER_EMOJIS.map((emoji) => {
                const selected = reactPendingEmoji === emoji;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setReactPendingEmoji(emoji);
                    }}
                    style={({ pressed }) => [
                      styles.reactEmojiCell,
                      {
                        width: reactEmojiCellSize,
                        height: reactEmojiCellSize,
                        borderRadius: reactEmojiCellSize / 2,
                        backgroundColor: selected ? colors.tint + '28' : colors.cardElevated,
                        borderColor: selected ? colors.tint : colors.tabBarBorder,
                        transform: [{ scale: pressed ? 0.94 : selected ? 1.04 : 1 }],
                        shadowColor: selected ? colors.tint : 'transparent',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: selected ? 0.45 : 0,
                        shadowRadius: selected ? 8 : 0,
                        elevation: selected ? 3 : 0,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[styles.reactEmojiCellText, { fontSize: Math.round(reactEmojiCellSize * 0.5) }]}
                    >
                      {emoji}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.reactModalActions}>
              <Pressable
                onPress={handlePostReaction}
                disabled={!reactPendingEmoji || reactSubmitting}
                style={({ pressed }) => [
                  styles.reactSubmitButton,
                  reactionPostButtonSolid
                    ? {
                        backgroundColor: colors.tint,
                        shadowColor: BrandViolet.primary,
                        opacity: pressed && !reactSubmitting ? 0.9 : 1,
                      }
                    : {
                        backgroundColor: colors.tint + '12',
                        borderWidth: 1.5,
                        borderColor: colors.tint + '40',
                        shadowOpacity: 0,
                        elevation: 0,
                      },
                ]}
              >
                {reactSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText
                    style={[
                      styles.reactSubmitButtonText,
                      !reactPendingEmoji && { color: colors.textMuted },
                    ]}
                  >
                    Post reaction
                  </ThemedText>
                )}
              </Pressable>
              <Pressable
                onPress={closeReactModal}
                style={({ pressed }) => [styles.reactCancelButton, { opacity: pressed ? 0.75 : 1 }]}
              >
                <ThemedText style={[styles.reactCancelText, { color: colors.textMuted }]}>Cancel</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={reactCameraOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReactCameraOpen(false)}>
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

      {/* Comments Modal — Instagram-style bottom sheet */}
      <Modal
        visible={!!commentModalWorkoutId}
        transparent
        animationType="slide"
        onRequestClose={() => setCommentModalWorkoutId(null)}
      >
        <Pressable
          style={styles.commentModalOverlay}
          onPress={() => setCommentModalWorkoutId(null)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.commentModalKeyboard}
          >
            <Pressable
              style={[styles.commentModalSheet, { backgroundColor: colors.card }]}
              onPress={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <View style={styles.commentModalHandle}>
                <View style={[styles.commentModalHandleBar, { backgroundColor: colors.textMuted + '40' }]} />
              </View>

              {/* Title */}
              <ThemedText type="defaultSemiBold" style={[styles.commentModalTitle, { color: colors.text }]}>
                Comments
              </ThemedText>

              {/* Comment list */}
              <ScrollView
                style={styles.commentModalScroll}
                contentContainerStyle={styles.commentModalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {(() => {
                  // Gather comments for the active workout
                  let comments: WorkoutCommentWithProfile[] = [];
                  let isOwnPost = false;
                  if (commentModalWorkoutId && todayWorkout?.id === commentModalWorkoutId) {
                    comments = todayWorkoutComments;
                    isOwnPost = true;
                  } else if (commentModalWorkoutId) {
                    const feedItem = feedItems.find((fi) => fi.workout.id === commentModalWorkoutId);
                    comments = feedItem?.comments ?? [];
                    isOwnPost = feedItem?.workout.user_id === session?.user?.id;
                  }

                  if (comments.length === 0) {
                    return (
                      <View style={styles.commentModalEmpty}>
                        <ThemedText style={[styles.commentModalEmptyText, { color: colors.textMuted }]}>
                          No comments yet. Be the first!
                        </ThemedText>
                      </View>
                    );
                  }

                  return comments.map((c) => (
                    <View key={c.id} style={styles.commentRow}>
                      <Pressable
                        style={[styles.commentAvatar, { backgroundColor: colors.tint + '20' }]}
                        onPress={() => {
                          if (c.user_id !== session?.user?.id) {
                            setCommentModalWorkoutId(null);
                            router.push(`/friend-profile?id=${c.user_id}`);
                          }
                        }}
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
                        {/* Reply — on own posts or to other people's comments */}
                        {(isOwnPost || c.user_id !== session?.user?.id) && c.user_id !== session?.user?.id && (
                          <Pressable
                            style={styles.commentReplyBtn}
                            onPress={() => {
                              const firstName =
                                (c.display_name || '').trim().split(/\s+/)[0] || 'friend';
                              setCommentModalMessage(`@${firstName} `);
                              commentInputRef.current?.focus();
                            }}
                          >
                            <ThemedText style={[styles.commentReplyText, { color: colors.textMuted }]}>
                              Reply
                            </ThemedText>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ));
                })()}
              </ScrollView>

              {/* Input row */}
              {session && commentModalWorkoutId && (
                <View style={[styles.commentModalInputRow, { borderTopColor: colors.textMuted + '20' }]}>
                  <TextInput
                    ref={commentInputRef}
                    style={[
                      styles.commentModalInput,
                      {
                        backgroundColor: colors.cardElevated,
                        color: colors.text,
                        borderColor: colors.tabBarBorder,
                      },
                    ]}
                    placeholder="Add a comment..."
                    placeholderTextColor={colors.textMuted}
                    value={commentModalMessage}
                    onChangeText={setCommentModalMessage}
                    multiline
                    maxLength={500}
                  />
                  <Pressable
                    onPress={() => {
                      if (commentModalWorkoutId) {
                        handlePostComment(commentModalWorkoutId, commentModalMessage);
                      }
                    }}
                    disabled={
                      !commentModalWorkoutId ||
                      commentSubmittingWorkoutId === commentModalWorkoutId ||
                      !commentModalMessage.trim()
                    }
                    style={({ pressed }) => [
                      styles.commentModalPostBtn,
                      {
                        opacity: commentModalMessage.trim()
                          ? pressed ? 0.7 : 1
                          : 0.4,
                      },
                    ]}
                  >
                    {commentSubmittingWorkoutId === commentModalWorkoutId ? (
                      <ActivityIndicator color={colors.tint} size="small" />
                    ) : (
                      <Ionicons
                        name="send"
                        size={20}
                        color={commentModalMessage.trim() ? colors.tint : colors.textMuted}
                      />
                    )}
                  </Pressable>
                </View>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
    {/* Share card — story-optimized 9:16 branded card, rendered off-screen */}
    <Modal visible={!!shareData} transparent animationType="none" statusBarTranslucent>
      {shareData && (() => {
        const wt = WORKOUT_TYPES.find((t) => t.value === shareData.workoutType);
        const dateLabel = shareData.workoutDate ? formatFeedDate(shareData.workoutDate) : 'Today';
        const screenW = Dimensions.get('window').width;
        const cardW = screenW;
        const cardH = cardW * (16 / 9);
        return (
          <View style={{ position: 'absolute', left: -screenW * 2, top: 0 }} collapsable={false}>
            <ViewShot
              ref={shareViewRef}
              options={{ format: 'jpg', quality: 0.95 }}
              style={{ width: cardW, height: cardH, backgroundColor: '#000' }}
            >
              {/* Full-bleed workout photo */}
              <Image
                source={{ uri: shareData.primaryUrl }}
                style={{ position: 'absolute', width: cardW, height: cardH }}
                contentFit="cover"
              />

              {/* Dark overlay for readability */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                style={{
                  position: 'absolute',
                  width: cardW,
                  height: cardH,
                }}
              />

              {/* Top bar — left: UPLIFT; right: workout type */}
              <View style={shareStyles.topBar}>
                <View style={shareStyles.brandPill}>
                  <ThemedText style={shareStyles.brandText}>UPLIFT</ThemedText>
                </View>
                {wt && (
                  <View style={shareStyles.typePill}>
                    <ThemedText style={shareStyles.typePillEmoji}>{wt.emoji}</ThemedText>
                    <ThemedText style={shareStyles.typePillLabel}>{wt.label}</ThemedText>
                  </View>
                )}
              </View>

              {/* Selfie overlay — top-left with glow border */}
              {shareData.secondaryUrl && shareData.secondaryUrl.trim().length > 0 && (
                <View style={shareStyles.selfieContainer}>
                  <Image
                    source={{ uri: shareData.secondaryUrl }}
                    style={shareStyles.selfieImage}
                    contentFit="cover"
                  />
                </View>
              )}

              {/* Bottom info panel — name + date (bottom-left) */}
              <View style={shareStyles.bottomPanel}>
                {shareData.displayName && (
                  <ThemedText style={shareStyles.displayName} numberOfLines={1}>
                    {shareData.displayName}
                  </ThemedText>
                )}
                {shareData.caption && shareData.caption.trim().length > 0 && (
                  <ThemedText style={shareStyles.caption} numberOfLines={2}>
                    {shareData.caption}
                  </ThemedText>
                )}
                <View style={shareStyles.metaRow}>
                  <View style={shareStyles.datePill}>
                    <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.7)" />
                    <ThemedText style={shareStyles.dateText}>{dateLabel}</ThemedText>
                  </View>
                </View>
              </View>
            </ViewShot>
          </View>
        );
      })()}
    </Modal>
  </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollView: { flex: 1 },
  content: { paddingTop: 10, paddingBottom: 40 },
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 20,
    gap: 12,
  },
  greeting: { fontSize: 24, fontWeight: '800', letterSpacing: 4, flexShrink: 0 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  feedScopeSegmented: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  feedScopeSeg: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationsButton: {
    position: 'relative',
    padding: 8,
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

  // Sections
  section: { marginBottom: 20, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12, letterSpacing: -0.3 },

  // Dual photo overlay (BeReal-style)
  dualPhotoCorner: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: '26%',
    aspectRatio: 2 / 3,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.9)',
    zIndex: 5,
  },
  dualPhotoCornerImage: { width: '100%', height: '100%' },

  // Share watermark
  shareWatermark: {
    position: 'absolute',
    top: 14,
    left: 14,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Empty state
  emptyCard: {
    padding: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 22, letterSpacing: 0.1 },
  emptyCta: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Feed — fullscreen style
  feedSection: { marginBottom: 20 },
  feedList: { gap: 16, paddingHorizontal: 12 },
  feedCard: {
    overflow: 'hidden',
    marginBottom: 0,
    backgroundColor: '#13101A',
    borderRadius: 20,
    },
  feedImageContainer: {
    position: 'relative',
  },
  feedImage: { width: '100%', aspectRatio: 10 / 16, borderRadius: 20 },
  feedGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 64,
    paddingBottom: 16,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  feedOverlayInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feedOverlayAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedOverlayAvatarImg: { width: 34, height: 34 },
  feedOverlayAvatarInitials: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  feedOverlayName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedOverlayCaption: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedOverlayLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 6,
    paddingRight: 8,
  },
  feedOverlayLocation: {
    flex: 1,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  feedOverlayMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Action buttons on right side of image
  feedActionColumn: {
    position: 'absolute',
    right: 14,
    bottom: 16,
    alignItems: 'center',
    gap: 20,
  },
  feedActionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  feedActionCount: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Tagged friends
  taggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 4,
    flexWrap: 'wrap',
  },
  taggedLabel: { fontSize: 13, fontWeight: '500' },
  taggedName: { fontSize: 13, fontWeight: '700' },

  // Reactions (BeReal-style)
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 0,
    gap: 10,
  },
  addReactionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 6,
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

  // "View comments" link on cards
  viewCommentsBtn: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
  },
  viewCommentsText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Comment modal — Instagram-style bottom sheet
  commentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  commentModalKeyboard: {
    justifyContent: 'flex-end',
  },
  commentModalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    minHeight: 300,
    },
  commentModalHandle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  commentModalHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  commentModalTitle: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.1,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  commentModalScroll: {
    flex: 1,
  },
  commentModalScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  commentModalEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  commentModalEmptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
  commentModalInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentModalInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 40,
    maxHeight: 80,
  },
  commentModalPostBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // React modal
  reactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  reactModalDismiss: {
    flex: 1,
  },
  reactModalContent: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 0,
    overflow: 'hidden',
    maxHeight: '82%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  reactModalAccentBar: {
    height: 3,
    marginBottom: 8,
  },
  reactModalHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 10,
  },
  reactModalHeaderBlock: {
    marginHorizontal: -24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reactModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  reactModalIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactModalTitleStack: {
    flex: 1,
    gap: 4,
  },
  reactModalTitle: {
    fontWeight: '800',
    letterSpacing: -0.35,
    fontFamily: Fonts?.rounded,
    fontSize: 19,
  },
  reactModalHint: {
    fontSize: 13,
    letterSpacing: 0.12,
    lineHeight: 18,
    textAlign: 'left',
  },
  reactPhotoBox: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: BrandViolet.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  reactPhotoInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  reactPhotoPreview: { width: 128, height: 128, borderRadius: 64 },
  reactPhotoLabel: { fontSize: 12, marginTop: 8, fontFamily: Fonts?.rounded, fontWeight: '700' },
  reactEmojiSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 2,
    fontFamily: Fonts?.rounded,
  },
  reactEmojiPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 22,
  },
  reactEmojiCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  reactEmojiCellText: {
    textAlign: 'center',
  },
  reactModalActions: { gap: 10 },
  reactSubmitButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  reactSubmitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
    fontFamily: Fonts?.rounded,
  },
  reactCancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  reactCancelText: { fontSize: 15, fontWeight: '600', fontFamily: Fonts?.rounded },
});

// ─── Share Card Styles (story-optimized) ─────────────────
const shareStyles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 40,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  brandPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  brandText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 3,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  typePillEmoji: {
    fontSize: 14,
  },
  typePillLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  selfieContainer: {
    position: 'absolute',
    top: 90,
    left: 24,
    width: '24%',
    aspectRatio: 2 / 3,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    zIndex: 5,
    },
  selfieImage: {
    width: '100%',
    height: '100%',
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    zIndex: 10,
    paddingBottom: 8,
  },
  displayName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: 10,
  },
  caption: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  dateText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});