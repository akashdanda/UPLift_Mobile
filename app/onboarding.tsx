import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BrandViolet } from '@/constants/theme'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const PHONE_W = SCREEN_W * 0.62
const PHONE_H = PHONE_W * 2.16

// Actual app screenshots
const screenshotFeed = require('../assets/images/onboarding-feed.png')
const screenshotLeaderboard = require('../assets/images/onboarding-leaderboard.png')
const screenshotProfile = require('../assets/images/onboarding-profile.png')
const screenshotGroups = require('../assets/images/onboarding-groups.png')

type Slide = {
  id: string
  screenshot: any
}

const SLIDES: Slide[] = [
  { id: '1', screenshot: screenshotFeed },
  { id: '2', screenshot: screenshotLeaderboard },
  { id: '3', screenshot: screenshotProfile },
  { id: '4', screenshot: screenshotGroups },
]

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets()
  const [activeIndex, setActiveIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index)
      }
    }
  ).current

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      {/* Phone mockup with real screenshot */}
      <View style={[styles.phoneContainer, { top: insets.top + 70 }]}>
        <View style={styles.phoneMockup}>
          <View style={styles.phoneInner}>
            <Image
              source={item.screenshot}
              style={styles.screenshot}
              contentFit="contain"
            />
          </View>
        </View>
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      {/* Logo - Strava-style wordmark */}
      <View style={[styles.logoContainer, { top: insets.top + 16 }]}>
        <Text style={styles.logoText}>UPLIFT</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        bounces={false}
      />

      {/* Bottom section */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Join button */}
        <Pressable
          style={({ pressed }) => [
            styles.joinBtn,
            { opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => router.push('/sign-up')}
        >
          <Text style={styles.joinBtnText}>Get started</Text>
        </Pressable>

        {/* Log in link */}
        <Pressable
          style={({ pressed }) => [
            styles.loginBtn,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.loginBtnText}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08060D',
  },
  slide: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  logoContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 6,
  },
  phoneContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  phoneMockup: {
    width: PHONE_W,
    height: PHONE_H,
    borderRadius: 44,
    backgroundColor: '#1a1a1a',
    padding: 4,
  },
  phoneInner: {
    flex: 1,
    borderRadius: 40,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  screenshot: {
    flex: 1,
    width: '100%',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 28,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  joinBtn: {
    backgroundColor: BrandViolet.primary,
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  loginBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  loginBtnText: {
    color: BrandViolet.primaryOnDark,
    fontSize: 14,
    fontWeight: '500',
  },
})
