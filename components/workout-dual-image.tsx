import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

type ViewStyleProp = StyleProp<ViewStyle>

type BaseProps = {
  primaryUri: string
  secondaryUri?: string | null
  style?: StyleProp<ViewStyle>
}

/**
 * BeReal-style dual photo for small grids (add to highlight, manage highlight).
 * Tap main or inset to swap which side is large.
 */
export function WorkoutDualImageGrid({ primaryUri, secondaryUri, style }: BaseProps) {
  const [frontIsPrimary, setFrontIsPrimary] = useState(true)

  if (!secondaryUri) {
    return <Image source={{ uri: primaryUri }} style={[styles.gridFill, style]} />
  }

  const mainUri = frontIsPrimary ? primaryUri : secondaryUri
  const overlayUri = frontIsPrimary ? secondaryUri : primaryUri

  const toggle = () => setFrontIsPrimary((f) => !f)

  return (
    <View style={[styles.gridWrap, style]}>
      <Pressable style={styles.gridMainPress} onPress={toggle}>
        <Image source={{ uri: mainUri }} style={styles.gridFill} />
      </Pressable>
      <Pressable style={styles.gridInsetWrap} onPress={toggle}>
        <Image source={{ uri: overlayUri }} style={styles.gridInsetImg} />
      </Pressable>
    </View>
  )
}

/**
 * Which URL to show full-screen vs in the corner inset (BeReal). Resets when `resetKey` changes (e.g. new story slide).
 */
export function useBeRealFlip(
  primaryUri: string,
  secondaryUri: string | null | undefined,
  resetKey: string | number
) {
  const [frontIsPrimary, setFrontIsPrimary] = useState(true)

  useEffect(() => {
    setFrontIsPrimary(true)
  }, [resetKey])

  if (!secondaryUri) {
    return { hasDual: false as const, mainUri: primaryUri }
  }

  const mainUri = frontIsPrimary ? primaryUri : secondaryUri
  const overlayUri = frontIsPrimary ? secondaryUri : primaryUri

  return {
    hasDual: true as const,
    mainUri,
    overlayUri,
    toggle: () => setFrontIsPrimary((f) => !f),
  }
}

/** Small corner photo for full-screen story; place after tap zones with zIndex > tap zones. */
export function WorkoutDualFlipInset({
  overlayUri,
  onPress,
  style,
}: {
  overlayUri: string
  onPress: () => void
  /** e.g. `{ top: insets.top + 96 }` so inset sits below header */
  style?: ViewStyleProp
}) {
  return (
    <Pressable style={[styles.fullInsetWrap, style]} onPress={onPress}>
      <Image source={{ uri: overlayUri }} style={styles.fullInsetImg} contentFit="cover" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  gridWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  gridFill: {
    width: '100%',
    height: '100%',
  },
  gridMainPress: {
    width: '100%',
    height: '100%',
  },
  gridInsetWrap: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: '30%',
    aspectRatio: 4 / 5,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  gridInsetImg: {
    width: '100%',
    height: '100%',
  },

  fullInsetWrap: {
    position: 'absolute',
    top: 120,
    right: 12,
    width: '28%',
    maxWidth: 140,
    aspectRatio: 4 / 5,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
    zIndex: 20,
  },
  fullInsetImg: {
    width: '100%',
    height: '100%',
  },
})
