/**
 * Typical gym crowdedness — pattern-based (not live headcount).
 * Base curve follows local day/time; OSM tags shift the tier and add venue-specific copy
 * so different places read differently at the same time of day.
 */

export type TypicalBusynessLevel = 'quiet' | 'light' | 'moderate' | 'busy'

export type TypicalBusyness = {
  level: TypicalBusynessLevel
  label: string
  detail: string
}

/** Second line shown under the meter (honest about the model). */
export const TYPICAL_BUSYNESS_FOOTNOTE =
  'Estimated from usual gym traffic for this day and time — not a live count.'

const LEVEL_ORDER: TypicalBusynessLevel[] = ['quiet', 'light', 'moderate', 'busy']

function levelIndex(l: TypicalBusynessLevel): number {
  return LEVEL_ORDER.indexOf(l)
}

function clampLevel(i: number): TypicalBusynessLevel {
  return LEVEL_ORDER[Math.max(0, Math.min(3, i))]!
}

/** Stable 0–1 from string (for picking variant copy). */
function hash01(s: string): number {
  let h = 0
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0
  return Math.abs(h % 997) / 997
}

function haystack(tags: Record<string, string>): string {
  return [
    tags.name,
    tags.brand,
    tags.operator,
    tags['official_name'],
    tags['addr:full'],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Integer shift in tier steps (rough heuristics from OSM).
 * Negative = tends quieter than a generic public gym; positive = tends busier.
 */
export function tagTierShift(tags?: Record<string, string>): number {
  if (!tags || typeof tags !== 'object') return 0
  let s = 0
  const h = haystack(tags)
  const building = (tags.building || '').toLowerCase()
  const access = (tags.access || '').toLowerCase()
  const leisure = (tags.leisure || '').toLowerCase()
  const amenity = (tags.amenity || '').toLowerCase()
  const sport = (tags.sport || '').toLowerCase()
  const indoor = (tags.indoor || '').toLowerCase()

  if (building === 'apartments' || building === 'residential' || tags['building:use'] === 'apartments') {
    s -= 1
  }
  if (h.includes('apartment') && (access === 'private' || access === 'customers' || access === 'permissive')) {
    s -= 1
  }
  if (h.includes('hotel') || h.includes('motel') || h.includes('residence inn') || h.includes('marriott')) {
    s -= 1
  }
  if (leisure === 'fitness_station') s -= 1
  if (amenity === 'gym' && indoor === 'yes' && h.includes('office')) s -= 1

  if (
    h.includes('university') ||
    h.includes('college') ||
    h.includes('campus') ||
    h.includes('student') ||
    /\bu\s+of\s+/.test(h)
  ) {
    s += 1
  }
  if (h.includes('recreation center') || h.includes('recreation centre') || h.includes('rec center')) {
    s += 1
  }
  if (leisure === 'sports_centre') s += 1
  if (sport.includes('climb') || h.includes('boulder') || h.includes('climbing')) s += 1
  if (h.includes('ymca') || h.includes('y.m.c.a')) s += 1
  if (h.includes('crossfit')) s += 1
  if (h.includes('planet fitness') || h.includes('la fitness') || h.includes('lifetime')) s += 1

  return Math.max(-2, Math.min(2, s))
}

/** Short clause grounded in venue type (appended when tier was tag-adjusted). */
function venueTail(tags?: Record<string, string>): string {
  if (!tags) return ''
  const h = haystack(tags)
  const leisure = (tags.leisure || '').toLowerCase()
  const sport = (tags.sport || '').toLowerCase()
  if (h.includes('university') || h.includes('campus') || h.includes('college') || h.includes('student')) {
    return 'Campus facilities often spike around class breaks and evenings.'
  }
  if (h.includes('recreation center') || h.includes('recreation centre') || h.includes('arc ')) {
    return 'Big rec centers usually see waves when programs and classes start.'
  }
  if (sport.includes('climb') || h.includes('boulder')) {
    return 'Climbing gyms often bunch up on weeknight evenings and weekend mornings.'
  }
  if (leisure === 'sports_centre') {
    return 'Multi-sport centers can jump when youth leagues and courts are in use.'
  }
  if (h.includes('hotel')) {
    return 'Hotel gyms are usually quieter than neighborhood clubs.'
  }
  if (tags.building === 'apartments' || tags['building:use'] === 'apartments' || h.includes('apartment')) {
    return 'Residents-only gyms tend to stay calmer than public memberships.'
  }
  if (h.includes('crossfit')) {
    return 'Small class-based boxes often feel full during scheduled WOD blocks.'
  }
  if (h.includes('planet fitness') || h.includes('la fitness') || h.includes('lifetime')) {
    return 'High-volume chains often track predictable rush windows.'
  }
  return 'Traffic here can differ from a generic gym at the same hour.'
}

/** When tags shift the tier, use level-specific headline + detail variants (still time-aware in second sentence). */
function adjustedCopy(
  level: TypicalBusynessLevel,
  now: Date,
  tags: Record<string, string> | undefined,
): Pick<TypicalBusyness, 'label' | 'detail'> {
  const seed = hash01(`${haystack(tags || {})}-${level}-${now.getDay()}`)
  const tail = venueTail(tags)

  const variants: Record<
    TypicalBusynessLevel,
    { labels: string[]; details: string[] }
  > = {
    quiet: {
      labels: ['Usually quieter here', 'Typically calm', 'Often on the quiet side'],
      details: [
        'Foot traffic at this kind of spot is usually below a busy public gym right now.',
        'You would often find fewer people here than at a peak-hour chain gym.',
        'This window is usually mellow for venues like this one.',
      ],
    },
    light: {
      labels: ['Usually light traffic', 'Often not too crowded', 'Typically manageable'],
      details: [
        'Busy enough to feel alive, but usually not packed wall-to-wall.',
        'Most days you would see a steady trickle rather than a crush.',
        'Expect a moderate flow — usually easy to grab equipment.',
      ],
    },
    moderate: {
      labels: ['Usually moderate', 'Often fairly busy', 'Typically steady'],
      details: [
        'Popular times can feel busy, but it is usually still workable.',
        'You would often share the floor with a solid crowd right now.',
        'Traffic is usually in the middle of the range for places like this.',
      ],
    },
    busy: {
      labels: ['Usually busy', 'Often peaky', 'Typically crowded'],
      details: [
        'This hour often lines up with rush traffic at spots like this.',
        'You would usually expect a full floor and short waits for gear.',
        'Peak-style volume is common here during this part of the day.',
      ],
    },
  }

  const v = variants[level]
  const li = Math.floor(seed * v.labels.length) % v.labels.length
  const di = Math.floor(seed * v.details.length) % v.details.length
  const detail = tail ? `${v.details[di]!} ${tail}` : v.details[di]!
  return { label: v.labels[li]!, detail }
}

/** Baseline curve: same for all venues (time-only). */
function typicalBusynessFromTimeOnly(now: Date): TypicalBusyness {
  const dow = now.getDay()
  const h = now.getHours()

  if (h >= 23 || h < 5) {
    return {
      level: 'quiet',
      label: 'Usually quieter',
      detail: 'Late night and very early morning are typically slow at most gyms.',
    }
  }

  if (dow >= 1 && dow <= 5) {
    if (h >= 6 && h < 9) {
      return {
        level: 'moderate',
        label: 'Usually fairly busy',
        detail: 'Weekday mornings before work are a common rush.',
      }
    }
    if (h >= 9 && h < 11) {
      return {
        level: 'light',
        label: 'Usually not too busy',
        detail: 'Mid-morning weekdays are often calmer.',
      }
    }
    if (h >= 11 && h < 14) {
      return {
        level: 'moderate',
        label: 'Usually moderate',
        detail: 'Lunch blocks often see a steady flow.',
      }
    }
    if (h >= 14 && h < 17) {
      return {
        level: 'light',
        label: 'Usually lighter',
        detail: 'Mid-afternoon is often a lull before the evening rush.',
      }
    }
    if (h >= 17 && h < 21) {
      return {
        level: 'busy',
        label: 'Usually as busy as it gets',
        detail: 'Weekday evenings are peak time at many fitness centers.',
      }
    }
    return {
      level: 'quiet',
      label: 'Usually quieter',
      detail: 'After 9pm weekdays, traffic usually drops off.',
    }
  }

  if (dow === 6) {
    if (h >= 8 && h < 13) {
      return {
        level: 'busy',
        label: 'Usually busy',
        detail: 'Saturday mornings are often among the busiest windows.',
      }
    }
    if (h >= 13 && h < 17) {
      return {
        level: 'moderate',
        label: 'Usually moderate',
        detail: 'Saturday afternoons are typically steady but not peak.',
      }
    }
    if (h >= 17 && h < 21) {
      return {
        level: 'light',
        label: 'Usually lighter',
        detail: 'Saturday evenings are often calmer than morning.',
      }
    }
    return {
      level: 'quiet',
      label: 'Usually quieter',
      detail: 'Early or late Saturday tends to be quieter.',
    }
  }

  if (h >= 8 && h < 14) {
    return {
      level: 'moderate',
      label: 'Usually moderate',
      detail: 'Sunday late morning through early afternoon is often steady.',
    }
  }
  if (h >= 14 && h < 19) {
    return {
      level: 'light',
      label: 'Usually lighter',
      detail: 'Sunday afternoons and early evenings are often calmer.',
    }
  }
  return {
    level: 'quiet',
    label: 'Usually quieter',
    detail: 'Sunday early or late hours are typically quiet.',
  }
}

/**
 * When tags don’t imply a quieter/busier venue, use a stable hash of `venueKey`
 * so two different pins at the same hour don’t always show the exact same tier
 * (still illustrative — not live data).
 */
function venueMicroShift(venueKey: string): number {
  const x = hash01(`${venueKey}|uplift-busy-v1`)
  if (x < 0.18) return -1
  if (x > 0.82) return 1
  return 0
}

/**
 * @param now - Device local time (drives the baseline “curve”).
 * @param tags - OSM tags from the pin; shifts tier and tailors copy per venue type.
 * @param venueKey - Stable id e.g. `node-123`; used for micro-variance when tag shift is 0.
 */
export function typicalGymBusyness(
  now: Date = new Date(),
  tags?: Record<string, string>,
  venueKey?: string,
): TypicalBusyness {
  const base = typicalBusynessFromTimeOnly(now)
  let shift = tagTierShift(tags)
  if (shift === 0 && venueKey) {
    shift += venueMicroShift(venueKey)
  }
  shift = Math.max(-2, Math.min(2, shift))

  if (shift === 0) {
    return base
  }

  const nextIdx = levelIndex(base.level) + shift
  const finalLevel = clampLevel(nextIdx)
  if (finalLevel === base.level) {
    return base
  }

  const { label, detail } = adjustedCopy(finalLevel, now, tags)
  return { level: finalLevel, label, detail }
}
