import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { submitReport, type ReportReason } from '@/lib/reports'

type ReportModalProps = {
  visible: boolean
  onClose: () => void
  reporterId: string
  reportedUserId?: string
  reportedGroupId?: string
  reportedWorkoutId?: string
  reportedEntityName?: string
}

const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  {
    value: 'inappropriate_content',
    label: 'Inappropriate Content',
    description: 'Content violates community guidelines',
  },
  {
    value: 'inappropriate_name',
    label: 'Inappropriate Name',
    description: 'Name is offensive or inappropriate',
  },
  {
    value: 'inappropriate_picture',
    label: 'Inappropriate Picture',
    description: 'Picture contains inappropriate content',
  },
  {
    value: 'harassment',
    label: 'Harassment',
    description: 'Bullying, threats, or harassment',
  },
  {
    value: 'spam',
    label: 'Spam',
    description: 'Repetitive or unwanted content',
  },
  {
    value: 'fake_account',
    label: 'Fake Account',
    description: 'Account appears to be fake or impersonating',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other reason not listed',
  },
]

export function ReportModal({
  visible,
  onClose,
  reporterId,
  reportedUserId,
  reportedGroupId,
  reportedWorkoutId,
  reportedEntityName,
}: ReportModalProps) {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Select a reason', 'Please select a reason for reporting.')
      return
    }

    setSubmitting(true)
    const { error } = await submitReport(reporterId, {
      reportedUserId,
      reportedGroupId,
      reportedWorkoutId,
      reason: selectedReason,
      description: description.trim() || undefined,
    })
    setSubmitting(false)

    if (error) {
      Alert.alert('Error', error.message)
    } else {
      Alert.alert('Report submitted', 'Thank you for your report. We will review it shortly.', [
        { text: 'OK', onPress: onClose },
      ])
      // Reset form
      setSelectedReason(null)
      setDescription('')
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setSelectedReason(null)
      setDescription('')
      onClose()
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.tabBarBorder }]}>
          <Pressable onPress={handleClose} style={styles.closeButton} disabled={submitting}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
          <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
            Report
          </ThemedText>
          <View style={styles.closeButton} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <ThemedView style={[styles.card, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
              What would you like to report?
            </ThemedText>
            {reportedEntityName && (
              <ThemedText style={[styles.entityName, { color: colors.textMuted }]}>
                {reportedEntityName}
              </ThemedText>
            )}

            <View style={styles.reasonsList}>
              {REPORT_REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  onPress={() => setSelectedReason(reason.value)}
                  style={({ pressed }) => [
                    styles.reasonOption,
                    {
                      backgroundColor: selectedReason === reason.value ? colors.tint + '15' : colors.cardElevated,
                      borderColor: selectedReason === reason.value ? colors.tint : colors.tabBarBorder,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.reasonHeader}>
                    <ThemedText
                      style={[
                        styles.reasonLabel,
                        { color: selectedReason === reason.value ? colors.tint : colors.text },
                      ]}
                    >
                      {reason.label}
                    </ThemedText>
                    <View
                      style={[
                        styles.radioButton,
                        {
                          borderColor: selectedReason === reason.value ? colors.tint : colors.textMuted,
                          backgroundColor: selectedReason === reason.value ? colors.tint : 'transparent',
                        },
                      ]}
                    >
                      {selectedReason === reason.value && (
                        <View style={[styles.radioButtonInner, { backgroundColor: colors.background }]} />
                      )}
                    </View>
                  </View>
                  <ThemedText style={[styles.reasonDescription, { color: colors.textMuted }]}>
                    {reason.description}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.descriptionSection}>
              <ThemedText style={[styles.descriptionLabel, { color: colors.text }]}>
                Additional details (optional)
              </ThemedText>
              <TextInput
                style={[
                  styles.descriptionInput,
                  {
                    backgroundColor: colors.background,
                    color: colors.text,
                    borderColor: colors.tabBarBorder,
                  },
                ]}
                placeholder="Provide more context about the issue..."
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!submitting}
              />
            </View>
          </ThemedView>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.tabBarBorder, backgroundColor: colors.background }]}>
          <Pressable
            onPress={handleClose}
            style={[styles.cancelButton, { borderColor: colors.tabBarBorder }]}
            disabled={submitting}
          >
            <ThemedText style={[styles.cancelButtonText, { color: colors.textMuted }]}>Cancel</ThemedText>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            style={[
              styles.submitButton,
              {
                backgroundColor: selectedReason ? colors.tint : colors.textMuted,
                opacity: selectedReason && !submitting ? 1 : 0.5,
              },
            ]}
            disabled={!selectedReason || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.submitButtonText}>Submit Report</ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  entityName: {
    fontSize: 14,
    marginBottom: 20,
  },
  reasonsList: {
    gap: 12,
    marginBottom: 24,
  },
  reasonOption: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reasonLabel: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reasonDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  descriptionSection: {
    marginTop: 8,
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  descriptionInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    maxHeight: 150,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
})
