# Plateful

Snap a photo of your plate and get a rough calorie and macro estimate. One Expo app runs on iPhone and Android. A small server calls the vision model, so the API key never ships inside the app.

Demo mode needs no key. It walks through the whole photo → results → daily log flow with two real meals.

## Try it on your phone

1. Install [Node.js 22](https://nodejs.org/) or newer.
2. Install **Expo Go** from the App Store or Google Play.
3. In this folder, install and start:

   ```bash
   npm install
   npm install --prefix mobile
   npm install --prefix server
   npm start
   ```

4. Put your phone and computer on the same Wi-Fi.
5. Scan the QR code. On iPhone, use the Camera app. On Android, use the Scan button inside Expo Go.
6. If the phone cannot reach the computer, stop the server and start a tunnel instead:

   ```bash
   npm --prefix mobile exec -- expo start --tunnel
   ```

   Expo may ask to install a tunnel helper the first time.

7. Take a photo, choose one from your gallery, or tap **Sausage & green beans** or **Fries & ketchup**.
8. Demo mode is on, so those numbers are saved examples, not a reading of your photo. Change a portion with +/− or by typing grams. The totals update. Remove a food or add one the estimate missed, then tap **Save to today**.
9. Open the **Log** tab. Each day has a running total of calories, protein, carbs, and fat. Tap a meal to edit it. Nothing here leaves the phone.

You can also open the same app in a desktop browser with `npm run web`. The gallery button asks for an image file.

## Turn on a real estimate

The phone only knows the server address. The server reads the key from its own environment.

1. Copy the example env file and add your key:

   ```bash
   cp server/.env.example server/.env
   ```

   `server/.env`:

   ```bash
   VISION_PROVIDER=openai
   VISION_API_KEY=sk-your-key
   PORT=8787
   ```

   `VISION_PROVIDER` can be `openai` or `anthropic`. You can set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` instead of `VISION_API_KEY`. Optional `VISION_MODEL` overrides the default (`gpt-5.4-mini` for OpenAI, `claude-haiku-5-5` for Anthropic). A stronger model is a one-line change if the portions look weak.

2. Start the server:

   ```bash
   npm run server
   ```

   It listens on port 8787 and prints whether a key is set. Check it with `http://localhost:8787/api/health`. The health check says which provider and model are selected. It does not print the key.

3. Find your computer's Wi-Fi address (on a Mac, System Settings → Network; on Linux, `hostname -I`).

4. In the app, open the gear icon. Set the server address to `http://THAT-ADDRESS:8787`. Turn demo mode off. Save. Tap **Check connection**.

5. Take a photo. The app shrinks it to a JPEG and sends it to `POST /api/analyze`. The server asks the model for JSON, checks the shape, adds the totals from the line items, and returns that to the phone.

`localhost` works in the browser on the same computer. It does not work from a phone. Do not put the key in `mobile/.env` or in any `EXPO_PUBLIC_` variable. Those get bundled into the app.

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

## Layout

- `mobile/` — the Expo app (TypeScript, Expo Router)
- `server/` — `GET /api/health` and `POST /api/analyze`
- `shared/` — the JSON schema, portion math, and the two sample meals

```bash
npm test
npm run typecheck
```

The app stores meals and settings on the device with AsyncStorage. Photos are copied into the app's documents folder when a meal is saved.

## Shipping to the App Store and Google Play

This version is meant to run in Expo Go. A store build is a separate step, after the estimate feels good on your own meals.

1. Join the Apple Developer Program ($99 a year) and Google Play Console ($25 once).
2. From `mobile/`, install the EAS CLI and run `npx eas build`. EAS will add `eas.json` and produce an iOS build and an Android app bundle. Apple builds need a Mac or EAS's cloud builders. You can install those builds with TestFlight and Play's internal testing track before you submit.
3. Host the server on HTTPS before anyone else uses the app. A release iOS build will refuse a plain `http://` address. The key still stays on the server, but an open URL will let strangers spend it. Add a shared password or a login before you share the address.
4. Write a short privacy policy. When demo mode is off, a photo is sent to your server and then to OpenAI or Anthropic. The log stays on the phone. Say clearly that the numbers are estimates.
5. Fill in App Store privacy labels and the Play Data safety form. The app asks for the camera and the photo library. The permission text is already in `mobile/app.json`.
6. Prepare screenshots, a support URL, and the icon in `mobile/assets`. Then submit for review.

Do not describe it as a medical or nutrition-coaching app. It is a personal estimate of what is on the plate.
