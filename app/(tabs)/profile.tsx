import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import SignOutButton from '@/components/social-auth-buttons/sign-out-button'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'

function getDisplayName(session: { user: { user_metadata?: { full_name?: string }; email?: string } }): string {
  const name = session.user.user_metadata?.full_name
  if (name && typeof name === 'string') return name
  const email = session.user.email
  if (email) return email.split('@')[0] ?? email
  return 'Athlete'
}

function getAvatarUrl(
  profile: { avatar_url?: string | null } | null,
  session: { user: { user_metadata?: { avatar_url?: string }; email?: string } } | null
): string | null {
  if (profile?.avatar_url) return profile.avatar_url
  if (session?.user?.user_metadata?.avatar_url) return session.user.user_metadata.avatar_url
  return null
}

function getInitials(
  displayName: string,
  session: { user: { user_metadata?: { full_name?: string }; email?: string } } | null
): string {
  if (displayName && displayName !== '—') {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  if (session?.user?.email) return session.user.email.slice(0, 2).toUpperCase()
  return '?'
}

export default function ProfileScreen() {
  const { session, profile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const avatarUrl = getAvatarUrl(profile, session)
  const [avatarLoadError, setAvatarLoadError] = useState(false)
  const showAvatarImage = avatarUrl && !avatarLoadError

  useEffect(() => {
    setAvatarLoadError(false)
  }, [avatarUrl])

  const displayName =
    (profile?.display_name && profile.display_name.trim()) ||
    (session ? getDisplayName(session) : '—')
  const email = session?.user?.email ?? '—'
  const initials = getInitials(displayName, session)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.header}>
          <View style={[styles.avatarWrap, { backgroundColor: colors.tint + '25' }]}>
            {showAvatarImage ? (
              <Image
                source={{ uri: avatarUrl! }}
                style={styles.avatarImage}
                onError={() => setAvatarLoadError(true)}
              />
            ) : (
              <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>{initials}</ThemedText>
            )}
          </View>
          <ThemedText type="title" style={[styles.displayName, { color: colors.text }]}>
            {displayName}
          </ThemedText>
          <ThemedText style={[styles.email, { color: colors.textMuted }]}>{email}</ThemedText>
        </ThemedView>

        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile?.workouts_count ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>Workouts</ThemedText>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile?.streak ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>Streak</ThemedText>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile?.groups_count ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>Groups</ThemedText>
          </View>
        </View>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Account
          </ThemedText>
          <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            <Pressable style={styles.menuItemWrap} onPress={() => router.push('/edit-profile')}>
              <ThemedText style={[styles.menuItem, { color: colors.text }]}>Edit profile</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.menuItemWrap, styles.menuItemBorder]}
              onPress={() => router.push('/settings')}
            >
              <ThemedText style={[styles.menuItem, { color: colors.text }]}>Settings</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.menuItemWrap, styles.menuItemBorder]}
              onPress={() => router.push('/friends')}
            >
              <ThemedText style={[styles.menuItem, { color: colors.text }]}>Friends</ThemedText>
            </Pressable>
            <View style={styles.menuItemWrap}>
              <ThemedText style={[styles.menuItem, { color: colors.textMuted }]}>Notifications</ThemedText>
              <ThemedText style={[styles.menuItemHint, { color: colors.textMuted }]}>In Settings</ThemedText>
            </View>
          </View>
        </ThemedView>

        <SignOutButton />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 88,
    height: 88,
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '600',
  },
  displayName: {
    marginBottom: 4,
    textAlign: 'center',
  },
  email: {
    fontSize: 15,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  statBox: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 24,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  menuCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItemWrap: {
    padding: 16,
  },
  menuItem: {
    fontSize: 16,
  },
  menuItemHint: {
    fontSize: 13,
    marginTop: 2,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(100, 116, 139, 0.2)',
  },
})
