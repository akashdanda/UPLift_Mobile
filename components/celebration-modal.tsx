import { useEffect, useMemo } from 'react'
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { ThemedText } from '@/components/themed-text'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

// ──────────────────────────────────────────────
// Confetti particle
// ──────────────────────────────────────────────
const CONFETTI_COLORS = ['#EAB308', '#EF4444', '#3B82F6', '#22C55E', '#A855F7', '#F97316', '#EC4899']
const PARTICLE_COUNT = 50

function ConfettiParticle({ index, active }: { index: number; active: boolean }) {
  const x = useSharedValue(SCREEN_WIDTH / 2)
  const y = useSharedValue(-20)
  const rotation = useSharedValue(0)
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0)

  const color = useMemo(() => CONFETTI_COLORS[index % CONFETTI_COLORS.length], [index])
  const size = useMemo(() => 6 + Math.random() * 6, [])
  const isSquare = useMemo(() => Math.random() > 0.5, [])

  useEffect(() => {
    if (!active) {
      cancelAnimation(x)
      cancelAnimation(y)
      cancelAnimation(rotation)
      cancelAnimation(opacity)
      cancelAnimation(scale)
      opacity.value = 0
      return
    }

    const startX = Math.random() * SCREEN_WIDTH
    const endX = startX + (Math.random() - 0.5) * 200
    const duration = 2000 + Math.random() * 1500
    const delay = Math.random() * 800

    x.value = startX
    y.value = -20
    opacity.value = 0
    scale.value = 0

    opacity.value = withDelay(delay, withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(1, { duration: duration - 600 }),
      withTiming(0, { duration: 400 })
    ))

    scale.value = withDelay(delay, withSpring(1, { damping: 8 }))

    y.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 50, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    )

    x.value = withDelay(
      delay,
      withTiming(endX, {
        duration,
        easing: Easing.bezier(0.42, 0, 0.58, 1),
      })
    )

    rotation.value = withDelay(
      delay,
      withTiming(360 * (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 3), {
        duration,
        easing: Easing.linear,
      })
    )
  }, [active])

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: x.value,
    top: y.value,
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }))

  return (
    <Animated.View
      style={[
        style,
        {
          width: size,
          height: isSquare ? size : size * 2.5,
          backgroundColor: color,
          borderRadius: isSquare ? 1 : size / 2,
        },
      ]}
    />
  )
}

// ──────────────────────────────────────────────
// CelebrationModal
// ──────────────────────────────────────────────
type Props = {
  visible: boolean
  icon: string
  title: string
  description: string
  onDismiss: () => void
  onShare?: () => void
  accentColor?: string
}

export function CelebrationModal({
  visible,
  icon,
  title,
  description,
  onDismiss,
  onShare,
  accentColor = '#EAB308',
}: Props) {
  const cardScale = useSharedValue(0)
  const cardOpacity = useSharedValue(0)
  const iconScale = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      cardScale.value = 0
      cardOpacity.value = 0
      iconScale.value = 0

      cardOpacity.value = withTiming(1, { duration: 300 })
      cardScale.value = withSpring(1, { damping: 12, stiffness: 120 })
      iconScale.value = withDelay(
        200,
        withSequence(
          withSpring(1.3, { damping: 6, stiffness: 200 }),
          withSpring(1, { damping: 10 })
        )
      )

      // Auto-dismiss after 4 seconds
      const timer = setTimeout(onDismiss, 4000)
      return () => clearTimeout(timer)
    } else {
      cardScale.value = withTiming(0, { duration: 200 })
      cardOpacity.value = withTiming(0, { duration: 200 })
    }
  }, [visible])

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }))

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }))

  const particles = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => i),
    []
  )

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        {/* Confetti layer */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {particles.map((i) => (
            <ConfettiParticle key={i} index={i} active={visible} />
          ))}
        </View>

        {/* Card */}
        <Animated.View style={[styles.card, cardStyle]}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardInner}>
            <Animated.View style={[styles.iconWrap, iconStyle]}>
              <ThemedText style={styles.icon}>{icon}</ThemedText>
            </Animated.View>

            <ThemedText style={styles.celebTitle}>Achievement Unlocked!</ThemedText>
            <ThemedText style={styles.achievementName}>{title}</ThemedText>
            <ThemedText style={styles.achievementDesc}>{description}</ThemedText>

            <View style={styles.buttonRow}>
              {onShare && (
                <Pressable
                  style={[styles.shareBtn, { backgroundColor: accentColor }]}
                  onPress={onShare}
                >
                  <ThemedText style={styles.shareBtnText}>Share to Feed</ThemedText>
                </Pressable>
              )}
              <Pressable style={styles.dismissBtn} onPress={onDismiss}>
                <ThemedText style={styles.dismissBtnText}>Nice!</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: SCREEN_WIDTH * 0.82,
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardInner: {
    backgroundColor: '#1E293B',
    padding: 32,
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(234,179,8,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 44,
  },
  celebTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EAB308',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  achievementName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  achievementDesc: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  shareBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    flex: 1,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15,
  },
  dismissBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    flex: 1,
    alignItems: 'center',
  },
  dismissBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 15,
  },
})
