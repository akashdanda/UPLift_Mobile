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
    if (!value && profile?.id) await clearPushTokenFromProfile(profile.id)
    setUpdating(false)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Settings */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
          <Pressable
            style={[styles.row, styles.rowBorder, { borderBottomColor: colors.tabBarBorder }]}
            onPress={() => router.push('/edit-profile')}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="person-outline" size={20} color={colors.text} />
              <ThemedText style={[styles.rowLabel, { color: colors.text, marginLeft: 12 }]}>
                Edit Profile
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
              <View style={styles.rowLabelContainer}>
                <ThemedText style={[styles.rowLabel, { color: colors.text, marginLeft: 12 }]}>
                  Notifications
                </ThemedText>
                <ThemedText style={[styles.rowHint, { color: colors.textMuted, marginLeft: 12, marginTop: 2 }]}>
                  Get notified about challenges and group activity
                </ThemedText>
              </View>
            </View>
            <Switch
              value={notifications}
              onValueChange={handleNotificationsChange}
              disabled={updating}
              trackColor={{ false: colors.tabBarBorder, true: colors.tint + '60' }}
              thumbColor={notifications ? colors.tint : colors.textMuted}
            />
          </View>
          <Pressable
            style={[styles.row, styles.rowBorder, { borderBottomColor: colors.tabBarBorder }]}
            onPress={() => {
              if (!session) return
              Alert.alert(
                'Delete account',
                'This will permanently delete your Uplift account and all associated data. This action cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete account',
                    style: 'destructive',
                    onPress: () => router.push('/delete-account'),
                  },
                ],
              )
            }}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <ThemedText style={[styles.rowLabel, { color: '#EF4444', marginLeft: 12 }]}>
                Delete account
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
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
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowLabelContainer: {
    flex: 1,
  },
  rowLabel: { fontSize: 16 },
  rowHint: { fontSize: 13 },
  sectionTitle: { fontSize: 13, lineHeight: 20 },
})
