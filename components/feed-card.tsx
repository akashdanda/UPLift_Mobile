import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { memo, useCallback, useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { ReactionsIcon } from '@/components/reactions-icon'
import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import type { FeedItem } from '@/lib/feed'
import type { WorkoutReactionWithProfile } from '@/types/reaction'

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function formatFeedDate(workoutDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workoutDate)
  if (!match) return ''
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const d = new Date(year, monthIndex, day)
  if (Number.isNaN(d.getTime())) return ''

  const today = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (sameDay(d, today)) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatFeedPostTimestamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const posted = new Date(iso)
  if (Number.isNaN(posted.getTime())) return ''
  const now = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const timeStr = posted.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay(posted, now)) return `Today · ${timeStr}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(posted, yesterday)) return `Yesterday · ${timeStr}`
  const yNow = now.getFullYear()
  const datePart =
    posted.getFullYear() === yNow
      ? posted.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : posted.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${datePart} · ${timeStr}`
}

interface FeedCardProps {
  item: FeedItem
  isHighlighted?: boolean
  isOwnPost?: boolean
  currentUserId?: string
  onComment: (workoutId: string) => void
  onReact: (item: FeedItem) => void
  onRemoveReaction: (item: FeedItem) => void
  onShare: (item: FeedItem) => void
  onReport: (item: FeedItem) => void
  onViewReaction: (reaction: WorkoutReactionWithProfile) => void
  ImageComponent: React.ComponentType<{
    imageUrl: string
    secondaryImageUrl?: string | null
    style: object
  }>
}

export const FeedCard = memo(function FeedCard({
  item,
  isHighlighted = false,
  isOwnPost = false,
  currentUserId,
  onComment,
  onReact,
  onRemoveReaction,
  onShare,
  onReport,
  onViewReaction,
  ImageComponent,
}: FeedCardProps) {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const handleProfilePress = useCallback(() => {
    router.push(`/friend-profile?id=${item.workout.user_id}`)
  }, [item.workout.user_id])

  const handleCommentPress = useCallback(() => {
    onComment(item.workout.id)
  }, [item.workout.id, onComment])

  const handleReactPress = useCallback(() => {
    const myReaction = item.reactions?.find((r) => r.user_id === currentUserId)
    if (myReaction) {
      onRemoveReaction(item)
    } else {
      onReact(item)
    }
  }, [item, currentUserId, onReact, onRemoveReaction])

  const handleSharePress = useCallback(() => {
    onShare(item)
  }, [item, onShare])

  const handleReportPress = useCallback(() => {
    onReport(item)
  }, [item, onReport])

  const commentsCount = (item.comments ?? []).length
  const hasTags = (item.tags ?? []).length > 0
  const reactions = useMemo(() => item.reactions ?? [], [item.reactions])

  const timestamp = useMemo(
    () => formatFeedPostTimestamp(item.workout.created_at) || formatFeedDate(item.workout.workout_date),
    [item.workout.created_at, item.workout.workout_date]
  )

  return (
    <View style={[styles.feedCard, isHighlighted && { borderWidth: 2, borderColor: colors.tint }]}>
      <View style={styles.feedImageContainer}>
        <ImageComponent
          imageUrl={item.workout.image_url}
          secondaryImageUrl={item.workout.secondary_image_url}
          style={styles.feedImage}
        />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.feedGradient}>
          <Pressable style={styles.feedOverlayInfo} onPress={handleProfilePress}>
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
              <ThemedText style={styles.feedOverlayMeta}>{timestamp}</ThemedText>
            </View>
          </Pressable>
        </LinearGradient>
        <View style={styles.feedActionColumn}>
          <Pressable onPress={handleCommentPress} style={styles.feedActionBtn}>
            <Ionicons name="chatbubble" size={24} color="rgba(255,255,255,0.9)" />
            {commentsCount > 0 && (
              <ThemedText style={styles.feedActionCount}>{commentsCount}</ThemedText>
            )}
          </Pressable>
          {isOwnPost && (
            <Pressable onPress={handleSharePress} style={styles.feedActionBtn}>
              <Ionicons name="paper-plane" size={22} color="rgba(255,255,255,0.9)" />
            </Pressable>
          )}
          {!isOwnPost && (
            <Pressable onPress={handleReportPress} style={styles.feedActionBtn}>
              <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}
        </View>
      </View>
      <View style={styles.postCardFooter}>
        {hasTags && (
          <View style={styles.taggedRowFooter}>
            <View style={[styles.taggedPill, { backgroundColor: colors.tint + '18', borderColor: colors.tint + '32' }]}>
              <View style={[styles.taggedPillIconBubble, { backgroundColor: colors.tint + '22' }]}>
                <Ionicons name="people" size={14} color={colors.tint} />
              </View>
              <View style={styles.taggedPillTextRow}>
                <ThemedText style={styles.taggedPillKicker}>WITH</ThemedText>
                {(item.tags ?? []).map((tag, tIdx) => (
                  <View key={tag.id} style={styles.taggedNameChip}>
                    {tIdx > 0 && <ThemedText style={styles.taggedNameDot}>·</ThemedText>}
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
          {currentUserId && (
            <Pressable
              onPress={handleReactPress}
              style={({ pressed }) => [styles.postReactCompact, pressed && { opacity: 0.82 }]}
              accessibilityLabel={
                reactions.find((r) => r.user_id === currentUserId)
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
            {reactions.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => onViewReaction(r)}
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
})

const styles = StyleSheet.create({
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
})
