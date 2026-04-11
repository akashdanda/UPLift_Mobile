import { CameraCapture } from '@/components/camera-capture';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
  View
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';

import { NotificationsModal } from '@/components/notifications-modal';
import { ReactionsIcon } from '@/components/reactions-icon';
import { ReportModal } from '@/components/report-modal';
import { ThemedText } from '@/components/themed-text';
import { BrandViolet, Colors } from '@/constants/theme';
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
import { getWeeklySpotlightSet, REACTION_STAPLES } from '@/lib/weekly-reaction-emojis';

const REACT_MODAL_PAD_X = 22;
const REACT_EMOJI_GUTTER = 10;

function chunkEven<T>(items: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

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

/** Short relative time for comment timestamps (e.g. "2m", "3h", "Apr 4"). */
function formatCommentTimeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - t) / 1000);
  if (diffSec < 45) return 'Just now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const d = new Date(iso);
  const yNow = new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== yNow ? { year: 'numeric' as const } : {}),
  });
}

const COMMENT_REPLY_PREVIEW = 2;

type CommentTreeNode = WorkoutCommentWithProfile & { children: CommentTreeNode[] };

function buildCommentTree(flat: WorkoutCommentWithProfile[]): CommentTreeNode[] {
  const normalized = flat.map((c) => ({
    ...c,
    parent_id: c.parent_id ?? null,
  }));
  const map = new Map<string, CommentTreeNode>();
  for (const c of normalized) {
    map.set(c.id, { ...c, children: [] });
  }
  const roots: CommentTreeNode[] = [];
  for (const c of normalized) {
    const node = map.get(c.id)!;
    if (!c.parent_id) {
      roots.push(node);
    } else {
      const parent = map.get(c.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }
  const sortByTime = (a: CommentTreeNode, b: CommentTreeNode) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  roots.sort(sortByTime);
  const sortDeep = (n: CommentTreeNode) => {
    n.children.sort(sortByTime);
    n.children.forEach(sortDeep);
  };
  roots.forEach(sortDeep);
  return roots;
}

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]?.[0]) return parts[0][0].toUpperCase();
  }
  return '?';
}

type CommentBranchProps = {
  node: CommentTreeNode;
  depth: number;
  session: { user: { id: string } } | null;
  colors: (typeof Colors)['light'] | (typeof Colors)['dark'];
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onReply: (c: WorkoutCommentWithProfile) => void;
  onOpenProfile: (userId: string) => void;
  onCloseModal: () => void;
};

