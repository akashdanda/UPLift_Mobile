import { supabase } from '@/lib/supabase'

export type ReportReason =
  | 'inappropriate_content'
  | 'inappropriate_name'
  | 'inappropriate_picture'
  | 'harassment'
  | 'spam'
  | 'fake_account'
  | 'other'

export type ReportType = 'user' | 'group' | 'workout'

export type Report = {
  id: string
  reporter_id: string
  reported_user_id: string | null
  reported_group_id: string | null
  reported_workout_id: string | null
  reason: string
  description: string | null
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
  created_at: string
  updated_at: string
}

/**
 * Submit a report for inappropriate content
 */
export async function submitReport(
  reporterId: string,
  opts: {
    reportedUserId?: string
    reportedGroupId?: string
    reportedWorkoutId?: string
    reason: ReportReason
    description?: string
  }
): Promise<{ error: Error | null }> {
  const { reportedUserId, reportedGroupId, reportedWorkoutId, reason, description } = opts

  // Validate that exactly one entity is being reported
  const entityCount =
    (reportedUserId ? 1 : 0) + (reportedGroupId ? 1 : 0) + (reportedWorkoutId ? 1 : 0)
  if (entityCount !== 1) {
    return { error: new Error('Must report exactly one entity (user, group, or workout)') }
  }

  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId || null,
    reported_group_id: reportedGroupId || null,
    reported_workout_id: reportedWorkoutId || null,
    reason,
    description: description?.trim() || null,
  })

  if (error) {
    console.error('Error submitting report:', error)
    return { error }
  }

  return { error: null }
}
