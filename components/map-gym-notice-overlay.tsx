import Ionicons from '@expo/vector-icons/Ionicons'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import type { ComponentProps } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

const PURPLE = '#5239FF'

export type MapGymNoticeVariant = 'default' | 'warning' | 'error'

type Props = {
  visible: boolean
  title: string
  message: string
  variant?: MapGymNoticeVariant
  /** Primary button label */
  actionLabel?: string
  onDismiss: () => void
}

type IonIcon = ComponentProps<typeof Ionicons>['name']

const VARIANT_ICON: Record<MapGymNoticeVariant, IonIcon> = {
  default: 'information-circle',
  warning: 'walk-outline',
  error: 'alert-circle',
}

const VARIANT_ACCENT: Record<MapGymNoticeVariant, string> = {
  default: PURPLE,
  warning: '#FB923C',
  error: '#F87171',
}

/**
 * Map-scoped notice — matches gym sheet chrome (dark violet, purple CTA) instead of the system alert.
 */
export function MapGymNoticeOverlay({
  visible,
  title,
  message,
  variant = 'default',
  actionLabel = 'OK',
  onDismiss,
}: Props) {
  const accent = VARIANT_ACCENT[variant]
  const icon = VARIANT_ICON[variant]

  const handleDismiss = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onDismiss()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.layer}>
        <Pressable style={styles.scrim} onPress={handleDismiss} accessibilityLabel="Dismiss" />
        <View style={styles.cardCenter} pointerEvents="box-none">
          {Platform.OS === 'ios' ? (
            <BlurView intensity={48} tint="dark" style={styles.blurCard}>
              <CardBody
                accent={accent}
                icon={icon}
                title={title}
                message={message}
                actionLabel={actionLabel}
                onDismiss={handleDismiss}
              />
            </BlurView>
          ) : (
            <View style={[styles.blurCard, styles.cardSolid]}>
              <CardBody
                accent={accent}
                icon={icon}
                title={title}
                message={message}
                actionLabel={actionLabel}
                onDismiss={handleDismiss}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

function CardBody({
  accent,
  icon,
  title,
  message,
  actionLabel,
  onDismiss,
}: {
  accent: string
  icon: IonIcon
  title: string
  message: string
  actionLabel: string
  onDismiss: () => void
}) {
  return (
    <>
      <View style={[styles.iconRing, { borderColor: `${accent}55`, backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={28} color={accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{message}</Text>
      <Pressable
        onPress={onDismiss}
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text style={styles.ctaText}>{actionLabel}</Text>
      </Pressable>
    </>
  )
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cardCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  blurCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  cardSolid: {
    backgroundColor: 'rgba(22, 18, 34, 0.97)',
  },
  iconRing: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    color: 'rgba(232,228,240,0.82)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  cta: {
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
})
