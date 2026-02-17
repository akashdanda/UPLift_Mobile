# Notification System Plan

Plan for daily post reminders, social nudge (“friends already logged”), and urgency (“X hours left to post”) in UPLIft.

---

## 1. Notification types & example copy

| Type | Example copy | When to show |
|------|----------------|--------------|
| **Daily reminder** | “Post daily — log a workout to keep your streak.” | Once per day, e.g. morning or midday, if user hasn’t posted today. |
| **Friends nudge** | “3 of your friends already logged their workouts today — don’t fall behind.” | After at least 1 friend has posted today, user hasn’t. Can be sent once per day or throttled. |
| **Urgency / deadline** | “3 hours left to post today.” | Late in the day (e.g. after 6 PM or 9 PM in user’s timezone), user hasn’t posted; optional streak mention. |

All of these should **only** be sent if the user has **not** logged a workout **today** (in the relevant timezone).

---

## 2. What you already have

- **Profiles**: `notifications_enabled` (use this to gate all notifications).
- **Friends**: `getFriends(userId)` → list of friends; friendships table.
- **Workouts**: `workouts` with `user_id`, `workout_date` (date only), `created_at`.
- **Streak**: `get_current_streak(user_id, reference_date)`; Home already shows “streak at risk” after 6 PM if no workout today.
- **No push yet**: no expo-notifications, no stored push tokens, no backend sender.

---

## 3. Data you need

### For “has user posted today?”

- Query: `workouts` where `user_id = ?` and `workout_date = today`.
- “Today” must be consistent: either **user’s local date** (requires timezone) or **UTC date** (simpler, less accurate for late-night users).

### For “how many friends posted today?”

- Get friend IDs (from `friendships` + `requester_id` / `addressee_id`).
- Query: `workouts` where `user_id IN (friendIds)` and `workout_date = today` → count distinct `user_id` (and optionally names for copy).

### For “X hours left to post”

- Define “end of day” (e.g. midnight local, or a fixed hour like 23:59).
- Either:
  - **Option A**: Store **timezone** (e.g. `profiles.timezone` like `America/New_York`) and compute “hours left” in backend.
  - **Option B**: Fixed cutoff in one timezone (e.g. UTC) and show “X hours left” in that window (simpler, less personal).

Recommendation: start with **UTC “today”** and a **fixed end-of-day** (e.g. 4 AM UTC next day) so you don’t need timezone in v1; add timezone later for “3 hours left” and “today” accuracy.

---

## 4. Delivery: in-app vs push

### In-app only (easiest)

- **Where**: Home (or a small “Notifications” strip on Home).
- **When**: On app open / when Home is focused, run the same logic (has user posted today? friends count? hours left?) and show a **banner or card** with the same copy as above.
- **Pros**: No push setup, no tokens, no backend job; reuses existing `notifications_enabled`.
- **Cons**: Only works when the app is open.

### Push notifications (full experience)

- **App**:  
  - Add `expo-notifications` (and optionally `expo-device`).  
  - Request permission; get Expo Push Token; store it in your backend (e.g. `profiles.expo_push_token` or a `push_tokens` table).
- **Backend**:  
  - A **scheduled job** (cron) runs at chosen times (e.g. 9 AM, 6 PM, 9 PM in a reference timezone).  
  - For each user with `notifications_enabled` and no workout today:  
    - Decide which message to send (daily reminder vs friends nudge vs “X hours left”).  
    - Send via [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/) (using the stored token).
- **Copy**: Same as the table in §1; body can be short, e.g. “3 of your friends already logged today — don’t fall behind.”

You can do **Phase 1: in-app only**, then **Phase 2: add push** using the same copy and logic.

---

## 5. Backend job (for push)

You need something that runs on a schedule and:

1. Selects users who:
   - have `notifications_enabled = true`,
   - have not logged a workout for “today” (by your date rule),
   - optionally have at least one friend (for friend-based copy).
2. For each user, optionally:
   - Count friends who posted today.
   - Compute “hours left” if you use a cutoff.
3. Picks one message per user (e.g. prefer “X hours left” late in day, else “N friends posted”, else “Post daily”).
4. Sends one push per user (Expo Push API) and optionally records that you sent “daily reminder” today so you don’t double-send.

Options:

- **Supabase Edge Functions + cron**: e.g. [Supabase cron trigger](https://supabase.com/docs/guides/functions/schedule-functions) or external cron (e.g. Vercel Cron, GitHub Actions) that calls an Edge Function which does the query + Expo Push.
- **Database + external cron**: A small API route (Next.js, etc.) that your cron hits; it reads from Supabase (users, workouts, friends) and sends pushes.

---

## 6. Suggested implementation order

1. **Define “today” and “end of day”** — **Done.** Uses local “today” and “hours left” until midnight local.

2. **Add a small “notification” helper** — **Done.** `lib/daily-reminder.ts`: `getDailyReminderInfo(userId)` and `getReminderMessage(info)`.

   - Home shows a tappable banner (when notifications on and no post today): urgency “X hours left”, or “N of your friends have already logged…”, or “Post daily…”. Tap → Log workout.

4. **Optional: store push tokens**  
   - Add `expo_push_token` (or table `push_tokens(user_id, token, platform)`) and save token when the user grants permission.

5. **Cron + push**  
   - Implement the scheduled job that:
     - Uses the same “today” and “friends posted today” logic,
     - Respects `notifications_enabled` and “already posted today”,
     - Sends at most one notification per user per day,
     - Uses Expo Push API with the stored token(s).

6. **Later**  
   - Add `profiles.timezone` and use it for “today” and “X hours left” for a better experience.

---

## 7. Copy summary (for product/UX)

- **Daily**: “Post daily — log a workout to keep your streak.”
- **Friends**: “{N} of your friends already logged their workouts today — don’t fall behind.”
- **Urgency**: “{N} hours left to post today.” (e.g. N = 3 or 1)

All of these assume the user has **not** posted today and has **notifications_enabled**. You can add streak to the urgency line later (e.g. “3 hours left to keep your streak.”).

---

## 8. DB / schema changes (minimal for v1)

- **In-app only**: no new tables; only queries (workouts by date, friends’ workouts by date).
- **Push**:  
  - Store push token: e.g. `profiles.expo_push_token TEXT` or a `user_push_tokens` table (user_id, token, device_id, updated_at).  
  - Optional: `notification_log (user_id, type, sent_at)` to avoid duplicate “daily” sends.

If you want, next step can be a concrete **API shape** for `getDailyReminderInfo` and the **in-app banner component** on Home, or the **migration + Edge Function** for push tokens and cron.
