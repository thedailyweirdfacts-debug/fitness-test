# Plateful

Snap a photo of your plate and get a rough calorie and macro estimate. One Expo app runs on iPhone and Android. A small server calls a vision model. The model key stays on the server.

The default model is **Google Gemini 3.8 Flash**, on the free Google AI Studio tier. No credit card. OpenAI and Anthropic still work if you set them later.

Demo mode needs no key. It walks through photo → results → daily log with two real meals.

## Install it on an Android phone (free, no credit card)

This builds a real APK and a website address the phone can reach from anywhere. You do this from a Windows PC and a browser. You do not need Android Studio, a Mac, or a credit card.

You will create three free accounts, in this order, and one password you make up.

### 1. Get a free Gemini key

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and sign in with a normal Google account.
2. Create an API key. Stay on the **free** tier. Do not add a billing account or a card.
3. Copy the key. You will paste it into Vercel in step 3. Do not put it in the app.

On the free tier, Google may use prompts (including photos) to improve its products. That is the trade for the free quota.

### 2. Make up an app secret

This is a shared password between the app and your server. It is not the Gemini key. A long random string is enough. In PowerShell:

```powershell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Write it down. You will paste the same value in two places: Vercel (`APP_SECRET`) and Expo (`EXPO_PUBLIC_APP_SECRET`).

### 3. Put the server on Vercel (free HTTPS)

[Vercel Hobby](https://vercel.com/pricing) is $0, no credit card, and HTTPS is included. It is for personal projects. If you go past the free monthly allowance, the project pauses until the next month. You are not charged.

1. Open [vercel.com/signup](https://vercel.com/signup) and choose **Continue with GitHub**. Pick the free Hobby plan if it asks. Do not add a payment method.
2. **Add New… → Project**, import this GitHub repo, and leave the settings as they are. Do not change the root directory. Deploy.
3. Open the project → **Settings → Environment Variables** and add these for Production (and Preview, if you see it):

   | Name | Value |
   | --- | --- |
   | `VISION_PROVIDER` | `gemini` |
   | `VISION_API_KEY` | the Google AI Studio key |
   | `APP_SECRET` | the password from step 2 |

4. **Deployments → Redeploy** so the new variables are used.
5. Copy the site address. It looks like `https://something.vercel.app`. Open `https://something.vercel.app/api/health` in a browser. You should see `"provider":"gemini"`, `"model":"gemini-3.8-flash"`, `"configured":true`, and `"protected":true`. The page must not show the key or the secret.

### 4. Build the APK with Expo (free account)

