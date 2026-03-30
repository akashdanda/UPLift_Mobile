import { supabase } from '@/lib/supabase'
import type {
  GroupFeedComment,
  GroupFeedCommentWithProfile,
  GroupFeedPost,
  GroupFeedPostType,
  GroupFeedPostWithAuthor,
  GroupFeedReaction,
  GroupFeedReactionWithProfile,
  GroupPollOption,
  GroupRole,
} from '@/types/group'

// ─── Feed Posts ─────────────────────────────────────────

/** Fetch feed posts for a group, newest first. Includes author info. */
export async function getGroupFeedPosts(groupId: string, limit = 50): Promise<GroupFeedPostWithAuthor[]> {
  const { data: posts } = await supabase
    .from('group_feed_posts')
    .select('*')
    .eq('group_id', groupId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!posts?.length) return []

  const userIds = [...new Set(posts.map((p: any) => p.user_id as string))]

  const [{ data: profiles }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds),
    supabase.from('group_members').select('user_id, role').eq('group_id', groupId).in('user_id', userIds),
  ])

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const roleMap = new Map((memberships ?? []).map((m: any) => [m.user_id, m.role as GroupRole]))

  return (posts as GroupFeedPost[]).map((post) => {
    const profile = profileMap.get(post.user_id)
    return {
      ...post,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role: roleMap.get(post.user_id) ?? null,
    }
  })
}

/** Create a text/image post or announcement */
export async function createGroupFeedPost(
  groupId: string,
  userId: string,
  content: string | null,
  imageUrl: string | null = null,
  postType: GroupFeedPostType = 'post'
): Promise<{ post: GroupFeedPost | null; error: Error | null }> {
  if (!content?.trim() && !imageUrl) return { post: null, error: new Error('Post must have text or an image') }

  const { data, error } = await supabase
    .from('group_feed_posts')
    .insert({
      group_id: groupId,
      user_id: userId,
      content: content?.trim() || null,
      image_url: imageUrl,
      post_type: postType,
    })
    .select()
    .single()

  if (error) return { post: null, error }
  return { post: data as GroupFeedPost, error: null }
}

/** Delete a feed post */
export async function deleteGroupFeedPost(postId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('group_feed_posts').delete().eq('id', postId)
  return { error: error ?? null }
}

/** Toggle pin on a post */
export async function togglePinPost(postId: string, pinned: boolean): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('group_feed_posts').update({ is_pinned: pinned }).eq('id', postId)
  return { error: error ?? null }
}

// ─── Polls ──────────────────────────────────────────────

/** Create a poll (creates the feed post + options) */
export async function createGroupPoll(
  groupId: string,
  userId: string,
  question: string,
  options: string[]
): Promise<{ post: GroupFeedPost | null; error: Error | null }> {
  if (!question.trim()) return { post: null, error: new Error('Question cannot be empty') }
  if (options.filter((o) => o.trim()).length < 2) return { post: null, error: new Error('A poll needs at least 2 options') }

  const { data: post, error: postError } = await supabase
    .from('group_feed_posts')
    .insert({ group_id: groupId, user_id: userId, content: question.trim(), post_type: 'poll' })
    .select()
    .single()

  if (postError || !post) return { post: null, error: postError }

  const optionRows = options
    .filter((o) => o.trim())
    .map((label, i) => ({ post_id: (post as any).id, label: label.trim(), sort_order: i }))

  const { error: optionsError } = await supabase.from('group_poll_options').insert(optionRows)
  if (optionsError) return { post: post as any, error: optionsError }

  return { post: post as any, error: null }
}

/** Get poll options with vote counts for a post */
export async function getPollOptions(postId: string): Promise<GroupPollOption[]> {
  const { data: options } = await supabase
    .from('group_poll_options')
    .select('*')
    .eq('post_id', postId)
    .order('sort_order', { ascending: true })

  if (!options?.length) return []

  const optionIds = options.map((o: any) => o.id)
  const { data: votes } = await supabase.from('group_poll_votes').select('option_id').in('option_id', optionIds)

  const voteCounts = new Map<string, number>()
  for (const v of votes ?? []) voteCounts.set(v.option_id, (voteCounts.get(v.option_id) ?? 0) + 1)

  return (options as any[]).map((o) => ({ ...o, vote_count: voteCounts.get(o.id) ?? 0 })) as GroupPollOption[]
}

