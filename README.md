# Plateful

Snap a photo of your plate and get a rough calorie and macro estimate. One Expo app runs on iPhone and Android. A small server calls a vision model. The model key stays on the server.

The default model is **Google Gemini 3.8 Flash**, on the free Google AI Studio tier. No credit card. OpenAI and Anthropic still work if you set them later.

Demo mode needs no key. It walks through photo → results → daily log with two real meals.

## Do this once, in order (Windows, free, no credit card)

You and a friend each get an account. Meals, history, goals, streaks, and badges belong to that account and come back after a reinstall. Do these steps from a Windows PC and a browser. You do not need Android Studio, a Mac, or a credit card.

If you already installed an older Plateful APK, do the steps again from the build onward. The old file does not know about accounts.

**Why Supabase.** One free project covers email sign-up, password reset, the database, and private photo storage. The free plan does not ask for a card. Paid plans do, so stay on Free. A free project pauses after a week with no traffic. Open the project in the Supabase dashboard and restore it. That does not charge you. The database holds 500 MB, file storage holds 1 GB, and about 50,000 people a month can sign in. That is plenty for two people.

**Why photos go in the account.** A 1280px JPEG from this app is a few hundred kilobytes. The free 1 GB bucket holds thousands of them. The bucket is private: each person can only open photos in their own folder. Keeping photos only on the phone would lose them on a reinstall, which defeats the account.

### 1. Merge the pull request

1. Open [pull request #2](https://github.com/thedailyweirdfacts-debug/fitness-test/pull/2).
2. Click **Merge pull request**, then **Confirm merge**.
3. The `main` branch now has this code. The later steps use `main`.

### 2. Get a free Gemini key

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and sign in with a normal Google account.
2. Create an API key. Stay on the **free** tier. Do not add a billing account or a card.
3. Copy the key. You will paste it into Vercel in step 5. Do not put it in the app, and do not send it to your friend.

On the free tier, Google may use prompts (including photos) to improve its products. That is the trade for the free quota. The free Flash model is about **20 photos a day for the whole Google project**, shared by both of you. The app gives each signed-in person **10 scans a day** so two people fit. The count is on the Scan screen. It resets at midnight Pacific time. Demo mode does not use a scan.

### 3. Create the free Supabase project and run the SQL

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) and sign up with GitHub. Create a new project. Pick the **Free** plan. Do not add a card. Wait until the project finishes starting.
2. Open **SQL Editor → New query**. On your PC, open the file `supabase/migrations/001_accounts.sql` from this repo (after the merge). Select all of it, copy it, paste it into the query box, and press **Run**. You should see success. That creates the tables, the private `meal-photos` bucket, and the rule that each person can only read and write their own rows.
3. Open **Project Settings → API**. Copy three values and keep them somewhere safe:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **Publishable key** or **anon** key (the dashboard may say `sb_publishable_...` or a long `eyJ...` key). This one is allowed in the app.
   - **Secret key** or **service_role** key. This one stays on Vercel only. Never put it in Expo, the app, or a message to your friend.
4. Open **Authentication → Sign In / Providers → Email**. Turn **Confirm email** off, so you and your friend can sign up and use the app immediately. Leave email sign-in itself on. The free mailer is enough for the occasional password reset.
5. Open **Authentication → URL Configuration**. Under **Redirect URLs**, add `plateful://reset-password` and save. That lets the reset email open the app.

### 4. Make up an app secret, if you want an extra lock

This is optional. Sign-in already stops a stranger from using your Gemini key. A shared password is a second lock. It is not the Gemini key. In PowerShell:

