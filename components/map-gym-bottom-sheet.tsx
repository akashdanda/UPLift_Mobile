import Ionicons from '@expo/vector-icons/Ionicons'
import { Outfit_900Black, useFonts } from '@expo-google-fonts/outfit'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import { useLayoutEffect } from 'react'
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BrandViolet } from '@/constants/theme'
import { MANUAL_MAP_CHECKIN_RADIUS_FT, MANUAL_MAP_CHECKIN_RADIUS_M } from '@/lib/gym-service'
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
/** Cap height without internal scroll — layout stays one compact column. */
const SHEET_MAX = Math.min(WIN_H * 0.58, 440)
const OPEN_MS = 280
/** Max avatars in one row so the sheet stays short. */
const MAX_AVATARS_SHOWN = 5

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
  /** Only true when the user is checked in at this same gym (others’ presence is hidden otherwise). */
  canViewPresenceHere?: boolean
  /** Straight-line distance from user GPS to pin (m); shown as a hint above Check in. */
  distanceToUserM?: number | null
  /** Must match map manual check-in gate (m); default ~250 ft. */
  manualCheckInMaxM?: number
  onClose: () => void
  onCheckIn: () => void
}

/**
 * Gym detail sheet when tapping a map pin.
 * Avoid full-screen BlurView over the map WebView — it produced a “stuck blur” with pins visible
 * and sheet content off-screen when Reanimated didn’t advance on the first frames inside Modal.
 */
