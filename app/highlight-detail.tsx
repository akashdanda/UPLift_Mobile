import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useLayoutEffect, useState } from 'react'
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getHighlightWithWorkouts } from '@/lib/highlights'

const COLS = 3
const GAP = 4

export default function HighlightDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [highlight, setHighlight] = useState<Awaited<ReturnType<typeof getHighlightWithWorkouts>>>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    getHighlightWithWorkouts(id)
      .then(setHighlight)
      .finally(() => setLoading(false))
  }, [id])

  useFocusEffect(useCallback(() => void load(), [load]))

  const navigation = useNavigation()
  useLayoutEffect(() => {
    if (!highlight) return
    navigation.setOptions({
      title: highlight.name,
      headerRight: () => {
        if (!(session && highlight.user_id === session.user.id)) return null
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/manage-highlights', params: { highlightId: highlight.id } })}
            hitSlop={12}
          >
            <ThemedText style={{ color: colors.tint, fontSize: 15 }}>Edit</ThemedText>
          </Pressable>
        )
      },
    })
  }, [highlight, session, navigation, colors.tint])

  const screenWidth = Dimensions.get('window').width
  const size = (screenWidth - (COLS + 1) * GAP) / COLS

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    )
  }

  if (!highlight) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ThemedText style={{ color: colors.textMuted }}>Highlight not found.</ThemedText>
          <Pressable onPress={() => router.back()} style={[styles.backButton, { borderColor: colors.tint }]}>
            <ThemedText style={{ color: colors.tint }}>Go back</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      {highlight.workouts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={48} color={colors.textMuted} />
          <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
            No workouts in this highlight yet.
          </ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.grid, { padding: GAP }]}
          showsVerticalScrollIndicator={false}
        >
          {highlight.workouts.map((workout) => (
            <Pressable
              key={workout.id}
              onPress={() => router.push(`/friend-profile?id=${highlight.user_id}`)}
              style={[styles.gridItem, { width: size, height: size }]}
            >
              <Image source={{ uri: workout.image_url }} style={styles.gridImage} />
              {workout.caption ? (
                <View style={styles.captionOverlay}>
                  <ThemedText style={styles.captionText} numberOfLines={1}>
                    {workout.caption}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 10,
  },
  scroll: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  gridItem: { borderRadius: 4, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
  },
  captionText: { color: '#fff', fontSize: 11 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: { marginTop: 12, textAlign: 'center' },
})
