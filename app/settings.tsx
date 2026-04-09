import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { clearPushTokenFromProfile } from '@/lib/push-notifications'

export default function SettingsScreen() {
  const { profile, updateProfile, session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'

  const [notifications, setNotifications] = useState(profile?.notifications_enabled ?? true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (profile?.notifications_enabled !== undefined) setNotifications(profile.notifications_enabled)
  }, [profile?.notifications_enabled])

  const handleNotificationsChange = async (value: boolean) => {
    setNotifications(value)
    setUpdating(true)
    await updateProfile({ notifications_enabled: value })
    if (!value && profile?.id) await clearPushTokenFromProfile(profile.id)
    setUpdating(false)
  }

  const sep = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ThemedText style={[styles.sectionLabel, { color: colors.textMuted }]}>Account</ThemedText>
        <View style={[styles.card, { backgroundColor: isDark ? colors.card : colors.card }]}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            onPress={() => router.push('/edit-profile')}
          >
            <Ionicons name="person-outline" size={20} color={colors.text} />
            <View style={styles.rowText}>
              <ThemedText style={[styles.rowLabel, { color: colors.text }]}>Edit profile</ThemedText>
              <ThemedText style={[styles.rowHint, { color: colors.textMuted }]}>Name, photo, bio</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          <View style={[styles.sep, { backgroundColor: sep }]} />

          <View style={styles.row}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            <View style={styles.rowText}>
              <ThemedText style={[styles.rowLabel, { color: colors.text }]}>Notifications</ThemedText>
              <ThemedText style={[styles.rowHint, { color: colors.textMuted }]}>Challenges &amp; activity</ThemedText>
            </View>
            <Switch
              value={notifications}
              onValueChange={handleNotificationsChange}
              disabled={updating}
              trackColor={{ false: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', true: colors.tint + '50' }}
              thumbColor={notifications ? colors.tint : isDark ? '#555' : '#ccc'}
            />
          </View>
        </View>

        <ThemedText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 32 }]}>Danger zone</ThemedText>
        <View style={[styles.card, { backgroundColor: isDark ? colors.card : colors.card }]}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            onPress={() => {
              if (!session) return
              Alert.alert(
                'Delete account',
                'This will permanently delete your account and all data. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => router.push('/delete-account') },
                ],
              )
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <View style={styles.rowText}>
              <ThemedText style={[styles.rowLabel, { color: '#EF4444' }]}>Delete account</ThemedText>
              <ThemedText style={[styles.rowHint, { color: colors.textMuted }]}>Permanently remove everything</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  sectionLabel: { fontSize: 13, fontWeight: '500', letterSpacing: 0.2, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  sep: { height: 1, marginLeft: 50 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowHint: { fontSize: 12, marginTop: 1 },
})
