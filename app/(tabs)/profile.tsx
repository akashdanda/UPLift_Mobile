import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

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

const MENU_ITEMS = [
  { label: 'Edit profile', icon: 'person-outline' as const, route: '/edit-profile' },
  { label: 'Friends', icon: 'people-outline' as const, route: '/friends' },
  { label: 'Settings', icon: 'settings-outline' as const, route: '/settings' },
]

export default function ProfileScreen() {
  const { session, profile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const avatarUrl = getAvatarUrl(profile, session)
  const [avatarLoadError, setAvatarLoadError] = useState(false)
  const [isImageModalVisible, setIsImageModalVisible] = useState(false)
  const showAvatarImage = avatarUrl && !avatarLoadError

  useEffect(() => {
    setAvatarLoadError(false)
  }, [avatarUrl])

  const displayName =
    (profile?.display_name && profile.display_name.trim()) ||
    (session ? getDisplayName(session) : '—')
  const email = session?.user?.email ?? '—'
  const initials = getInitials(displayName, session)

  const stats = [
    { value: profile?.workouts_count ?? 0, label: 'Workouts', color: colors.tint },
    { value: profile?.streak ?? 0, label: 'Streak', color: colors.warm },
    { value: profile?.groups_count ?? 0, label: 'Groups', color: colors.tint },
    { value: profile?.friends_count ?? 0, label: 'Friends', color: colors.tint },
  ]

  // Zoom modal state (avatar pinch-to-zoom)
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1)
      } else if (scale.value > 3) {
        scale.value = withSpring(3)
      }
      savedScale.value = scale.value
    })

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handleOpenModal = () => {
    if (showAvatarImage) {
      setIsImageModalVisible(true)
      scale.value = 1
      savedScale.value = 1
    }
  }

  const handleCloseModal = () => {
    setIsImageModalVisible(false)
    scale.value = withTiming(1)
    savedScale.value = 1
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.header}>
          <Pressable onPress={handleOpenModal} disabled={!showAvatarImage}>
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
          </Pressable>
          <ThemedText type="title" style={[styles.displayName, { color: colors.text }]}>
            {displayName}
          </ThemedText>
          <ThemedText style={[styles.email, { color: colors.textMuted }]}>{email}</ThemedText>
          {profile?.bio ? (
            <ThemedText style={[styles.bio, { color: colors.textMuted }]}>{profile.bio}</ThemedText>
          ) : null}
        </ThemedView>

        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: colors.card }]}>
              <ThemedText style={[styles.statValue, { color: s.color }]}>{s.value}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</ThemedText>
            </View>
          ))}
        </View>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Badges
          </ThemedText>
          <View style={[styles.badgesContainer, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            <ThemedText style={[styles.emptyBadgesText, { color: colors.textMuted }]}>
              No badges yet. Keep working out to earn your first badge!
            </ThemedText>
          </View>
        </ThemedView>

        <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
          {MENU_ITEMS.map((item, i) => (
            <Pressable
              key={item.label}
              style={[
                styles.menuItemWrap,
                i < MENU_ITEMS.length - 1 && [styles.menuItemBorder, { borderBottomColor: colors.tabBarBorder }],
              ]}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons name={item.icon} size={20} color={colors.textMuted} style={{ marginRight: 14 }} />
              <ThemedText style={[styles.menuItem, { color: colors.text }]}>{item.label}</ThemedText>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
            </Pressable>
          ))}
        </View>

        <SignOutButton />
      </ScrollView>

      <Modal
        visible={isImageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCloseModal}>
          <View style={styles.modalContent} pointerEvents="box-none">
            <Pressable onPress={(e) => e.stopPropagation()}>
              <GestureDetector gesture={pinchGesture}>
                <Animated.View style={[styles.zoomedImageContainer, animatedImageStyle]}>
                  {showAvatarImage && (
                    <Image
                      source={{ uri: avatarUrl! }}
                      style={styles.zoomedImage}
                      contentFit="cover"
                    />
                  )}
                </Animated.View>
              </GestureDetector>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 24 },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  avatarImage: { width: 96, height: 96 },
  avatarInitials: { fontSize: 34, fontWeight: '700' },
  displayName: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  email: { fontSize: 14 },
  bio: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
    lineHeight: 20,
  },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statBox: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { marginTop: 2, fontSize: 11, opacity: 0.7 },

  section: { marginBottom: 24 },
  sectionTitle: { marginBottom: 12 },
  badgesContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBadgesText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  menuCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  menuItemWrap: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuItem: { fontSize: 16 },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomedImageContainer: { justifyContent: 'center', alignItems: 'center' },
  zoomedImage: {
    width: Dimensions.get('window').width * 0.8,
    height: Dimensions.get('window').width * 0.8,
    borderRadius: (Dimensions.get('window').width * 0.8) / 2,
    overflow: 'hidden',
  },
})