export function MapGymBottomSheet({
  visible,
  pin,
  presence,
  loading,
  canViewPresenceHere = false,
  distanceToUserM,
  manualCheckInMaxM = MANUAL_MAP_CHECKIN_RADIUS_M,
  onClose,
  onCheckIn,
}: Props) {
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

  const toFt = (m: number) => Math.round(m * 3.28084)

  const visibleOthers = presence.filter((p) => p.share_with_others !== false)
  const visibleSlice = visibleOthers.slice(0, MAX_AVATARS_SHOWN)
  const hereCount = visibleOthers.length

  const distOk =
    distanceToUserM != null &&
    Number.isFinite(distanceToUserM) &&
    distanceToUserM <= manualCheckInMaxM
  const showDistance =
    distanceToUserM != null && Number.isFinite(distanceToUserM) && distanceToUserM >= 0
  const checkInDisabled = loading || (showDistance && !distOk)

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
              paddingBottom: Math.max(insets.bottom, 16) + 6,
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
            <View style={styles.sheetBody}>
              <Text
                style={[
                  styles.title,
                  fontsLoaded && { fontFamily: 'Outfit_900Black' },
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {pin?.name ?? 'Gym'}
              </Text>

              {showDistance ? (
                <View
                  style={[styles.distanceRow, distOk ? styles.distanceRowOk : styles.distanceRowFar]}
                  accessibilityLabel={
                    distOk
                      ? `Within check-in range, about ${toFt(distanceToUserM)} feet`
                      : `About ${toFt(distanceToUserM)} feet away, move within ${MANUAL_MAP_CHECKIN_RADIUS_FT} feet to check in`
                  }
                >
                  <Ionicons
                    name={distOk ? 'checkmark-circle' : 'navigate-outline'}
                    size={16}
                    color={distOk ? '#4ADE80' : '#FB923C'}
                  />
                  <Text
                    style={[styles.distanceText, distOk ? styles.distanceTextOk : styles.distanceTextFar]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {distOk
                      ? `Within range · ~${toFt(distanceToUserM)} ft`
                      : `~${toFt(distanceToUserM)} ft away · need within ${MANUAL_MAP_CHECKIN_RADIUS_FT} ft`}
                  </Text>
                </View>
              ) : null}

              <View style={styles.unifiedCard}>
                <Text style={styles.crowdKicker}>Typical busy times</Text>
                <Text
                  style={[styles.crowdStatus, { color: tierColor }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {busy.label}
                </Text>
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
                <Text style={styles.crowdDetail} numberOfLines={2} ellipsizeMode="tail">
                  {busy.detail}
                </Text>
                <Text style={styles.crowdFoot} numberOfLines={2} ellipsizeMode="tail">
                  {TYPICAL_BUSYNESS_FOOTNOTE}
                </Text>

                <View style={styles.cardDivider} />

                {loading ? (
                  <View style={styles.presenceBlock}>
                    <Text style={styles.presenceKicker}>Here now</Text>
                    <Text style={styles.quietHint} numberOfLines={2}>
                      Loading…
                    </Text>
                  </View>
                ) : !canViewPresenceHere ? (
                  <View style={styles.presenceBlock}>
                    <Text style={styles.presenceKicker}>Here now</Text>
                    <Text style={styles.quietHint} numberOfLines={3} ellipsizeMode="tail">
                      Check in at this gym to see who else is checked in.
                    </Text>
                  </View>
                ) : hereCount > 0 ? (
                  <View style={styles.presenceBlock}>
                    <Text style={styles.presenceKicker}>Here now</Text>
                    <View style={styles.presenceRow}>
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
                      ) : null}
                      <Text style={styles.hereNow} numberOfLines={1} ellipsizeMode="tail">
                        {`${hereCount} ${hereCount === 1 ? 'person' : 'people'} here${
                          hereCount > MAX_AVATARS_SHOWN ? ` · +${hereCount - MAX_AVATARS_SHOWN}` : ''
                        }`}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.presenceBlock}>
                    <Text style={styles.presenceKicker}>Here now</Text>
                    <Text style={styles.quietHint} numberOfLines={2} ellipsizeMode="tail">
                      No one is sharing they{"'"}re here right now
                    </Text>
                  </View>
                )}
              </View>

              <Pressable
                style={[styles.cta, checkInDisabled && styles.ctaDisabled]}
                disabled={checkInDisabled}
                accessibilityState={{ disabled: checkInDisabled }}
                accessibilityHint={
                  showDistance && !distOk
                    ? `Move within about ${MANUAL_MAP_CHECKIN_RADIUS_FT} feet to enable check-in`
                    : undefined
                }
                onPress={() => {
                  if (checkInDisabled) return
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                  onCheckIn()
                }}
              >
                <Text style={styles.ctaText}>Check in</Text>
              </Pressable>
            </View>
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
    backgroundColor: 'rgba(18, 14, 28, 0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingTop: 8,
    marginHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 24,
  },
  sheetBody: {
    paddingBottom: 2,
  },
  grabberWrap: { alignItems: 'center', marginBottom: 8 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  title: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    fontWeight: '900',
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  distanceRowOk: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(74,222,128,0.35)',
  },
  distanceRowFar: {
    backgroundColor: 'rgba(251,146,60,0.1)',
    borderColor: 'rgba(251,146,60,0.35)',
  },
  distanceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  distanceTextOk: { color: '#86EFAC' },
  distanceTextFar: { color: '#FDBA74' },
  unifiedCard: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 8,
    marginBottom: 8,
  },
  crowdKicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(200,192,220,0.55)',
    marginBottom: 4,
  },
  crowdStatus: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 6,
  },
  meterSeg: {
    flex: 1,
    height: 5,
    borderRadius: 2,
  },
  crowdDetail: {
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(232,228,240,0.72)',
    marginBottom: 4,
  },
  crowdFoot: {
    fontSize: 10,
    lineHeight: 13,
    color: 'rgba(200,192,220,0.45)',
  },
  presenceBlock: {
    gap: 4,
  },
  presenceKicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(200,192,220,0.5)',
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hereNow: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(232,228,240,0.95)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    marginLeft: -8,
    borderWidth: 2,
    borderColor: 'rgba(32,28,42,0.98)',
    borderRadius: 15,
  },
  avatarWrapFirst: { marginLeft: 0 },
  avatarImg: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  avatarFallback: {
    backgroundColor: BrandViolet.mid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 12 },
  quietHint: {
    color: 'rgba(232,228,240,0.52)',
    fontSize: 13,
    lineHeight: 17,
    marginTop: 0,
  },
  cta: {
    marginTop: 12,
    backgroundColor: PURPLE_CTA,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  ctaDisabled: {
    opacity: 0.38,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.15 },
})
