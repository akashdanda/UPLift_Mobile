import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  getGroupMembers,
  getGroupMessages,
  isMember,
  leaveGroup,
  sendGroupMessage,
  type GroupWithMeta,
  type GroupMemberWithProfile,
} from '@/lib/groups'
import { supabase } from '@/lib/supabase'
import type { GroupMessage } from '@/types/group'

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session, refreshProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [group, setGroup] = useState<GroupWithMeta | null>(null)
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([])
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [isUserMember, setIsUserMember] = useState(false)
  const [loading, setLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)

  const userId = session?.user?.id ?? ''

  const loadGroup = useCallback(async () => {
    if (!id || !userId) return
    setLoading(true)

    try {
      // Fetch group
      const { data: groupData } = await supabase.from('groups').select('*').eq('id', id).single()
      if (!groupData) {
        Alert.alert('Error', 'Group not found')
        router.back()
        return
      }

      // Get member count
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', id)

      setGroup({ ...groupData, member_count: count ?? 0 } as GroupWithMeta)

      // Check if user is member
      const member = await isMember(userId, id)
      setIsUserMember(member)

      // Load members and messages if user is a member
      if (member) {
        const [membersData, messagesData] = await Promise.all([
          getGroupMembers(id),
          getGroupMessages(id),
        ])
        setMembers(membersData)
        setMessages(messagesData.reverse()) // Reverse to show oldest first
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load group')
    } finally {
      setLoading(false)
    }
  }, [id, userId])

  useFocusEffect(
    useCallback(() => {
      void loadGroup()
    }, [loadGroup])
  )

  // Subscribe to new messages if user is a member
  useEffect(() => {
    if (!isUserMember || !id) return

    const channel = supabase
      .channel(`group:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${id}`,
        },
        (payload) => {
          const newMessage = payload.new as GroupMessage
          setMessages((prev) => [...prev, newMessage])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isUserMember, id])

  const handleSendMessage = async () => {
    if (!messageText.trim() || !isUserMember || !id || !userId) return
    setSending(true)
    const { error } = await sendGroupMessage(userId, id, messageText)
    setSending(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setMessageText('')
    }
  }

  const handleLeave = () => {
    if (!userId || !id) return
    Alert.alert('Leave group', `Leave "${group?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const { error } = await leaveGroup(userId, id)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            await refreshProfile()
            router.back()
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    )
  }

  if (!group) return null

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Group Header */}
          <View style={styles.header}>
            {group.avatar_url ? (
              <Image source={{ uri: group.avatar_url }} style={styles.groupAvatar} />
            ) : (
              <View style={[styles.groupAvatarPlaceholder, { backgroundColor: colors.tint + '25' }]}>
                <ThemedText style={[styles.groupAvatarText, { color: colors.tint }]}>
                  {group.name.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
            )}
            <ThemedText type="title" style={[styles.groupName, { color: colors.text }]}>
              {group.name}
            </ThemedText>
            {group.description && (
              <ThemedText style={[styles.groupDescription, { color: colors.textMuted }]}>
                {group.description}
              </ThemedText>
            )}
            {group.tags && group.tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {group.tags.map((tag, idx) => (
                  <View key={idx} style={[styles.tag, { backgroundColor: colors.tint + '20' }]}>
                    <ThemedText style={[styles.tagText, { color: colors.tint }]}>{tag}</ThemedText>
                  </View>
                ))}
              </View>
            )}
            <ThemedText style={[styles.memberCount, { color: colors.textMuted }]}>
              {group.member_count ?? 0} member{(group.member_count ?? 0) !== 1 ? 's' : ''}
            </ThemedText>
            {isUserMember && (
              <Pressable style={[styles.leaveButton, { borderColor: '#ef4444' }]} onPress={handleLeave}>
                <ThemedText style={[styles.leaveButtonText, { color: '#ef4444' }]}>Leave Group</ThemedText>
              </Pressable>
            )}
          </View>

          {/* Bio */}
          {group.bio && (
            <ThemedView style={styles.section}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
                About
              </ThemedText>
              <ThemedText style={[styles.bio, { color: colors.textMuted }]}>{group.bio}</ThemedText>
            </ThemedView>
          )}

          {/* Members */}
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Members (Ranked)
            </ThemedText>
            {members.length === 0 ? (
              <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>No members yet</ThemedText>
            ) : (
              <View style={styles.membersList}>
                {members.map((member, idx) => (
                  <View
                    key={member.id}
                    style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}
                  >
                    <View style={styles.memberRank}>
                      <ThemedText style={[styles.rankNumber, { color: colors.tint }]}>#{idx + 1}</ThemedText>
                    </View>
                    {member.avatar_url ? (
                      <Image source={{ uri: member.avatar_url }} style={styles.memberAvatar} />
                    ) : (
                      <View style={[styles.memberAvatarPlaceholder, { backgroundColor: colors.tint + '25' }]}>
                        <ThemedText style={[styles.memberAvatarText, { color: colors.tint }]}>
                          {member.display_name?.charAt(0).toUpperCase() ?? '?'}
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.memberInfo}>
                      <ThemedText type="defaultSemiBold" style={[styles.memberName, { color: colors.text }]}>
                        {member.display_name ?? 'Unknown'}
                      </ThemedText>
                      <ThemedText style={[styles.memberStats, { color: colors.textMuted }]}>
                        {member.points} pts • {member.workouts_count} workouts
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ThemedView>

          {/* Chat (only for members) */}
          {isUserMember && (
            <ThemedView style={styles.section}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
                Group Chat
              </ThemedText>
              <View style={[styles.chatContainer, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
                <ScrollView style={styles.messagesList} nestedScrollEnabled>
                  {messages.length === 0 ? (
                    <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>
                      No messages yet. Start the conversation!
                    </ThemedText>
                  ) : (
                    messages.map((msg) => {
                      const isOwn = msg.user_id === userId
                      return (
                        <View
                          key={msg.id}
                          style={[styles.messageRow, isOwn && styles.messageRowOwn]}
                        >
                          <View
                            style={[
                              styles.messageBubble,
                              isOwn
                                ? { backgroundColor: colors.tint, alignSelf: 'flex-end' }
                                : { backgroundColor: colors.tabBarBorder, alignSelf: 'flex-start' },
                            ]}
                          >
                            <ThemedText
                              style={[
                                styles.messageText,
                                isOwn ? { color: '#fff' } : { color: colors.text },
                              ]}
                            >
                              {msg.message}
                            </ThemedText>
                          </View>
                        </View>
                      )
                    })
                  )}
                </ScrollView>
                <View style={[styles.chatInputRow, { borderTopColor: colors.tabBarBorder }]}>
                  <TextInput
                    style={[
                      styles.chatInput,
                      { backgroundColor: colors.background, color: colors.text, borderColor: colors.tabBarBorder },
                    ]}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.textMuted}
                    value={messageText}
                    onChangeText={setMessageText}
                    multiline
                    editable={!sending}
                  />
                  <Pressable
                    style={[styles.sendButton, { backgroundColor: colors.tint }]}
                    onPress={handleSendMessage}
                    disabled={!messageText.trim() || sending}
                  >
                    {sending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <ThemedText style={styles.sendButtonText}>Send</ThemedText>
                    )}
                  </Pressable>
                </View>
              </View>
            </ThemedView>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24 },
  groupAvatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  groupAvatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  groupAvatarText: { fontSize: 48, fontWeight: '600' },
  groupName: { marginBottom: 8, textAlign: 'center' },
  groupDescription: { fontSize: 15, textAlign: 'center', marginBottom: 12 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, justifyContent: 'center' },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  tagText: { fontSize: 12, fontWeight: '600' },
  memberCount: { fontSize: 14, marginBottom: 16 },
  leaveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  leaveButtonText: { fontSize: 14, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { marginBottom: 12 },
  bio: { fontSize: 15, lineHeight: 22 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  membersList: { gap: 12 },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberRank: { width: 32, alignItems: 'center', marginRight: 12 },
  rankNumber: { fontSize: 16, fontWeight: '700' },
  memberAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  memberAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberAvatarText: { fontSize: 20, fontWeight: '600' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, marginBottom: 2 },
  memberStats: { fontSize: 13 },
  chatContainer: {
    borderRadius: 14,
    borderWidth: 1,
    height: 400,
    overflow: 'hidden',
  },
  messagesList: {
    flex: 1,
    padding: 16,
    maxHeight: 300,
  },
  messageRow: { marginBottom: 12 },
  messageRowOwn: { alignItems: 'flex-end' },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '75%',
  },
  messageText: { fontSize: 15 },
  chatInputRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