function CommentBranch({
  node,
  depth,
  session,
  colors,
  expanded,
  setExpanded,
  onReply,
  onOpenProfile,
  onCloseModal,
}: CommentBranchProps) {
  const isNested = depth > 0;
  const children = node.children;
  const isThreadOpen = expanded[node.id] ?? false;
  const preview = COMMENT_REPLY_PREVIEW;
  const shownChildren = isThreadOpen ? children : children.slice(0, preview);
  const hiddenReplyCount = isThreadOpen ? 0 : Math.max(0, children.length - preview);
  const threadBorder = colors.textMuted + (isNested ? '38' : '42');

  return (
    <View>
      <View style={styles.commentSheetRow}>
        <Pressable
          style={[
            isNested ? styles.commentAvatarSm : styles.commentAvatar,
            { backgroundColor: colors.tint + '22' },
          ]}
          onPress={() => {
            if (session && node.user_id !== session.user.id) {
              onCloseModal();
              onOpenProfile(node.user_id);
            }
          }}
        >
          {node.avatar_url ? (
            <Image
              source={{ uri: node.avatar_url }}
              style={isNested ? styles.commentAvatarSmImg : styles.commentAvatarImage}
            />
          ) : (
            <ThemedText
              style={[isNested ? styles.commentAvatarSmInit : styles.commentAvatarInitials, { color: colors.tint }]}
            >
              {getInitials(node.display_name)}
            </ThemedText>
          )}
        </Pressable>
        <View style={styles.commentBody}>
          <View style={styles.commentMetaRow}>
            <ThemedText type="defaultSemiBold" numberOfLines={1} style={[styles.commentAuthor, { color: colors.text }]}>
              {node.display_name || 'Anonymous'}
            </ThemedText>
            <ThemedText style={[styles.commentTime, { color: colors.textMuted }]}>
              {formatCommentTimeAgo(node.created_at)}
            </ThemedText>
          </View>
          {node.message ? (
            <ThemedText style={[styles.commentText, { color: colors.text }]}>{node.message}</ThemedText>
          ) : null}
          {session && (
            <Pressable
              style={styles.commentReplyBtn}
              onPress={() => onReply(node)}
              hitSlop={6}
            >
              <ThemedText style={[styles.commentReplyText, { color: colors.textMuted }]}>Reply</ThemedText>
            </Pressable>
          )}
        </View>
      </View>

      {children.length > 0 && (
        <View
          style={[
            styles.commentRepliesGroup,
            {
              marginLeft: depth === 0 ? 36 : 6,
              borderLeftColor: threadBorder,
            },
          ]}
        >
          {shownChildren.map((child) => (
            <CommentBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              session={session}
              colors={colors}
              expanded={expanded}
              setExpanded={setExpanded}
              onReply={onReply}
              onOpenProfile={onOpenProfile}
              onCloseModal={onCloseModal}
            />
          ))}

          {hiddenReplyCount > 0 && (
            <Pressable
              style={styles.commentViewMoreRow}
              onPress={() => setExpanded((p) => ({ ...p, [node.id]: true }))}
              hitSlop={8}
            >
              <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
              <ThemedText style={[styles.commentViewMoreText, { color: colors.textMuted }]}>
                View {hiddenReplyCount} more {hiddenReplyCount === 1 ? 'reply' : 'replies'}
              </ThemedText>
            </Pressable>
          )}

          {isThreadOpen && children.length > preview && (
            <Pressable
              style={styles.commentViewMoreRow}
              onPress={() => setExpanded((p) => ({ ...p, [node.id]: false }))}
              hitSlop={8}
            >
              <Ionicons name="chevron-up" size={13} color={colors.textMuted} />
              <ThemedText style={[styles.commentViewMoreText, { color: colors.textMuted }]}>Hide replies</ThemedText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
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
  const isDark = colorScheme === 'dark';
  const { width: windowWidth } = useWindowDimensions();
  const reactEmojiCell = useMemo(() => {
    const inner = windowWidth - REACT_MODAL_PAD_X * 2;
    const cols = 4;
    return Math.min(50, Math.max(40, Math.floor((inner - REACT_EMOJI_GUTTER * (cols - 1)) / cols)));
  }, [windowWidth]);
  const reactEmojiRowWidth = reactEmojiCell * 4 + REACT_EMOJI_GUTTER * 3;
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
  const [commentReplyParentId, setCommentReplyParentId] = useState<string | null>(null);
  const [commentReplyToName, setCommentReplyToName] = useState<string | null>(null);
  const [commentThreadExpanded, setCommentThreadExpanded] = useState<Record<string, boolean>>({});
  const [commentSubmittingWorkoutId, setCommentSubmittingWorkoutId] = useState<string | null>(null);
  const commentInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (commentModalWorkoutId) {
      setCommentReplyParentId(null);
      setCommentReplyToName(null);
      setCommentModalMessage('');
      setCommentThreadExpanded({});
    }
  }, [commentModalWorkoutId]);

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
    const parentId = commentReplyParentId;
    const result = await addComment(workoutId, session.user.id, {
      message: trimmed,
      parentId: parentId ?? undefined,
    });
    setCommentSubmittingWorkoutId(null);
    if ('error' in result) {
      Alert.alert('Comment failed', result.error.message);
      return;
    }
    if (parentId) {
      setCommentThreadExpanded((p) => ({ ...p, [parentId]: true }));
    }
    const newComment: WorkoutCommentWithProfile = {
      id: result.id,
      workout_id: workoutId,
      user_id: session.user.id,
      parent_id: parentId ?? null,
      message: trimmed,
      gif_url: null,
      created_at: new Date().toISOString(),
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
    setCommentReplyParentId(null);
    setCommentReplyToName(null);
    setFeedItems((prev) =>
      prev.map((i) => {
        if (i.workout.id !== workoutId) return i;
        return { ...i, comments: [...(i.comments ?? []), newComment] };
      })
    );
    setGlobalFeedItems((prev) =>
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
    workoutDate?: string | null;
    caption?: string | null;
    displayName?: string | null;
    /** Top-right pill: resolved from label and/or gym id at tap time */
    gymLabel?: string | null;
  };
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const shareViewRef = useRef<ViewShot>(null);

  const handleShareWorkout = async (
    imageUrl: string,
    secondaryImageUrl?: string | null,
    workoutDate?: string | null,
    caption?: string | null,
    displayName?: string | null,
    gymLabel?: string | null,
    gymId?: string | null,
  ) => {
    let resolvedGymLabel = gymLabel?.trim() || null;
    if (!resolvedGymLabel && gymId) {
      const { data, error } = await supabase.from('gyms').select('name, address').eq('id', gymId).maybeSingle();
      if (!error && data) {
        resolvedGymLabel = formatGymLabel(data.name, data.address);
      }
    }
    setShareData({
      primaryUrl: imageUrl,
      secondaryUrl: secondaryImageUrl,
      workoutDate,
      caption,
      displayName,
      gymLabel: resolvedGymLabel,
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
          <View style={[styles.feedCard, styles.feedTodayCard]}>
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
                  onPress={() =>
                    void handleShareWorkout(
                      todayWorkout.image_url,
                      todayWorkout.secondary_image_url,
                      todayWorkout.workout_date,
                      todayWorkout.caption,
                      profile?.display_name,
                      todayWorkoutGymLabel,
                      todayWorkout.gym_id ?? null,
                    )
                  }
                  style={styles.feedActionBtn}
                >
                  <Ionicons name="paper-plane" size={22} color="rgba(255,255,255,0.9)" />
                </Pressable>
              </View>
            </View>
            <View style={styles.postCardFooter}>
              <View style={styles.postEngagementReactionsRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.reactionBubbles}
                  style={styles.reactionScrollFlex}
                >
                  {todayWorkoutReactions.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => setViewReaction(r)}
                      style={({ pressed }) => [styles.reactionBubbleWrap, pressed && { opacity: 0.75 }]}
                    >
                      <View style={styles.reactionBubble}>
                        <View style={styles.reactionBubblePhotoWrap}>
                          {r.reaction_image_url ? (
                            <Image source={{ uri: r.reaction_image_url }} style={styles.reactionBubbleImage} />
                          ) : (
                            <View style={[styles.reactionBubblePlaceholder, { backgroundColor: colors.tint + '22' }]}>
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
            </View>
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
                          onPress={() =>
                            void handleShareWorkout(
                              item.workout.image_url,
                              item.workout.secondary_image_url,
                              item.workout.workout_date,
                              item.workout.caption,
                              item.display_name,
                              item.gym_label,
                              item.workout.gym_id ?? null,
                            )
                          }
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
                  <View style={styles.postCardFooter}>
                    {(item.tags ?? []).length > 0 && (
                      <View style={styles.taggedRowFooter}>
                        <View
                          style={[
                            styles.taggedPill,
                            {
                              backgroundColor: colors.tint + '18',
                              borderColor: colors.tint + '32',
                            },
                          ]}
                        >
                          <View style={[styles.taggedPillIconBubble, { backgroundColor: colors.tint + '22' }]}>
                            <Ionicons name="people" size={14} color={colors.tint} />
                          </View>
                          <View style={styles.taggedPillTextRow}>
                            <ThemedText style={styles.taggedPillKicker}>With</ThemedText>
                            {(item.tags ?? []).map((tag, tIdx) => (
                              <View key={tag.id} style={styles.taggedNameChip}>
                                {tIdx > 0 ? (
                                  <ThemedText style={styles.taggedNameDot}>·</ThemedText>
                                ) : null}
                                <Pressable
                                  onPress={() => router.push(`/friend-profile?id=${tag.tagged_user_id}`)}
                                  style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1 }]}
                                >
                                  <ThemedText style={styles.taggedNameFooter} numberOfLines={1}>
                                    {tag.display_name || 'Friend'}
                                  </ThemedText>
                                </Pressable>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                    )}
                    <View style={styles.postEngagementReactionsRow}>
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
                            styles.postReactCompact,
                            pressed && { opacity: 0.82 },
                          ]}
                          accessibilityLabel={
                            item.reactions?.find((r) => r.user_id === session.user.id)
                              ? 'Remove your reaction'
                              : 'Add reaction'
                          }
                        >
                          <ReactionsIcon size={20} color={colors.tint} />
                        </Pressable>
                      )}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.reactionBubbles}
                        style={styles.reactionScrollFlex}
                      >
                        {(item.reactions ?? []).map((r) => (
                          <Pressable
                            key={r.id}
                            onPress={() => setViewReaction(r)}
                            style={({ pressed }) => [styles.reactionBubbleWrap, pressed && { opacity: 0.75 }]}
                          >
                            <View style={styles.reactionBubble}>
                              <View style={styles.reactionBubblePhotoWrap}>
                                {r.reaction_image_url ? (
                                  <Image source={{ uri: r.reaction_image_url }} style={styles.reactionBubbleImage} />
                                ) : (
                                  <View style={[styles.reactionBubblePlaceholder, { backgroundColor: colors.tint + '22' }]}>
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
        <View style={styles.reactModalOverlay}>
          <Pressable style={styles.reactModalDismiss} onPress={closeReactModal} />
          <View
            key={reactModalKey}
            style={[
              styles.reactModalSheet,
              {
                borderColor: isDark ? 'rgba(104,88,168,0.35)' : 'rgba(42,24,112,0.12)',
                shadowColor: isDark ? BrandViolet.highlight : BrandViolet.primary,
              },
            ]}
          >
            <LinearGradient
              colors={
                isDark
                  ? [BrandViolet.shadow, BrandViolet.deep, colors.card]
                  : [colors.cardElevated, '#FFFFFF']
              }
              locations={isDark ? [0, 0.35, 1] : [0, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.reactModalInner}>
              <View style={styles.reactModalHandle}>
                <View style={[styles.reactModalHandleBar, { backgroundColor: BrandViolet.highlight + '55' }]} />
              </View>
              <ThemedText type="subtitle" style={[styles.reactModalTitle, { color: colors.text }]}>
                Add reaction
              </ThemedText>
              <ThemedText style={[styles.reactModalHint, { color: colors.textMuted }]}>
                Choose an emoji, snap your reaction selfie, then post.
              </ThemedText>
              <LinearGradient
                colors={[BrandViolet.highlight + 'DD', BrandViolet.mid, BrandViolet.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.reactPhotoRing}
              >
                <Pressable
                  onPress={handleTakeReactionPhoto}
                  style={[
                    styles.reactPhotoInner,
                    { backgroundColor: colors.cardElevated, borderColor: BrandViolet.highlight + '35' },
                  ]}
                >
                  {reactPendingPhoto ? (
                    <Image source={{ uri: reactPendingPhoto }} style={styles.reactPhotoPreview} />
                  ) : (
                    <>
                      <Ionicons name="camera" size={30} color={BrandViolet.highlight} />
                      <ThemedText style={[styles.reactPhotoLabel, { color: colors.textMuted }]}>Take photo</ThemedText>
                    </>
                  )}
                </Pressable>
              </LinearGradient>

              <View style={styles.reactSectionHeaderRow}>
                <Ionicons name="sparkles" size={15} color={BrandViolet.highlight} style={styles.reactSectionHeaderIcon} />
                <ThemedText style={[styles.reactSectionKicker, { color: BrandViolet.highlight, marginBottom: 0 }]}>
                  This week
                </ThemedText>
              </View>
              {chunkEven(getWeeklySpotlightSet(), 4).map((row, ri) => (
                <View
                  key={`wkrow-${ri}`}
                  style={[
                    styles.reactEmojiGridRow,
                    { width: reactEmojiRowWidth, marginBottom: ri === 0 ? REACT_EMOJI_GUTTER : 0 },
                  ]}
                >
                  {row.map((emoji, ci) => (
                    <Pressable
                      key={`wk-${ri}-${ci}`}
                      onPress={() => setReactPendingEmoji(emoji)}
                      style={[
                        styles.reactEmojiCell,
                        {
                          width: reactEmojiCell,
                          height: reactEmojiCell,
                          borderRadius: reactEmojiCell / 2,
                          backgroundColor:
                            reactPendingEmoji === emoji
                              ? colors.tint + '32'
                              : isDark
                                ? 'rgba(104,88,168,0.12)'
                                : 'rgba(42,24,112,0.05)',
                          borderColor:
                            reactPendingEmoji === emoji ? colors.tint : BrandViolet.highlight + (isDark ? '32' : '22'),
                          borderWidth: reactPendingEmoji === emoji ? 2 : StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <ThemedText style={[styles.reactEmojiOptionText, { fontSize: reactEmojiCell > 44 ? 25 : 23 }]}>
                        {emoji}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              ))}

              <LinearGradient
                colors={['transparent', BrandViolet.highlight + '35', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.reactModalSectionRule}
              />

              <View style={styles.reactSectionHeaderRow}>
                <Ionicons name="flame" size={15} color={BrandViolet.highlight} style={styles.reactSectionHeaderIcon} />
                <ThemedText style={[styles.reactSectionKicker, { color: BrandViolet.highlight, marginBottom: 0 }]}>
                  Quick picks
                </ThemedText>
              </View>
              {chunkEven([...REACTION_STAPLES], 4).map((row, ri) => (
                <View
                  key={`strow-${ri}`}
                  style={[
                    styles.reactEmojiGridRow,
                    { width: reactEmojiRowWidth, marginBottom: ri === 0 ? REACT_EMOJI_GUTTER : 0 },
                  ]}
                >
                  {row.map((emoji, ci) => (
                    <Pressable
                      key={`st-${ri}-${ci}`}
                      onPress={() => setReactPendingEmoji(emoji)}
                      style={[
                        styles.reactEmojiCell,
                        {
                          width: reactEmojiCell,
                          height: reactEmojiCell,
                          borderRadius: reactEmojiCell / 2,
                          backgroundColor:
                            reactPendingEmoji === emoji
                              ? colors.tint + '32'
                              : isDark
                                ? 'rgba(104,88,168,0.12)'
                                : 'rgba(42,24,112,0.05)',
                          borderColor:
                            reactPendingEmoji === emoji ? colors.tint : BrandViolet.highlight + (isDark ? '32' : '22'),
                          borderWidth: reactPendingEmoji === emoji ? 2 : StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <ThemedText style={[styles.reactEmojiOptionText, { fontSize: reactEmojiCell > 44 ? 25 : 23 }]}>
                        {emoji}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              ))}

              <View style={styles.reactModalActions}>
                <Pressable
                  onPress={handlePostReaction}
                  disabled={!reactPendingEmoji || reactSubmitting}
                  style={({ pressed }) => [
                    styles.reactSubmitButtonWrap,
                    (!reactPendingEmoji || reactSubmitting) && styles.reactSubmitButtonWrapDisabled,
                    pressed && reactPendingEmoji && !reactSubmitting && { opacity: 0.92, transform: [{ scale: 0.99 }] },
                  ]}
                >
                  {reactPendingEmoji && !reactSubmitting ? (
                    <LinearGradient
                      colors={[BrandViolet.highlight, BrandViolet.mid, BrandViolet.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.reactSubmitGradient}
                    >
                      <ThemedText style={styles.reactSubmitButtonText}>Post reaction</ThemedText>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.reactSubmitGradient,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                          justifyContent: 'center',
                        },
                      ]}
                    >
                      {reactSubmitting ? (
                        <ActivityIndicator color={BrandViolet.highlight} size="small" />
                      ) : (
                        <ThemedText style={[styles.reactSubmitButtonText, { color: colors.textMuted }]}>
                          Post reaction
                        </ThemedText>
                      )}
                    </View>
                  )}
                </Pressable>
                <Pressable
                  onPress={closeReactModal}
                  style={[
                    styles.reactCancelButton,
                    {
                      borderColor: BrandViolet.highlight + (isDark ? '45' : '35'),
                      backgroundColor: isDark ? 'rgba(104,88,168,0.08)' : 'rgba(42,24,112,0.04)',
                    },
                  ]}
                >
                  <ThemedText style={[styles.reactCancelText, { color: colors.textMuted }]}>Cancel</ThemedText>
                </Pressable>
              </View>
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
              style={[
                styles.commentModalSheet,
                {
                  backgroundColor: isDark ? '#0F0D14' : colors.card,
                  borderTopColor: isDark ? 'rgba(104,88,168,0.35)' : colors.tabBarBorder,
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.commentModalHandle}>
                <View style={[styles.commentModalHandleBar, { backgroundColor: colors.textMuted + '45' }]} />
              </View>

              <ThemedText type="defaultSemiBold" style={[styles.commentModalTitle, { color: colors.text }]}>
                Comments
              </ThemedText>

              <ScrollView
                style={styles.commentModalScroll}
                contentContainerStyle={styles.commentModalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {(() => {
                  let comments: WorkoutCommentWithProfile[] = [];
                  if (commentModalWorkoutId && todayWorkout?.id === commentModalWorkoutId) {
                    comments = todayWorkoutComments;
                  } else if (commentModalWorkoutId) {
                    const feedItem =
                      feedItems.find((fi) => fi.workout.id === commentModalWorkoutId) ??
                      globalFeedItems.find((fi) => fi.workout.id === commentModalWorkoutId);
                    comments = feedItem?.comments ?? [];
                  }

                  if (comments.length === 0) {
                    return (
                      <View style={styles.commentModalEmpty}>
                        <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
                        <ThemedText style={[styles.commentModalEmptyTitle, { color: colors.text }]}>
                          No comments yet
                        </ThemedText>
                        <ThemedText style={[styles.commentModalEmptyText, { color: colors.textMuted }]}>
                          Say something nice below.
                        </ThemedText>
                      </View>
                    );
                  }

                  const tree = buildCommentTree(comments);
                  return tree.map((n) => (
                    <CommentBranch
                      key={n.id}
                      node={n}
                      depth={0}
                      session={session}
                      colors={colors}
                      expanded={commentThreadExpanded}
                      setExpanded={setCommentThreadExpanded}
                      onReply={(c) => {
                        setCommentReplyParentId(c.id);
                        setCommentReplyToName(c.display_name || 'Member');
                        const firstName = (c.display_name || '').trim().split(/\s+/)[0] || 'friend';
                        setCommentModalMessage(`@${firstName} `);
                        commentInputRef.current?.focus();
                      }}
                      onOpenProfile={(userId) => router.push(`/friend-profile?id=${userId}`)}
                      onCloseModal={() => setCommentModalWorkoutId(null)}
                    />
                  ));
                })()}
              </ScrollView>

              {session && commentModalWorkoutId && (
                <View
                  style={[
                    styles.commentModalInputRow,
                    {
                      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : colors.textMuted + '18',
                      backgroundColor: isDark ? '#0A0810' : 'transparent',
                    },
                  ]}
                >
                  {commentReplyParentId && commentReplyToName ? (
                    <View style={styles.commentReplyingBanner}>
                      <ThemedText
                        style={[styles.commentReplyingBannerText, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        Replying to{' '}
                        <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                          {commentReplyToName}
                        </ThemedText>
                      </ThemedText>
                      <Pressable
                        onPress={() => {
                          setCommentReplyParentId(null);
                          setCommentReplyToName(null);
                          setCommentModalMessage('');
                        }}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={styles.commentModalInputInner}>
                    <TextInput
                      ref={commentInputRef}
                      style={[
                        styles.commentModalInput,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.cardElevated,
                          color: colors.text,
                          borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.tabBarBorder,
                        },
                      ]}
                      placeholder={commentReplyParentId ? 'Write a reply…' : 'Add a comment…'}
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
                          size={18}
                          color={commentModalMessage.trim() ? colors.tint : colors.textMuted}
                        />
                      )}
                    </Pressable>
                  </View>
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
        const locationLine = shareData.gymLabel?.trim() ?? '';
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

              {/* Top bar — left: UPLIFT; right: gym location (never workout type) */}
              <View style={shareStyles.topBar}>
                <View style={shareStyles.brandPill}>
                  <ThemedText style={shareStyles.brandText}>UPLIFT</ThemedText>
                </View>
                {locationLine.length > 0 ? (
                  <View style={[shareStyles.typePill, { maxWidth: cardW * 0.52 }]}>
                    <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.92)" />
                    <ThemedText
                      style={[shareStyles.typePillLabel, { flexShrink: 1, minWidth: 0 }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {locationLine}
                    </ThemedText>
                  </View>
                ) : null}
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
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.92)',
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
  /** Extra air below “Your workout” before friends/global posts */
  feedTodayCard: {
    marginBottom: 24,
  },
  feedCard: {
    overflow: 'hidden',
    marginBottom: 0,
    backgroundColor: '#13101A',
    borderRadius: 20,
    },
  feedImageContainer: {
    position: 'relative',
  },
  feedImage: {
    width: '100%',
    aspectRatio: 10 / 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  feedGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 64,
    paddingBottom: 16,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
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

  // Post card footer — same surface as card (no separate “band”)
  postCardFooter: {
    backgroundColor: '#13101A',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  taggedRowFooter: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  taggedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 8,
    paddingRight: 12,
    paddingLeft: 8,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  taggedPillIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taggedPillTextRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    rowGap: 4,
  },
  taggedPillKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.38)',
    textTransform: 'uppercase',
    marginRight: 2,
  },
  taggedNameChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taggedNameDot: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.28)',
    marginHorizontal: 5,
  },
  taggedNameFooter: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.15,
    color: 'rgba(245,242,255,0.96)',
  },

  postEngagementReactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  postReactCompact: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  reactionScrollFlex: {
    flex: 1,
    minWidth: 56,
    maxHeight: 44,
  },
  reactionBubbles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexGrow: 0,
    paddingRight: 4,
  },
  reactionBubbleWrap: {
    width: 40,
    height: 40,
  },
  reactionBubble: {
    width: 40,
    height: 40,
  },
  reactionBubblePhotoWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  reactionBubblePlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reactionBubbleImage: { width: 32, height: 32 },
  reactionBubbleInitials: { fontSize: 11, fontWeight: '600' },
  reactionEmojiBadge: {
    position: 'absolute',
    bottom: -1,
    right: -2,
    overflow: 'visible',
  },
  reactionEmojiText: { fontSize: 12, lineHeight: 16 },

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
    paddingVertical: 14,
  },
  commentSheetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
  },
  /** Indented thread: vertical line + padding (Instagram-style) */
  commentRepliesGroup: {
    marginTop: 0,
    paddingLeft: 10,
    borderLeftWidth: 2,
  },
  commentViewMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingLeft: 2,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  commentAvatarImage: { width: 32, height: 32 },
  commentAvatarInitials: { fontSize: 11, fontWeight: '700' },
  commentAvatarSm: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 8,
  },
  commentAvatarSmImg: { width: 28, height: 28 },
  commentAvatarSmInit: { fontSize: 9, fontWeight: '700' },
  commentViewMoreText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.12,
  },
  commentBody: { flex: 1, minWidth: 0 },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  commentAuthor: { fontSize: 13, fontWeight: '800', letterSpacing: 0.05, flex: 1 },
  commentTime: { fontSize: 10, fontWeight: '600', letterSpacing: 0.15, flexShrink: 0 },
  commentText: { fontSize: 13, lineHeight: 18, letterSpacing: 0.08 },
  commentReplyBtn: { marginTop: 3, paddingVertical: 2 },
  commentReplyText: { fontSize: 11, fontWeight: '700' },
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

  // Comment modal — Instagram-style bottom sheet
  commentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  commentModalKeyboard: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  commentModalSheet: {
    width: '100%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    /** ~half screen — comfortable sheet without covering the feed. */
    height: '50%',
    maxHeight: '62%',
    minHeight: 220,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  commentModalHandle: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  commentModalHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  commentModalTitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  commentModalScroll: {
    flex: 1,
  },
  commentModalScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 10,
  },
  commentModalEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  commentModalEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  commentModalEmptyText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  commentModalInputRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentModalInputInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  commentReplyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 6,
  },
  commentReplyingBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  commentModalInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    minHeight: 40,
    maxHeight: 80,
  },
  commentModalPostBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // React modal
  reactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,1,8,0.72)',
    justifyContent: 'flex-end',
  },
  reactModalDismiss: {
    flex: 1,
  },
  reactModalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
      },
      android: { elevation: 16 },
    }),
  },
  reactModalInner: {
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 36 : 28,
    paddingTop: 6,
  },
  reactModalHandle: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  reactModalHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  reactModalTitle: {
    marginBottom: 6,
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: -0.4,
    fontSize: 20,
  },
  reactModalHint: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.12,
    lineHeight: 17,
    paddingHorizontal: 12,
    opacity: 0.92,
  },
  reactSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  reactSectionHeaderIcon: {
    opacity: 0.95,
  },
  reactSectionKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  reactModalSectionRule: {
    height: 2,
    width: '100%',
    marginVertical: 18,
    borderRadius: 1,
    opacity: 0.85,
  },
  reactPhotoRing: {
    alignSelf: 'center',
    borderRadius: 56,
    padding: 2.5,
    marginBottom: 20,
  },
  reactPhotoInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  reactPhotoPreview: { width: 104, height: 104, borderRadius: 52 },
  reactPhotoLabel: { fontSize: 11, marginTop: 5, fontWeight: '600' },
  reactEmojiGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'center',
    gap: 10,
  },
  reactEmojiCell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  reactEmojiOptionText: { lineHeight: 30 },
  reactModalActions: { gap: 12, marginTop: 6 },
  reactSubmitButtonWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: BrandViolet.highlight,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.42,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  reactSubmitButtonWrapDisabled: {
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: { elevation: 0 },
    }),
  },
  reactSubmitGradient: {
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  reactSubmitButtonText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.35 },
  reactCancelButton: {
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  reactCancelText: { fontSize: 15, fontWeight: '600' },
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