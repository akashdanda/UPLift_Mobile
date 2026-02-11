import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Switch, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { useAuthContext } from '@/hooks/use-auth-context'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function SettingsScreen() {
  const { profile, updateProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [notifications, setNotifications] = useState(profile?.notifications_enabled ?? true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (profile?.notifications_enabled !== undefined) {
      setNotifications(profile.notifications_enabled)
    }
  }, [profile?.notifications_enabled])

  const handleNotificationsChange = async (value: boolean) => {
    setNotifications(value)
    setUpdating(true)
    await updateProfile({ notifications_enabled: value })
    setUpdating(false)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
          <View style={[styles.row, styles.rowBorder, { borderBottomColor: colors.tabBarBorder }]}>
            <ThemedText style={[styles.rowLabel, { color: colors.text }]}>Notifications</ThemedText>
            <Switch
              value={notifications}
              onValueChange={handleNotificationsChange}
              disabled={updating}
              trackColor={{ false: colors.tabBarBorder, true: colors.tint + '60' }}
              thumbColor={notifications ? colors.tint : colors.textMuted}
            />
          </View>
          <View style={styles.row}>
            <ThemedText style={[styles.rowLabel, { color: colors.text }]}>Push reminders</ThemedText>
            <ThemedText style={[styles.rowHint, { color: colors.textMuted }]}>Coming soon</ThemedText>
          </View>
        </View>

        <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>
          Notifications let you know about challenges and group activity.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  rowLabel: { fontSize: 16 },
  rowHint: { fontSize: 14 },
  sectionTitle: { fontSize: 13, lineHeight: 20 },
})