/** Get the user's current vote on a poll (returns option_id or null) */
export async function getUserPollVote(postId: string, userId: string): Promise<string | null> {
  const { data: options } = await supabase.from('group_poll_options').select('id').eq('post_id', postId)
  if (!options?.length) return null

  const optionIds = options.map((o: any) => o.id)
  const { data: vote } = await supabase
    .from('group_poll_votes')
    .select('option_id')
    .eq('user_id', userId)
    .in('option_id', optionIds)
    .maybeSingle()

  return (vote as any)?.option_id ?? null
}

/** Vote on a poll option (removes previous vote if any) */
export async function voteOnPoll(optionId: string, userId: string, postId: string): Promise<{ error: Error | null }> {
  const { data: options } = await supabase.from('group_poll_options').select('id').eq('post_id', postId)
  if (options?.length) {
    const optionIds = options.map((o: any) => o.id)
    await supabase.from('group_poll_votes').delete().eq('user_id', userId).in('option_id', optionIds)
  }
  const { error } = await supabase.from('group_poll_votes').insert({ option_id: optionId, user_id: userId })
  return { error: error ?? null }
}

// ─── Reactions ───────────────────────────────────────────

export async function getReactionsForPosts(postIds: string[]): Promise<Map<string, GroupFeedReactionWithProfile[]>> {
  if (!postIds.length) return new Map()
  const { data: rows } = await supabase
    .from('group_feed_reactions')
    .select('id, post_id, user_id, emoji, created_at')
    .in('post_id', postIds)
    .order('created_at', { ascending: true })

  if (!rows?.length) return new Map()

  const userIds = [...new Set(rows.map((r: any) => r.user_id as string))]
  const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const map = new Map<string, GroupFeedReactionWithProfile[]>()
  for (const r of rows as any[]) {
    const p = profileMap.get(r.user_id)
    const item: GroupFeedReactionWithProfile = { ...r, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null }
    const list = map.get(r.post_id) ?? []
    list.push(item)
    map.set(r.post_id, list)
  }
  return map
}

/**
 * Toggle reaction for the current user on a post.
 * DB unique constraint is on (post_id, user_id): one row per user per post — switching emoji updates that row.
 */
export async function toggleFeedReaction(
  postId: string,
  userId: string,
  emoji: string
): Promise<{ reaction: GroupFeedReaction | null; removed: boolean; error: Error | null }> {
  const e = emoji.trim()
  if (!e) return { reaction: null, removed: false, error: new Error('Emoji cannot be empty') }

  const { data: existing, error: existingError } = await supabase
    .from('group_feed_reactions')
    .select('id, emoji')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingError) return { reaction: null, removed: false, error: existingError }

  if (existing?.id) {
    if (existing.emoji === e) {
      const { error } = await supabase.from('group_feed_reactions').delete().eq('id', existing.id)
      return { reaction: null, removed: true, error: error ?? null }
    }
    const { data, error } = await supabase
      .from('group_feed_reactions')
      .update({ emoji: e })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return { reaction: null, removed: false, error }
    return { reaction: data as GroupFeedReaction, removed: false, error: null }
  }

  const { data, error } = await supabase
    .from('group_feed_reactions')
    .insert({ post_id: postId, user_id: userId, emoji: e })
    .select()
    .single()

  if (error) return { reaction: null, removed: false, error }
  return { reaction: data as GroupFeedReaction, removed: false, error: null }
}

// ─── Comments ────────────────────────────────────────────

export async function getCommentsForPosts(postIds: string[]): Promise<Map<string, GroupFeedCommentWithProfile[]>> {
  if (!postIds.length) return new Map()
  const { data: rows } = await supabase
    .from('group_feed_comments')
    .select('id, post_id, user_id, message, created_at')
    .in('post_id', postIds)
    .order('created_at', { ascending: true })
  if (!rows?.length) return new Map()

  const userIds = [...new Set(rows.map((r: any) => r.user_id as string))]
  const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const map = new Map<string, GroupFeedCommentWithProfile[]>()
  for (const c of rows as any[]) {
    const p = profileMap.get(c.user_id)
    const item: GroupFeedCommentWithProfile = { ...c, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null }
    const list = map.get(c.post_id) ?? []
    list.push(item)
    map.set(c.post_id, list)
  }
  return map
}

export async function addFeedComment(
  postId: string,
  userId: string,
  message: string
): Promise<{ comment: GroupFeedComment | null; error: Error | null }> {
  const trimmed = message.trim()
  if (!trimmed) return { comment: null, error: new Error('Comment cannot be empty') }
  const { data, error } = await supabase
    .from('group_feed_comments')
    .insert({ post_id: postId, user_id: userId, message: trimmed })
    .select()
    .single()
  if (error) return { comment: null, error }
  return { comment: data as GroupFeedComment, error: null }
}