```powershell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Write it down. If you skip this, leave `APP_SECRET` unset everywhere. If you set it, the same value goes in Vercel (`APP_SECRET`) and Expo (`EXPO_PUBLIC_APP_SECRET`). Anyone who unpacks the APK can read that password. They still cannot read the Gemini key or the Supabase secret key, and they still cannot see your meals.

### 5. Put the server on Vercel (free HTTPS)

[Vercel Hobby](https://vercel.com/pricing) is $0, no credit card, and HTTPS is included. It is for personal projects. If you go past the free monthly allowance, the project pauses until the next month. You are not charged.

1. Open [vercel.com/signup](https://vercel.com/signup) and choose **Continue with GitHub**. Pick the free Hobby plan if it asks. Do not add a payment method.
2. **Add New… → Project** and import `thedailyweirdfacts-debug/fitness-test`. Leave the settings as they are. Do not change the root directory. Deploy. If you imported before the merge, open **Deployments** and redeploy from `main` after step 1.
3. Open the project → **Settings → Environment Variables**. Add these for **Production** (and Preview, if you see it):

   | Name | Value |
   | --- | --- |
   | `VISION_PROVIDER` | `gemini` |
   | `VISION_API_KEY` | the Google AI Studio key from step 2 |
   | `SUPABASE_URL` | the Project URL from step 3 |
   | `SUPABASE_ANON_KEY` | the publishable or anon key from step 3 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the secret or service_role key from step 3 |
   | `APP_SECRET` | only if you made one in step 4. Otherwise skip this row |
   | `SCAN_DAILY_CAP` | `10` (optional; 10 is already the default) |

4. **Deployments → Redeploy** the latest deployment so those variables are used.
5. Copy the site address. It looks like `https://something.vercel.app`. Open `https://something.vercel.app/api/health` in a browser. You should see `"provider":"gemini"`, `"model":"gemini-3.8-flash"`, `"configured":true`, and `"accounts":true`. The page must not show the Gemini key, the app secret, or either Supabase key.

### 6. Put the app settings on Expo

