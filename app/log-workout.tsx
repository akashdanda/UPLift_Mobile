import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { supabase } from '@/lib/supabase'
import { uploadWorkoutImage } from '@/lib/workout-upload'
import type { Workout } from '@/types/workout'

function getTodayLocalDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function LogWorkoutScreen() {
  const { session, refreshProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  // Photo taken but not yet posted (caption step)
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)

  const today = getTodayLocalDate()

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('workout_date', today)
        .maybeSingle()
      if (!cancelled && data) setTodayWorkout(data as Workout)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [session, today])

  const handleTakePhoto = async () => {
    if (!session) return
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a workout photo.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]?.uri) return

    setPendingPhotoUri(result.assets[0].uri)
  }

  const handlePost = async () => {
    if (!session || !pendingPhotoUri) return
    setUploading(true)
    const uploadResult = await uploadWorkoutImage(session.user.id, pendingPhotoUri)
    if ('error' in uploadResult) {
      setUploading(false)
      Alert.alert('Upload failed', uploadResult.error.message)
      return
    }

    const { error } = await supabase.from('workouts').insert({
      user_id: session.user.id,
      workout_date: today,
      image_url: uploadResult.url,
      caption: caption.trim() || null,
    })

    setUploading(false)
    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already logged', "You've already logged a workout for today.")
      } else {
        Alert.alert('Error', error.message)
      }
      return
    }

    setPendingPhotoUri(null)
    setCaption('')
    await refreshProfile()
    setTodayWorkout({
      id: '',
      user_id: session.user.id,
      workout_date: today,
      image_url: uploadResult.url,
      caption: caption.trim() || null,
      created_at: new Date().toISOString(),
    })
  }

  if (!session) return null
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
          <ThemedText style={[styles.loadingText, { color: colors.textMuted }]}>Loading…</ThemedText>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {todayWorkout ? (
          <View style={styles.doneSection}>
            <ThemedText type="subtitle" style={[styles.doneTitle, { color: colors.text }]}>
              Today&apos;s workout logged
            </ThemedText>
            <ThemedText style={[styles.doneHint, { color: colors.textMuted }]}>
              You can post one workout per day. Come back tomorrow for the next one.
            </ThemedText>
            <View style={[styles.imageWrap, { backgroundColor: colors.card }]}>
              <Image source={{ uri: todayWorkout.image_url }} style={styles.workoutImage} />
            </View>
            {todayWorkout.caption ? (
              <ThemedText style={[styles.caption, { color: colors.textMuted }]}>{todayWorkout.caption}</ThemedText>
            ) : null}
            <Pressable style={[styles.backButton, { borderColor: colors.tint }]} onPress={() => router.back()}>
              <ThemedText style={[styles.backButtonText, { color: colors.tint }]}>Back to Home</ThemedText>
            </Pressable>
          </View>
        ) : !pendingPhotoUri ? (
          <View style={styles.formSection}>
            <ThemedText type="subtitle" style={[styles.formTitle, { color: colors.text }]}>
              Post today&apos;s workout
            </ThemedText>
            <ThemedText style={[styles.formHint, { color: colors.textMuted }]}>
              Take a photo of your workout. One post per day.
            </ThemedText>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.tint }]}
              onPress={handleTakePhoto}
            >
              <ThemedText style={styles.primaryButtonText}>Take photo</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.formSection}>
            <ThemedText type="subtitle" style={[styles.formTitle, { color: colors.text }]}>
              Add a caption (optional)
            </ThemedText>
            <View style={[styles.imageWrap, { backgroundColor: colors.card }]}>
              <Image source={{ uri: pendingPhotoUri }} style={styles.workoutImage} />
            </View>
            <Pressable
              style={[styles.retakeButton, { borderColor: colors.tabBarBorder }]}
              onPress={() => setPendingPhotoUri(null)}
              disabled={uploading}
            >
              <ThemedText style={[styles.retakeButtonText, { color: colors.textMuted }]}>Retake photo</ThemedText>
            </Pressable>

            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Caption (optional)</ThemedText>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
              ]}
              placeholder="What did you do?"
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              editable={!uploading}
            />

            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.tint }]}
              onPress={handlePost}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>Post workout</ThemedText>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12 },
  doneSection: { alignItems: 'center' },
  doneTitle: { marginBottom: 8 },
  doneHint: { textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  imageWrap: { width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  workoutImage: { width: '100%', height: '100%' },
  caption: { marginBottom: 24, textAlign: 'center' },
  backButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1 },
  backButtonText: { fontSize: 16, fontWeight: '600' },
  formSection: {},
  formTitle: { marginBottom: 8 },
  formHint: { marginBottom: 24, lineHeight: 22 },
  retakeButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderRadius: 8,
    borderWidth: 1,
  },
  retakeButtonText: { fontSize: 14 },
  label: { fontSize: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 24,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
})
