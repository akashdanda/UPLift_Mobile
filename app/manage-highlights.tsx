import Ionicons from '@expo/vector-icons/Ionicons'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  addWorkoutToHighlight,
  createHighlight,
  deleteHighlight,
  getHighlightWithWorkouts,
  getHighlightsForProfile,
  removeWorkoutFromHighlight,
  setHighlightCover,
  setHighlightCoverImage,
  updateHighlight,
} from '@/lib/highlights'
import { uploadHighlightCover } from '@/lib/highlight-cover-upload'
import type { HighlightForProfile } from '@/types/highlight'
import type { HighlightWithWorkouts } from '@/types/highlight'

const COLS = 3
const GAP = 4

export default function ManageHighlightsScreen() {
  const { highlightId } = useLocalSearchParams<{ highlightId?: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [list, setList] = useState<HighlightForProfile[]>([])
  const [detail, setDetail] = useState<HighlightWithWorkouts | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  const loadList = useCallback(() => {
    if (!session) return
    getHighlightsForProfile(session.user.id).then(setList)
  }, [session])

  const loadDetail = useCallback(() => {
    if (!highlightId) {
      setDetail(null)
      setLoading(false)
      return
    }
    setLoading(true)
    getHighlightWithWorkouts(highlightId)
      .then((h) => {
        setDetail(h)
        setEditingName(h?.name ?? '')
      })
      .finally(() => setLoading(false))
  }, [highlightId])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const handleCreateNew = () => {
    Alert.prompt(
      'New highlight',
      'Give your highlight a name',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (name: string | undefined) => {
            if (!session || !name?.trim()) return
            const result = await createHighlight(session.user.id, name.trim())
            if ('error' in result) {
              Alert.alert('Error', result.error.message)
              return
            }
            loadList()
            router.push({ pathname: '/manage-highlights', params: { highlightId: result.id } })
          },
        },
      ],
      'plain-text',
      undefined,
      'default'
    )
  }

  const handleSaveName = async () => {
    if (!detail || !session || editingName.trim() === detail.name) return
    setSaving(true)
    const result = await updateHighlight(detail.id, session.user.id, { name: editingName.trim() })
    setSaving(false)
    if ('error' in result) {
      Alert.alert('Error', result.error.message)
      return
    }
    setDetail((prev) => (prev ? { ...prev, name: editingName.trim() } : null))
  }

  const handleSetCover = async (workoutId: string) => {
    if (!detail || !session) return
    const result = await setHighlightCover(detail.id, session.user.id, workoutId)
    if ('error' in result) {
      Alert.alert('Error', result.error.message)
      return
    }
    loadDetail()
  }

  const handleChooseCoverFromCameraRoll = async () => {
    if (!detail || !session) return
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to set a cover image.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]?.uri) return
    setUploadingCover(true)
    const uploadResult = await uploadHighlightCover(session.user.id, detail.id, result.assets[0].uri)
    if ('error' in uploadResult) {
      setUploadingCover(false)
      Alert.alert('Upload failed', uploadResult.error.message)
      return
    }
    const updateResult = await setHighlightCoverImage(detail.id, session.user.id, uploadResult.url)
    setUploadingCover(false)
    if ('error' in updateResult) {
      Alert.alert('Error', updateResult.error.message)
      return
    }
    loadDetail()
  }

  const handleRemoveWorkout = (workoutId: string) => {
    if (!detail || !session) return
    Alert.alert(
      'Remove from highlight',
      'Remove this workout from the highlight?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeWorkoutFromHighlight(detail.id, workoutId, session.user.id)
            if ('error' in result) Alert.alert('Error', result.error.message)
            else loadDetail()
          },
        },
      ]
    )
  }

  const handleDeleteHighlight = () => {
    if (!detail || !session) return
    Alert.alert(
      'Delete highlight',
      `Delete "${detail.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteHighlight(detail.id, session.user.id)
            if ('error' in result) Alert.alert('Error', result.error.message)
            else router.back()
          },
        },
      ]
    )
  }

  if (!session) return null

  const screenWidth = Dimensions.get('window').width
  const size = (screenWidth - (COLS + 1) * GAP) / COLS

  if (highlightId && loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    )
  }

  if (highlightId && detail) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={[styles.header, { borderBottomColor: colors.tabBarBorder }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16 }}>
            Edit highlight
          </ThemedText>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.nameRow, { borderBottomColor: colors.tabBarBorder }]}>
            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Name</ThemedText>
            <TextInput
              style={[
                styles.nameInput,
                { backgroundColor: colors.cardElevated, color: colors.text, borderColor: colors.tabBarBorder },
              ]}
              value={editingName}
              onChangeText={setEditingName}
              onBlur={handleSaveName}
              placeholder="Highlight name"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          {/* Cover section - camera roll or select from below */}
          <View style={[styles.coverSection, { borderBottomColor: colors.tabBarBorder }]}>
            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Cover photo</ThemedText>
            <ThemedText style={[styles.coverHint, { color: colors.textMuted }]}>
              Choose from your camera roll or tap a photo below to set as cover.
            </ThemedText>
            <View style={styles.coverPreviewRow}>
              <Pressable
                onPress={handleChooseCoverFromCameraRoll}
                disabled={uploadingCover}
                style={[styles.coverPreviewCircle, { borderColor: colors.tabBarBorder }]}
              >
                {uploadingCover ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : (() => {
                  const customUrl = (detail as { cover_image_url?: string | null }).cover_image_url
                  const coverWorkout = detail.workouts.find((w) => w.id === detail.cover_workout_id)
                  const coverUri = customUrl ?? coverWorkout?.image_url
                  return coverUri ? (
                    <Image source={{ uri: coverUri }} style={styles.coverPreviewImage} />
                  ) : (
                    <View style={styles.coverPlaceholder}>
                      <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
                      <ThemedText style={[styles.coverPlaceholderText, { color: colors.textMuted }]}>
                        Tap to choose
                      </ThemedText>
                    </View>
                  )
                })()}
              </Pressable>
            </View>
            <Pressable
              onPress={handleChooseCoverFromCameraRoll}
              disabled={uploadingCover}
              style={[styles.chooseFromRollBtn, { borderColor: colors.tint }]}
            >
              <Ionicons name="images-outline" size={18} color={colors.tint} />
              <ThemedText style={[styles.chooseFromRollBtnText, { color: colors.tint }]}>
                Choose from camera roll
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold" style={[styles.sectionTitle, { color: colors.text }]}>
              Workouts in this highlight
            </ThemedText>
            <Pressable
              onPress={() => router.push({ pathname: '/add-workouts-to-highlight', params: { highlightId: detail.id } })}
              style={[styles.addButton, { borderColor: colors.tint, backgroundColor: colors.tint + '15' }]}
            >
              <Ionicons name="add" size={20} color={colors.tint} />
              <ThemedText style={[styles.addButtonText, { color: colors.tint }]}>Add workouts</ThemedText>
            </Pressable>
            <View style={[styles.grid, { marginTop: 12 }]}>
              {detail.workouts.map((workout) => (
                <Pressable
                  key={workout.id}
                  onPress={() => handleSetCover(workout.id)}
                  style={[styles.gridItem, { width: size, height: size }]}
                >
                  <Image source={{ uri: workout.image_url }} style={styles.gridImage} />
                  {detail.cover_workout_id === workout.id ? (
                    <View style={[styles.coverBadge, { backgroundColor: colors.tint }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <ThemedText style={styles.coverBadgeText}>Cover</ThemedText>
                    </View>
                  ) : (
                    <View style={styles.coverOverlay}>
                      <ThemedText style={styles.coverOverlayText}>Tap to set as cover</ThemedText>
                    </View>
                  )}
                  <Pressable
                    onPress={() => handleRemoveWorkout(workout.id)}
                    style={[styles.removeBtn, { backgroundColor: 'rgba(0,0,0,0.7)' }]}
                  >
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          </View>
          <Pressable
            onPress={handleDeleteHighlight}
            style={[styles.deleteButton, { borderColor: colors.textMuted }]}
          >
            <ThemedText style={[styles.deleteButtonText, { color: colors.textMuted }]}>Delete highlight</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.tabBarBorder }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 16 }}>
          Highlights
        </ThemedText>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
          Create highlights to showcase your favorite workouts on your profile.
        </ThemedText>
        <Pressable
          onPress={handleCreateNew}
          style={[styles.newHighlightCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}
        >
          <View style={[styles.newHighlightCircle, { backgroundColor: colors.cardElevated }]}>
            <Ionicons name="add" size={32} color={colors.textMuted} />
          </View>
          <ThemedText style={[styles.newHighlightLabel, { color: colors.text }]}>New highlight</ThemedText>
        </Pressable>
        <View style={styles.list}>
          {list.map((h) => (
            <Pressable
              key={h.id}
              onPress={() => router.push({ pathname: '/manage-highlights', params: { highlightId: h.id } })}
              style={[styles.highlightRow, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}
            >
              <View style={[styles.highlightThumb, { backgroundColor: colors.cardElevated }]}>
                {h.cover_image_url ? (
                  <Image source={{ uri: h.cover_image_url }} style={styles.highlightThumbImage} />
                ) : (
                  <Ionicons name="images-outline" size={28} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.highlightInfo}>
                <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>{h.name}</ThemedText>
                <ThemedText style={{ color: colors.textMuted, fontSize: 13 }}>
                  {h.workouts_count} workout{h.workouts_count !== 1 ? 's' : ''}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  nameRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 12, marginBottom: 6 },
  nameInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  section: { marginTop: 20 },
  sectionTitle: { marginBottom: 10, fontSize: 15 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  addButtonText: { fontSize: 15 },
  coverSection: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  coverHint: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  coverPreviewRow: { alignItems: 'center', marginTop: 4 },
  coverPreviewCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPreviewImage: { width: 80, height: 80 },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  coverPlaceholderText: { fontSize: 11 },
  chooseFromRollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  chooseFromRollBtnText: { fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  gridItem: { borderRadius: 6, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  coverBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverOverlayText: { color: 'rgba(255,255,255,0.9)', fontSize: 10 },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    marginTop: 32,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteButtonText: { fontSize: 15 },
  hint: { fontSize: 14, marginBottom: 16 },
  newHighlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  newHighlightCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  newHighlightLabel: { fontSize: 16 },
  list: { gap: 10 },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  highlightThumb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  highlightThumbImage: { width: 56, height: 56 },
  highlightInfo: { flex: 1 },
})
