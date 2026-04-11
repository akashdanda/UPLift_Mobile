import { Outfit_900Black, useFonts } from '@expo-google-fonts/outfit'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import { useLayoutEffect } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BrandViolet } from '@/constants/theme'
import {
  TYPICAL_BUSYNESS_FOOTNOTE,
  typicalGymBusyness,
  type TypicalBusynessLevel,
} from '@/lib/gym-typical-busyness'
import type { PresenceRow } from '@/lib/presence-service'

const BUSY_TIER_COLORS: Record<TypicalBusynessLevel, string> = {
  quiet: '#22C55E',
  light: '#84CC16',
  moderate: '#F59E0B',
  busy: '#EF4444',
}

const BUSY_TIER_INDEX: Record<TypicalBusynessLevel, number> = {
  quiet: 0,
  light: 1,
  moderate: 2,
  busy: 3,
}

const METER_SEGMENTS = 4
const METER_MUTE = 'rgba(128,128,128,0.28)'

const { height: WIN_H } = Dimensions.get('window')
const SHEET_MAX = Math.min(WIN_H * 0.52, 420)
const OPEN_MS = 280

const PURPLE_CTA = '#5239FF'

export type MapGymSheetPin = {
  gymOsmType: string
  gymOsmId: string
  lat: number
  lng: number
  tagsJson: string
  name: string
}

type Props = {
  visible: boolean
  pin: MapGymSheetPin | null
  presence: PresenceRow[]
  loading: boolean
  onClose: () => void
  onCheckIn: () => void
}

/**
 * Gym detail sheet when tapping a map pin.
 * Avoid full-screen BlurView over the map WebView — it produced a “stuck blur” with pins visible
 * and sheet content off-screen when Reanimated didn’t advance on the first frames inside Modal.
 */
export function MapGymBottomSheet({ visible, pin, presence, loading, onClose, onCheckIn }: Props) {
  const insets = useSafeAreaInsets()
  const [fontsLoaded] = useFonts({ Outfit_900Black })

  const open = useSharedValue(0)

  useLayoutEffect(() => {
    if (visible) {
      open.value = 0
      queueMicrotask(() => {
        open.value = withTiming(1, {
          duration: OPEN_MS,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
        })
      })
    } else {
      open.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) })
    }
  }, [visible, open])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: open.value * 0.72,
  }))

  /** Small slide only — sheet stays in the layout viewport (no full off-screen start). */
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: 0.92 + open.value * 0.08,
    transform: [{ translateY: (1 - open.value) * 28 }],
  }))

  let tags: Record<string, string> = {}
  try {
    const parsed = JSON.parse(pin?.tagsJson || '{}') as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) tags = parsed as Record<string, string>
  } catch {
    tags = {}
  }
  const venueKey =
    pin != null ? `${pin.gymOsmType}-${pin.gymOsmId}` : undefined
  const busy = typicalGymBusyness(new Date(), tags, venueKey)
  const tierIdx = BUSY_TIER_INDEX[busy.level]
  const tierColor = BUSY_TIER_COLORS[busy.level]

  const visibleOthers = presence.filter((p) => p.share_with_others !== false)
  const visibleSlice = visibleOthers.slice(0, 8)
  const hereCount = visibleOthers.length

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalRoot} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Animated.View style={[styles.dimBackdrop, backdropStyle]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 20) + 8,
              maxHeight: SHEET_MAX,
            },
            sheetStyle,
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.sheetInner} pointerEvents="auto">
            <View style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </View>
            <Text
              style={[
                styles.title,
                fontsLoaded && { fontFamily: 'Outfit_900Black' },
              ]}
              numberOfLines={2}
            >
              {pin?.name ?? 'Gym'}
            </Text>
            <View style={styles.crowdBlock}>
              <Text style={styles.crowdKicker}>Typical busy times</Text>
              <Text style={[styles.crowdStatus, { color: tierColor }]}>{busy.label}</Text>
              <View style={styles.meterRow} accessibilityLabel={`Typical busyness: ${busy.label}`}>
                {Array.from({ length: METER_SEGMENTS }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.meterSeg,
                      { backgroundColor: i <= tierIdx ? tierColor : METER_MUTE },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.crowdDetail}>{busy.detail}</Text>
              <Text style={styles.crowdFoot}>{TYPICAL_BUSYNESS_FOOTNOTE}</Text>
            </View>

            {hereCount > 0 ? (
              <Text style={styles.hereNow}>
                {hereCount} {hereCount === 1 ? 'person is' : 'people are'} here right now
              </Text>
            ) : null}

            {visibleSlice.length > 0 ? (
              <View style={styles.avatarRow}>
                {visibleSlice.map((row, idx) => (
                  <View key={row.user_id} style={[styles.avatarWrap, idx === 0 && styles.avatarWrapFirst]}>
                    {row.avatar_url ? (
                      <Image
                        source={{ uri: row.avatar_url }}
                        style={styles.avatarImg}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.avatarImg, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>
                          {(row.display_name ?? '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.quietHint}>No one is sharing that they&apos;re here right now</Text>
            )}

            <Pressable
              style={[styles.cta, loading && { opacity: 0.6 }]}
              disabled={loading}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                onCheckIn()
              }}
            >
              <Text style={styles.ctaText}>Check in</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dimBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    width: '100%',
    zIndex: 2,
    elevation: 8,
  },
  sheetInner: {
    backgroundColor: 'rgba(18, 14, 28, 0.97)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 22,
    paddingTop: 10,
    marginHorizontal: 0,
  },
  grabberWrap: { alignItems: 'center', marginBottom: 12 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
    fontWeight: '900',
  },
  crowdBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  crowdKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(200,192,220,0.55)',
    marginBottom: 8,
  },
  crowdStatus: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  meterSeg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  crowdDetail: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(232,228,240,0.72)',
    marginBottom: 8,
  },
  crowdFoot: {
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(200,192,220,0.45)',
  },
  hereNow: {
    marginTop: 12,
    color: 'rgba(232,228,240,0.9)',
    fontSize: 15,
    fontWeight: '700',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 4,
  },
  avatarWrap: {
    marginLeft: -12,
    borderWidth: 2,
    borderColor: 'rgba(18,14,28,0.98)',
    borderRadius: 22,
  },
  avatarWrapFirst: { marginLeft: 0 },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: BrandViolet.mid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 16 },
  quietHint: {
    marginTop: 16,
    marginBottom: 8,
    color: 'rgba(232,228,240,0.45)',
    fontSize: 14,
  },
  cta: {
    marginTop: 20,
    backgroundColor: PURPLE_CTA,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
})
