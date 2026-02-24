import Ionicons from '@expo/vector-icons/Ionicons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import { manipulateAsync, FlipType, SaveFormat } from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'

type CameraCaptureProps = {
  onCapture: (uri: string) => void
  onClose: () => void
  aspect?: [number, number]
  quality?: number
}

export function CameraCapture({
  onCapture,
  onClose,
  aspect = [1, 1],
  quality = 0.8,
}: CameraCaptureProps) {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const cameraRef = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [capturedUri, setCapturedUri] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]} edges={['top', 'bottom']}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#fff" />
          <ThemedText style={styles.permissionText}>
            Camera access is needed to capture workout photos and reaction selfies.
          </ThemedText>
          <Pressable
            onPress={requestPermission}
            style={[styles.permissionButton, { backgroundColor: colors.tint }]}
          >
            <ThemedText style={styles.permissionButtonText}>Grant Access</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const handleCapture = async () => {
    if (!cameraRef.current || processing) return
    setProcessing(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality,
        skipProcessing: false,
      })
      if (!photo?.uri) {
        setProcessing(false)
        return
      }

      // Flip horizontally to match the preview (front camera preview is mirrored)
      const mirrored = await manipulateAsync(
        photo.uri,
        [{ flip: FlipType.Horizontal }],
        { compress: quality, format: SaveFormat.JPEG }
      )

      // Copy to a unique path so preview and upload always use this exact file (no cache/reuse mix-up)
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory
      if (cacheDir) {
        const uniquePath = `${cacheDir}capture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`
        await FileSystem.copyAsync({ from: mirrored.uri, to: uniquePath })
        setCapturedUri(uniquePath)
      } else {
        setCapturedUri(mirrored.uri)
      }
    } catch {
      // ignore capture errors
    }
    setProcessing(false)
  }

  const handleRetake = () => {
    setCapturedUri(null)
  }

  const handleUse = () => {
    if (capturedUri) {
      onCapture(capturedUri)
    }
  }

  if (capturedUri) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <Image source={{ uri: capturedUri }} style={styles.preview} contentFit="contain" />
        <SafeAreaView style={styles.previewControls} edges={['bottom']}>
          <Pressable onPress={handleRetake} style={styles.previewButton}>
            <Ionicons name="refresh" size={24} color="#fff" />
            <ThemedText style={styles.previewButtonText}>Retake</ThemedText>
          </Pressable>
          <Pressable
            onPress={handleUse}
            style={[styles.previewButton, styles.useButton, { backgroundColor: colors.tint }]}
          >
            <Ionicons name="checkmark" size={24} color="#fff" />
            <ThemedText style={styles.previewButtonText}>Use Photo</ThemedText>
          </Pressable>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="front"
      />
      <SafeAreaView style={styles.cameraOverlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={32} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.bottomBar}>
          <View style={styles.shutterWrap}>
            <Pressable
              onPress={handleCapture}
              disabled={processing}
              style={({ pressed }) => [
                styles.shutterButton,
                pressed && styles.shutterPressed,
              ]}
            >
              {processing ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: 32,
  },
  shutterWrap: {
    alignItems: 'center',
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  shutterPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  preview: {
    flex: 1,
  },
  previewControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  useButton: {
    backgroundColor: undefined,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
})
