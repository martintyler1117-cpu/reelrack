# ReelRack — Firebase Admin Catalog

Movies & TV catalog with **Firebase Auth (Google)**, **Firestore** for metadata, and **Storage** for posters & trailers. Public can browse & play. **Only the admin user can add/edit/delete.**

## 1) Install
```bash
npm i
npx shadcn@latest init
npx shadcn@latest add button card input textarea label badge tabs dialog select dropdown-menu sheet
```

## 2) Firebase setup
1. Create a Firebase project → enable **Authentication → Google** provider.
2. Enable **Firestore** (in production mode) and **Storage**.
3. Create `.env.local` from `.env.example` and paste your project config.
4. Run locally and sign in once to get your Google user **UID** from console logs (or Firebase Console → Authentication). Put that in `VITE_ADMIN_UID`.

> Deploy security rules (optional but recommended):
- `firebase.rules.firestore` for Firestore
- `firebase.rules.storage` for Storage

## 3) Run
```bash
npm run dev
```
Sign in via menu (⋯) → **Sign in with Google**. If your UID matches `VITE_ADMIN_UID`, you'll see **Admin** badge and the **Add Title** button.

## 4) Deploy to Vercel (1‑click)

### ✅ One‑click deploy button
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-user/reelrack&env=VITE_FIREBASE_API_KEY,VITE_FIREBASE_AUTH_DOMAIN,VITE_FIREBASE_PROJECT_ID,VITE_FIREBASE_STORAGE_BUCKET,VITE_FIREBASE_APP_ID,VITE_FIREBASE_MESSAGING_SENDER_ID,VITE_ADMIN_UID&project-name=reelrack&repository-name=reelrack)

> When you click the button:
> 1. Vercel will clone the repo
> 2. It will **auto‑create all required ENV variables**
> 3. Build output = `dist/` (already configured)
> 4. Deploy instantly

### 🛠 Manual deploy steps (if not using button)
```bash
npm run build
vercel deploy --prod
```
Make sure you add all environment variables in **Vercel → Project → Settings → Environment Variables**.

### Required Vercel env vars
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_ADMIN_UID
```

## Notes
- Admin-only uploads: posters go under `posters/`, trailers under `trailers/` in Firebase Storage.
- Metadata fields: `title, type, year, genres, cast, description, posterUrl, trailerUrl, createdAt, updatedAt, createdBy`.
- To change who is admin later, just update `VITE_ADMIN_UID` (or move to custom claims / admins collection).
