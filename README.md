# Hatod

Mobile-first PWA that connects customers, food shops and independent riders in small Philippine towns. Hatod is a **gateway only**. It never holds order money, takes no commission and runs no promos. It earns only from flat shop and rider subscriptions.

See [PLAN.md](PLAN.md) for the milestone plan and decisions.

## Repository layout

| Path | What |
|---|---|
| `apps/web` | Next.js 15 (App Router) + TypeScript + Tailwind v4 PWA (Serwist), next-intl (`en`, `fil`) |
| `functions` | Cloud Functions (Node 22, TypeScript, bundled with tsup) |
| `packages/shared` | Pure business logic, types and zod schemas used by both, with Vitest tests |
| `tests` | Emulator tests: Firestore rules and callable functions |
| `scripts/seed.ts` | Demo data for the emulators |
| `firestore.rules`, `storage.rules` | Security rules (deny by default) |

## Requirements

- Node 22 (`nvm use`)
- Java 21+ (for the Firestore emulator)
- No Firebase account is needed for local work. The emulators run the `demo-hatod` project, which never touches real Firebase.

## Run locally

```bash
npm install
npm run dev          # builds functions, starts the emulators + Next.js dev server
npm run seed         # in a second terminal, once the emulators are up
```

- App: http://localhost:3000 (Filipino at http://localhost:3000/fil)
- Emulator UI: http://localhost:4000

Emulator data is saved to `.emulator-data/` when you stop `npm run dev`. Use `npm run emulators:fresh` to start empty.

### Demo accounts (after `npm run seed`)

| Mobile | Name | Roles |
|---|---|---|
| 0917 000 0001 | Ana Admin | customer, admin |
| 0917 000 0002 | Carlo Coordinator | customer, coordinator (demo-town) |
| 0917 000 0003 | Susan Shop | customer, shop |
| 0917 000 0004 | Ramon Rider | customer, rider |
| 0917 000 0005 | Carmen Customer | customer |
| 0917 000 0006 | Sonny Shop-Rider | customer, shop, rider |

Sign in with any of these numbers. No SMS is sent: the 6-digit code appears in the emulator terminal and in the Emulator UI under **Authentication**. Any other PH mobile number creates a new customer account.

## Tests

```bash
npm test               # shared business logic (Vitest, no emulators needed)
npm run test:emulator  # Firestore rules + callable functions inside the emulators
npm run test:all       # both
npm run typecheck      # all workspaces
npm run lint           # web app (includes the no-literal-text-in-JSX rule)
```

## Environment keys

| File | Purpose |
|---|---|
| `apps/web/.env.development` | Committed. Emulator settings for `next dev`. No secrets. |
| `apps/web/.env.example` | Every web key, documented. Copy to `.env.local` for a real project. |
| `functions/.env.example` | Function params (`ADMIN_PHONES`). Copy to `functions/.env.<projectId>`. |
| `functions/.env.demo-hatod` | Committed. Emulator-only params. |

Keys arriving in later milestones (OpenRouteService, Semaphore SMS, PayMongo) will be added to these example files as each provider is built. Secrets will go in Cloud Secret Manager (`firebase functions:secrets:set`), never in the client.

## Roles

`customer`, `shop`, `rider`, `coordinator`, `admin`. One person can hold several. Roles live in `users/{uid}.roles` and are mirrored to Firebase Auth custom claims so security rules can check them cheaply. Only Cloud Functions change roles:

- `completeProfile`: first sign-in. Records name, consent (terms and privacy versions) and locale, and creates the user as `customer`. Numbers listed in `ADMIN_PHONES` also get `admin`, so the first admin can be created this way.
- `setUserRoles`: admin only, with an audit entry in `adminLog`. The changed user's open app refreshes its token automatically.

Route areas: `/` (customer, public browsing), `/shop`, `/rider`, `/coordinator` (coordinators and admins), `/admin`. The client-side gate only controls what is shown. The real protection is the security rules and the role checks in functions.

## Deploy

One-time setup:

1. Create three Firebase projects (dev, staging, prod) on the **Blaze** plan and put their IDs in `.firebaserc`.
2. Enable **Phone** sign-in under Authentication and add your web domain to the authorized domains.
3. Create a Firestore database in `asia-southeast1` (Singapore).
4. Create an **App Hosting** backend that points at this repo with root directory `apps/web`. Fill the `NEXT_PUBLIC_FIREBASE_*` values in `apps/web/apphosting.yaml` or in the console.
5. Create `functions/.env.<projectId>` with `ADMIN_PHONES=+63...` for the first admin.

Each release:

```bash
npm run test:all
firebase use prod
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
# App Hosting builds and deploys the web app on push to the configured branch
```