1. Install [Node.js 22 LTS](https://nodejs.org/) with the Windows installer. Leave "Add to PATH" checked. Close and reopen any terminal after it finishes.
2. Create a free account at [expo.dev/signup](https://expo.dev/signup). No credit card. The free plan includes a limited number of cloud builds each month. If you use them up, wait until the next month.
3. On the PC, open **Command Prompt** (not PowerShell, if scripts are blocked) in the project folder:

   ```bat
   git clone https://github.com/thedailyweirdfacts-debug/fitness-test.git
   cd fitness-test\mobile
   npx eas-cli@latest login
   ```

   Sign in with the Expo account. If this folder is already on the PC, skip `git clone` and `cd` into `fitness-test\mobile`.

4. On [expo.dev](https://expo.dev), open the project after the next command creates it. Before the first build, or right after Expo creates the project, set **Environment variables** for the **preview** environment:

   | Name | Value |
   | --- | --- |
   | `EXPO_PUBLIC_API_URL` | `https://something.vercel.app` (no slash at the end) |
   | `EXPO_PUBLIC_APP_SECRET` | the same password as `APP_SECRET` |

   Do **not** add the Gemini key here. Anything starting with `EXPO_PUBLIC_` is stored inside the APK. A person who unpacks the file can read the secret and call your server. That is acceptable for an app only you use. They still cannot see the Gemini key. If the secret leaks, change `APP_SECRET` on Vercel, set the new value in Expo, and build again.

   The same two variables from the terminal:

   ```bat
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://something.vercel.app --visibility plaintext
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_APP_SECRET --value YOUR_SECRET --visibility sensitive
   ```

5. Build the APK:

   ```bat
   npx eas-cli@latest build -p android --profile preview
   ```

   The first time, say yes when it asks to create the project and the Android keystore. You do not make those yourself. The profile in `mobile/eas.json` builds an APK named Plateful, package `com.plateful.app`.

6. When the page says the build finished, open that link **on the Android phone** (Chrome). Download the APK.
7. Android will block an unknown app the first time. Tap the warning, or go to **Settings → Apps → Special app access → Install unknown apps**, and allow Chrome. Then open the download and tap **Install**.
8. Open **Plateful**. Demo mode is off, because the server address was baked in. Take a photo of a plate.

The gear screen can still turn demo mode on, or point at a different server and secret, without another build.

## Free-tier limits

These are the limits that matter. They change, and going over them pauses the feature. It does not charge you, as long as you never add a card.

**Gemini 3.8 Flash (free, checked November 2026).** About **5 requests a minute** and **20 requests a day** per Google project, plus a token cap. The day resets at midnight Pacific time. A second API key in the same project does not add more. Google's own page says the exact numbers can vary: look at the rate limits inside [Google AI Studio](https://aistudio.google.com/). If 20 photos a day is too few, set `VISION_MODEL` to `gemini-3.5-flash-lite` (about 500 a day on the free tier) and raise `RATE_LIMIT_PER_DAY` to match. Do not turn on billing.

**This server.** It also stops at 5 scans a minute and 20 a day from one address (`RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`). On Vercel that counter is per running instance, so it is a basic brake, not a perfect global lock. Gemini's quota is the real cap. Photos are kept under Vercel's **4.5 MB** request limit. The app already shrinks each photo to a 1280px JPEG before sending it.

**Vercel Hobby.** Personal, non-commercial use. Included monthly function time and 1 million invocations. Past that, the project pauses until the month resets. One function can run up to 300 seconds. These scans are limited to 60. No card required, and Hobby cannot be billed.

**Expo.** The free plan's cloud builds are capped per month. Building the APK does not need a card.

## What you have to do yourself

1. Create a free Gemini API key in Google AI Studio. Do not add billing.
2. Invent `APP_SECRET`.
3. Create a free Vercel Hobby account with GitHub, import this repo, set `VISION_PROVIDER`, `VISION_API_KEY`, and `APP_SECRET`, redeploy, and copy the `https://` address.
4. Create a free Expo account.
5. Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_APP_SECRET` on the Expo **preview** environment.
6. On Windows, from the `mobile` folder, run `npx eas-cli@latest login` and `npx eas-cli@latest build -p android --profile preview`.
7. Open the build link on the phone, allow Chrome to install unknown apps, and install Plateful.

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
9. Open the **Log** tab. Each day has a running total. Tap a meal to edit it. The log stays on the phone.

You can also open the same app in a desktop browser with `npm run web`.

## Run the server on your computer

1. Copy the example env file:

   ```bash
   cp server/.env.example server/.env
   ```

   Set `VISION_API_KEY` to the Gemini key and `APP_SECRET` to a password. `VISION_PROVIDER` defaults to `gemini`.

   To use another company instead, set `VISION_PROVIDER` to `openai` or `anthropic` and supply that company's key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` also work). Optional `VISION_MODEL` overrides the default (`gemini-3.8-flash`, `gpt-5.4-mini`, or `claude-haiku-5-5`).

2. Start it:

   ```bash
   npm run server
   ```

   It listens on port 8787. `http://localhost:8787/api/health` shows the provider and model. It does not print the key or the secret.

3. In the app's gear screen, set the server address to `http://YOUR-WIFI-ADDRESS:8787`, set the app secret, turn demo mode off, and save.

The phone sends the secret in the `x-plateful-secret` header. A request without the right secret is rejected, and a server with no `APP_SECRET` refuses to estimate anything, so a public URL cannot spend the Gemini key by accident.

Do not put the Gemini key in `mobile/.env` or in any `EXPO_PUBLIC_` variable. Those get bundled into the app. `EXPO_PUBLIC_APP_SECRET` is the shared password only.

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

A daily calorie goal is off until you set one in Settings. You can add an optional protein goal and a window (5, 10, 15, or 20 percent, 10 by default). A day counts when calories land inside that window. Going well over does not extend a streak. The app keeps your current streak, your best streak, and a few badges, and shows a small celebration when you earn one. All of this stays on the phone.

## Layout

- `mobile/` — the Expo app (TypeScript, Expo Router) and `eas.json`
- `server/` — local `GET /api/health` and `POST /api/analyze`
- `api/` — the same two routes, for Vercel
- `shared/` — the JSON schema, portion math, and the two sample meals

```bash
npm test
npm run typecheck
```

The app stores meals and settings on the device with AsyncStorage. Photos are copied into the app's documents folder when a meal is saved.

## Shipping to the App Store and Google Play

The Android APK above is for your own phone. A public store listing is a later step.

1. Join the Apple Developer Program ($99 a year) and Google Play Console ($25 once). Those are the only paid accounts in this path, and only if you decide to publish.
2. From `mobile/`, `npx eas-cli@latest build` with a production profile makes an iOS build and an Android app bundle. Apple builds need a Mac or EAS's cloud builders.
3. The server is already HTTPS. Keep `APP_SECRET` set.
4. Write a short privacy policy. When demo mode is off, a photo is sent to your server and then to Google (or OpenAI or Anthropic, if you switched). On Gemini's free tier, Google may use that content to improve its products. The log stays on the phone. Say clearly that the numbers are estimates.
5. Fill in App Store privacy labels and the Play Data safety form. The app asks for the camera and the photo library. The permission text is already in `mobile/app.json`.
6. Prepare screenshots, a support URL, and the icon in `mobile/assets`. Then submit for review.

Do not describe it as a medical or nutrition-coaching app. It is a personal estimate of what is on the plate.
