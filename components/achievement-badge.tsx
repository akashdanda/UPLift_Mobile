import Ionicons from '@expo/vector-icons/Ionicons'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

type BadgeDef = {
  icon: IoniconsName
  colors: [string, string]
}

const BADGE_MAP: Record<string, BadgeDef> = {
  no_days_off:        { icon: 'flash',              colors: ['#3B82F6', '#1D4ED8'] },
  grind_season:       { icon: 'flame',              colors: ['#F97316', '#DC2626'] },
  monthly_warrior:    { icon: 'shield-checkmark',   colors: ['#14B8A6', '#0D9488'] },
  iron_habit:         { icon: 'barbell',            colors: ['#6366F1', '#4338CA'] },
  hype_man:           { icon: 'megaphone',          colors: ['#A855F7', '#7C3AED'] },
  recruiter:          { icon: 'people',             colors: ['#F59E0B', '#D97706'] },
  pack_leader:        { icon: 'paw',               colors: ['#6366F1', '#4F46E5'] },
  founding_100:       { icon: 'diamond',            colors: ['#06B6D4', '#0891B2'] },
  top_leaderboard:    { icon: 'trophy',             colors: ['#EAB308', '#CA8A04'] },
  comeback_kid:       { icon: 'refresh',            colors: ['#22C55E', '#16A34A'] },
  undefeated:         { icon: 'medal',              colors: ['#EAB308', '#B45309'] },
  comment_king:       { icon: 'chatbubbles',        colors: ['#06B6D4', '#0E7490'] },
  react_machine:      { icon: 'sparkles',           colors: ['#EC4899', '#DB2777'] },
  early_bird:         { icon: 'sunny',              colors: ['#F59E0B', '#EA580C'] },
  night_owl:          { icon: 'moon',               colors: ['#6366F1', '#312E81'] },
  weekend_grinder:    { icon: 'calendar',           colors: ['#F97316', '#C2410C'] },
  lunch_break_lifter: { icon: 'time',               colors: ['#EAB308', '#A16207'] },
  iron_addict:        { icon: 'barbell',            colors: ['#EF4444', '#991B1B'] },
  cardio_queen:       { icon: 'heart',              colors: ['#EC4899', '#BE185D'] },
  rest_master:        { icon: 'leaf',               colors: ['#A78BFA', '#7C3AED'] },
  first_workout:      { icon: 'rocket',             colors: ['#22C55E', '#15803D'] },
  century_club:       { icon: 'star',               colors: ['#3B82F6', '#1E40AF'] },
  year_one:           { icon: 'ribbon',             colors: ['#F59E0B', '#B45309'] },
}

const FALLBACK: BadgeDef = { icon: 'trophy', colors: ['#6B7280', '#4B5563'] }

type Props = {
  achievementKey: string
  size?: number
  locked?: boolean
}

export function AchievementBadge({ achievementKey, size = 48, locked = false }: Props) {
  const badge = BADGE_MAP[achievementKey] ?? FALLBACK
  const iconSize = Math.round(size * 0.48)

  return (
    <View style={[styles.outer, { width: size, height: size, borderRadius: size / 2, opacity: locked ? 0.4 : 1 }]}>
      <LinearGradient
        colors={locked ? ['#374151', '#1F2937'] : badge.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Ionicons name={badge.icon} size={iconSize} color="#fff" />
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    overflow: 'hidden',
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