1. Install [Node.js 22 LTS](https://nodejs.org/) with the Windows installer. Leave "Add to PATH" checked. Close and reopen any terminal after it finishes.
2. Create a free account at [expo.dev/signup](https://expo.dev/signup). No credit card. The free plan includes a limited number of cloud builds each month. If you use them up, wait until the next month.
3. On the PC, open **Command Prompt** in the project folder. If you do not have the code yet:

   ```bat
   git clone https://github.com/thedailyweirdfacts-debug/fitness-test.git
   cd fitness-test
   git pull
   cd mobile
   npx eas-cli@latest login
   ```

   Sign in with the Expo account. If the folder is already on the PC, `cd` into `fitness-test\mobile` and run the login line.

4. Set **Environment variables** for the **preview** environment. Do this before the build. From `fitness-test\mobile`:

   ```bat
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://something.vercel.app --visibility plaintext
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT.supabase.co --visibility plaintext
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_PUBLISHABLE_OR_ANON_KEY --visibility sensitive
   ```

   Replace the example values with yours. No slash at the end of the Vercel or Supabase URL.

   Only if you set `APP_SECRET` in step 4, also run:

   ```bat
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_APP_SECRET --value YOUR_SECRET --visibility sensitive
   ```

   Do **not** add `VISION_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or any other secret here. Names that start with `EXPO_PUBLIC_` are stored inside the APK. The publishable Supabase key is meant to be there. The database rules still hide everyone else's meals.

### 7. Build the APK

From `fitness-test\mobile`:

```bat
npx eas-cli@latest build -p android --profile preview
```

The first time, say yes when it asks to create the project and the Android keystore. You do not make those yourself. The profile in `mobile/eas.json` builds an APK named Plateful, package `com.plateful.app`.

### 8. Install it and sign up

1. When the build page says it finished, open that link **on your Android phone** (Chrome). Download the APK.
2. Android will block an unknown app the first time. Tap the warning, or go to **Settings → Apps → Special app access → Install unknown apps**, and allow Chrome. Then open the download and tap **Install**.
3. Open **Plateful**. Demo mode is off, because the server address was baked in. Tap **Sign in to scan a plate**.
4. Choose **Create an account**, enter your email and a password of at least 6 characters, and sign up. Meals already saved on this phone in demo mode are copied into the new account the first time you sign in, as long as the account is empty.
5. Take a photo. The Scan screen shows how many free scans you have left today.

The gear screen can still turn demo mode on. Demo mode does not need an account, and those meals stay on the phone.

### 9. Give the same app to your friend

1. Send your friend the **same build link** from step 8 (the Expo page that downloads the APK). They install it the same way: Chrome, allow unknown apps, Install.
2. They open Plateful and create **their own** account with their own email. They never need your password, the Gemini key, or the Supabase secret key.
3. Their meals, history, goals, streaks, and badges are separate from yours. Each of you gets 10 scans a day. A scan on your phone does not use one of theirs.

Forgot a password: on the sign-in screen tap **Forgot password**, then open the email **on the phone that has Plateful** and choose a new password.

## Free-tier limits

These are the limits that matter. They change, and going over them pauses the feature. It does not charge you, as long as you never add a card.

**Gemini 3.8 Flash (free, checked November 2026).** About **5 requests a minute** and **20 requests a day** per Google project, plus a token cap. The day resets at midnight Pacific time. A second API key in the same project does not add more. Google's own page says the exact numbers can vary: look at the rate limits inside [Google AI Studio](https://aistudio.google.com/). If 20 photos a day is too few, set `VISION_MODEL` to `gemini-3.5-flash-lite` (about 500 a day on the free tier) and raise `RATE_LIMIT_PER_DAY` to match. Do not turn on billing.

**This server.** Each signed-in person gets **10 scans a day** (`SCAN_DAILY_CAP`), counted in Supabase so it holds on Vercel. A failed estimate is refunded. There is also a burst brake of 5 scans a minute per address (`RATE_LIMIT_PER_MINUTE`). Photos are kept under Vercel's **4.5 MB** request limit. The app already shrinks each photo to a 1280px JPEG before sending it.

**Supabase Free.** No card. Two active projects, 500 MB of database, 1 GB of file storage, 50 MB per file, and about 50,000 monthly active sign-ins. A project with no traffic for a week pauses. Restore it from the dashboard for free. There are no daily backups on the free plan.

**Vercel Hobby.** Personal, non-commercial use. Included monthly function time and 1 million invocations. Past that, the project pauses until the month resets. One function can run up to 300 seconds. These scans are limited to 60. No card required, and Hobby cannot be billed.

**Expo.** The free plan's cloud builds are capped per month. Building the APK does not need a card.

## Try it in Expo Go

Use this while you are still experimenting. The installed APK above is what you want for everyday use.

1. Install [Node.js 22](https://nodejs.org/) or newer.
2. Install **Expo Go** from the App Store or Google Play.
3. In this folder:

   ```bash
   npm install
   npm install --prefix mobile
   npm install --prefix server
   npm start
   ```

4. Put your phone and computer on the same Wi-Fi.
5. Scan the QR code. On iPhone, use the Camera app. On Android, use the Scan button inside Expo Go.
6. If the phone cannot reach the computer, stop and start a tunnel instead:

   ```bash
   npm --prefix mobile exec -- expo start --tunnel
   ```

7. Take a photo, choose one from the gallery, or tap **Sausage & green beans** or **Fries & ketchup**.
8. Demo mode is on until a server address is set, so those numbers are saved examples. Change a portion with +/− or by typing grams. The totals update. Remove a food or add one the estimate missed, then tap **Save to today**.
9. Open the **Log** tab. Each day has a running total. Tap a meal to edit it. Without an account, the log stays on the phone. Sign in from the gear screen when Supabase is configured and the same log is copied into that empty account.

You can also open the same app in a desktop browser with `npm run web`.

## Run the server on your computer

1. Copy the example env file:

   ```bash
   cp server/.env.example server/.env
   ```

   Set `VISION_API_KEY` to the Gemini key. Also set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the Supabase API settings. `APP_SECRET` is optional. `VISION_PROVIDER` defaults to `gemini`.

   To use another company instead, set `VISION_PROVIDER` to `openai` or `anthropic` and supply that company's key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` also work). Optional `VISION_MODEL` overrides the default (`gemini-3.8-flash`, `gpt-5.4-mini`, or `claude-haiku-5-5`).

2. Start it:

   ```bash
   npm run server
   ```

   It listens on port 8787. `http://localhost:8787/api/health` shows the provider and model. It does not print the key or the secret.

3. In the app's gear screen, set the server address to `http://YOUR-WIFI-ADDRESS:8787`, turn demo mode off, and save. For a real scan, also set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `mobile/.env` and sign in. Set the app secret only if the server has `APP_SECRET`.

The phone sends the signed-in person's access token. The server checks that token with Supabase, then counts one scan for that person. If `APP_SECRET` is set, the phone also sends it in the `x-plateful-secret` header and a wrong value is rejected. A server without the Supabase URL and keys refuses to estimate anything, so a public URL cannot spend the Gemini key by accident.

Do not put the Gemini key or the Supabase secret key in `mobile/.env` or in any `EXPO_PUBLIC_` variable. Those get bundled into the app. `EXPO_PUBLIC_SUPABASE_ANON_KEY` is the publishable key only. `EXPO_PUBLIC_APP_SECRET` is the optional shared password.

## What the estimate includes

Each food has a name, grams, a friendly portion such as `1 cup` or `5 oz`, plus calories, protein, carbs, and fat. The response also has totals, a confidence of low / medium / high, a short note, and a list of things that were left out.

The model is told to:

- count only the main plate in front of the camera
- ignore other people's plates and food that is clearly in the background
- skip crumbs and other scraps
- use a fork, spoon, hand, or plate when one is visible, to judge size

The server drops anything under about a gram, so a stray crumb cannot become its own line.

Demo mode uses two meals, with the owner's ballpark totals:

| Meal | What's counted | Left out | About |
| --- | --- | --- | --- |
| Sausage & green beans | one smoked sausage link (~5 oz), 1 cup green beans, a dab of mustard | someone else's burger plate | 500 kcal, 20g protein, 12g carbs, 40g fat |
| Fries & ketchup | ~100 g fries, 1½ tbsp ketchup | another plate, a few scraps | 340 kcal, 4g protein, 45g carbs, 15g fat |

These are guesses from a photo, not a lab test and not diet advice.

## Meal types, history, and a daily goal

When you save a plate you pick Breakfast, Lunch, Dinner, or Snack. The app suggests one from the time of day, and you can change it. The log groups that day's meals by type.

History is a calendar of past days. Tap a day for its total, then a meal for the photo, foods, and macros. You can change the type or delete the meal. Older meals that were saved before this update get a type from the time they were logged.

A daily calorie goal is off until you set one in Settings. You can add an optional protein goal and a window (5, 10, 15, or 20 percent, 10 by default). A day counts when calories land inside that window. Going well over does not extend a streak. The app keeps your current streak, your best streak, and a few badges, and shows a small celebration when you earn one. Signed in, those meals, goals, streaks, and badges belong to the account and show up again after a reinstall. Demo mode, with no account, keeps them on the phone.

## Layout

- `mobile/` — the Expo app (TypeScript, Expo Router) and `eas.json`
- `server/` — local `GET /api/health`, `GET /api/quota`, and `POST /api/analyze`
- `api/` — the same routes, for Vercel
- `shared/` — the JSON schema, portion math, goals, and the two sample meals
- `supabase/migrations/001_accounts.sql` — paste this into the Supabase SQL Editor once

```bash
npm test
npm run typecheck
```

Without an account, meals and settings stay on the device with AsyncStorage, and photos stay in the app's documents folder. Signed in, meals, goals, and seen badges are stored in your Supabase project, and meal photos are stored in the private `meal-photos` bucket under that person's folder. The phone still keeps a local copy of a photo so it can show it right away.

## Shipping to the App Store and Google Play

The Android APK above is for your own phone. A public store listing is a later step.

1. Join the Apple Developer Program ($99 a year) and Google Play Console ($25 once). Those are the only paid accounts in this path, and only if you decide to publish.
2. From `mobile/`, `npx eas-cli@latest build` with a production profile makes an iOS build and an Android app bundle. Apple builds need a Mac or EAS's cloud builders.
3. The server is already HTTPS. Keep the Supabase keys set. `APP_SECRET` stays optional.
4. Write a short privacy policy. When demo mode is off, a photo is sent to your server and then to Google (or OpenAI or Anthropic, if you switched). On Gemini's free tier, Google may use that content to improve its products. A signed-in log and its photos live in your Supabase project. Say clearly that the numbers are estimates.
5. Fill in App Store privacy labels and the Play Data safety form. The app asks for the camera and the photo library. The permission text is already in `mobile/app.json`.
6. Prepare screenshots, a support URL, and the icon in `mobile/assets`. Then submit for review.

Do not describe it as a medical or nutrition-coaching app. It is a personal estimate of what is on the plate.
