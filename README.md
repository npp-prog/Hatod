# Hatod

Mobile-first PWA that connects customers, food shops and independent riders in small Philippine towns. Hatod is a **gateway only**. It never holds order money, takes no commission and runs no promos. It earns only from flat shop and rider subscriptions.

See [PLAN.md](PLAN.md) for the milestone plan and decisions.

## Repository layout

| Path | What |
|---|---|
| `apps/web` | Next.js 15 (App Router) + TypeScript + Tailwind v4 PWA (Serwist), next-intl (`en`, `fil`) |
| `functions` | Cloud Functions (Node 24, TypeScript, bundled with tsup) |
| `packages/shared` | Pure business logic, types and zod schemas used by both, with Vitest tests |
| `tests` | Emulator tests: Firestore rules and callable functions |
| `e2e` | Playwright end-to-end tests of the 3 core flows |
| `scripts/seed.ts` | Demo data for the emulators |
| `firestore.rules`, `storage.rules` | Security rules (deny by default) |

## Requirements

- Node 22 or 24 (`nvm use` picks 24, the functions runtime)
- Java 21+ (for the Firestore emulator)
- No Firebase account is needed for local work. The emulators run the `demo-hatod` project, which never touches real Firebase.

## Run locally

```bash
npm install
npm run dev          # builds functions, starts the emulators, the Next.js dev server and the order sweep
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
| 0917 000 0011 to 0014 | Owners of the bakery, lechon, BBQ and sari-sari shops | customer, shop |
| 0917 000 0021 to 0023 | Riders Jojo (fixed fares), Bea (bicycle) and Nonoy (pending) | customer, rider |

The seed also creates **San Roque** (live, 10 barangays from `seed/demo-barangays.csv`), **Santa Monica** (not live yet, for testing what customers can't see), two saved addresses for Carmen Customer, and **6 shops with menus**: 5 verified and listed (carinderia, bakery, lechon manok with its own rider, late-night BBQ, sari-sari store) and Sonny's Milk Tea still waiting for verification. There are also **5 riders with different rate cards**:
- Ramon: the plan's example card plus night and rain surcharges.
- Sonny: cheap short trips in five barangays.
- Jojo: habal-habal style fixed fares from the poblacion.
- Bea: on a bicycle, 3 km range, currently offline.
- Nonoy: waiting for verification. Both towns are fictional names placed on real terrain so the map has roads to pin on.

Sign in with any of these numbers. No SMS is sent: the 6-digit code appears in the emulator terminal and in the Emulator UI under **Authentication**. Any other PH mobile number creates a new customer account.

## Towns, barangays and addresses

- **Towns:** admins add them at `/admin/towns`. Each town has a tier (A/B/C, which sets plan prices later), a free-trial end date (Philippine time), a center point and a service radius. Customers only see towns marked **Live**.
- **Barangays:** imported per town from a CSV with a header row `name,lat,lng`. Re-importing updates rows with the same name and never deletes, since saved addresses may point at a barangay. `seed/sample-new-town-barangays.csv` is a ready-made file to try.
- **Addresses:** customers save up to 10 at `/addresses`. Each has a label, a barangay, an optional street/purok, a **required landmark** and a **map pin**. The pin starts at the barangay center and must be inside the town's radius. Addresses are written straight to Firestore by the phone, checked by the security rules, so they save offline and sync later.
- **Map tiles:** the map uses OpenStreetMap's public tile server, which is fine for a pilot. At scale, switch to a paid tile provider or self-hosted tiles; the tile URL is in `apps/web/src/components/MapPicker.tsx`.

## Shops

- **Registering:** anyone signed in can register one shop at `/register/shop` (also linked from the home page). The shop is created **unverified** and hidden from customers until the town coordinator verifies it (M8). Registering adds the shop role, so the owner can set things up meanwhile.
- **Shop area** (`/shop`):
  - **Overview:** open/closed status, the "Closed today" switch (turns itself off the next day), "Busy" extra prep time, and a go-live checklist.
  - **Menu:** categories (add, rename, reorder, delete), items with optional sizes (each with its own price) and add-ons, a photo, and a sold-out switch.
  - **Hours:** up to 3 time ranges a day. A closing time earlier than the opening time runs past midnight.
  - **Profile:** details, location, up to 3 photos, GCash/Maya QR codes and the business permit.
- **Images** are shrunk on the phone to WebP (long side 1024 px, about 100 KB) before upload. The permit is private: only the owner, that town's coordinators and admins can open it.
- **Who can change what:**
  - The owner edits listing, menu and hours fields directly; the security rules list exactly which fields.
  - Verification, status, plan and ratings change only through Cloud Functions.
  - Storage ownership comes from login claims (`shops`), so the Storage rules never read Firestore.

## Riders

- **Signing up:** anyone signed in can sign up at `/register/rider` with their vehicle, plate number and an emergency contact. The rider record starts **unverified**: the town coordinator checks documents and the vehicle in person (M8).
- **Rider area** (`/rider`):
  - **Overview:** the Online switch (only after verification), the Raining switch, their record, and a checklist.
  - **My rates:** base fee, per-km rate, minimum, night/rain/extra-stop surcharges and fixed barangay-to-barangay fares. A live preview shows exactly what a customer will pay.
  - **Service area:** barangays served and the longest trip.
  - **Profile:** photo, documents (ID, license, OR/CR, clearance; bicycles need no license or OR/CR), vehicle details (locked after verification) and emergency contact.
- **Delivery fee** (`packages/shared/src/fees.ts`):
  - **Distance:** road distance from shop to drop-off, rounded up to the next 0.5 km.
  - **Price:** a fixed fare if the rider set one for those two barangays, otherwise `max(minimum, base + perKm × km)` rounded up to a whole peso.
  - **Surcharges:** night (Manila time), rain (while switched on) and extra stops are added on top.
  - Hatod adds nothing.
- **Rate changes:** rates and the service area change only through Cloud Functions. After verification, rates can change once per 24 hours; before verification, any time.

## Ordering (customer side)

- **Home** (`/`): shops in the chosen town, open ones first, filterable by category. Search matches shop names and dishes ("adobo", "pandes"). A "Save data" switch hides photos; it turns on by itself when the phone's data saver is on.
- **Shop page** (`/shops/{id}`): opening status, prep time, payment methods and the menu by category. Tapping an item opens a sheet for size, add-ons, quantity and a note. Sold-out items can't be added.
- **Cart** (`/cart`): one shop per order, kept on the phone. Before checkout every line is re-checked against the live menu (removed, sold out, changed or re-priced).
- **Checkout** (`/checkout`, sign-in required):
  - The customer picks a saved address in the shop's town and how they will pay the shop.
  - They choose a rider from the eligible ones, each with their own fee and a breakdown, sortable by price, rating or nearest. Shops with their own rider skip rider choice.
  - A new customer's first 3 orders are capped at ₱1,000 of food.
- **Distance** is estimated as straight line × 1.3 and labelled as an estimate. The server recomputes it and locks the fee when the order is placed (M6).
- **Menu summary:** each shop keeps a server-computed `menuSummary` (counts, lowest price, dish words) that powers listing and search. The shop app asks the `refreshMenuSummary` function to recompute it after menu changes.

## Orders

- **Order flow:**
  - The customer places an order (with a chosen rider, unless the shop delivers itself).
  - The shop accepts with a ready time or declines with a reason. It has 10 minutes before the order expires.
  - The chosen rider gets a 60-second offer. If they decline or let it expire, the customer picks another rider; riders who said no are not offered again.
  - The rider accepts, which locks the fee, then marks picked up and delivered. The customer confirms receipt, or the order completes by itself after 2 hours.
- **Every status change goes through Cloud Functions** and the shared state machine (`packages/shared/src/orders.ts`). The apps never write orders.
  - `placeOrder` re-prices everything from the menu, re-checks the rider and the new-customer cap, and is idempotent by `requestId`.
  - Rider acceptance runs in a transaction, so two acceptances can never both win.
- **Payments** are recorded, not handled. The shop marks "food paid" and the rider marks "fee collected". Customers see the shop's GCash/Maya QR and the rider's number for GCash.
- **Screens:**
  - Customer: `/orders` and `/orders/{id}` (live timeline, call/text, how to pay, choose another rider, cancel, received, order again).
  - Shop: `/shop/orders` (rings while a new order waits; accept by ready time, decline by reason; ready, paid, cancel; pick up and deliver for shops that deliver themselves).
  - Rider: `/rider/jobs` (offer with countdown and sound; active job with Google Maps/Waze, call/text, collect amounts; earnings).
- **Notifications:**
  - Web push to phones that turned it on (needs `NEXT_PUBLIC_FCM_VAPID_KEY`).
  - SMS for new orders and job offers: `SMS_PROVIDER=semaphore` plus the `SEMAPHORE_API_KEY` secret. The default `console` provider logs messages and stores them in `smsOutbox`.
- **Timeouts:** the `sweepOrders` function runs every minute in production. The emulator does not run scheduled functions, so `npm run dev` also runs `scripts/sweep-dev.ts` every 30 seconds. The apps also apply a timeout the moment a countdown hits zero (`nudgeOrder`).
- **Road distance:** OpenRouteService when the `ORS_API_KEY` secret is set; otherwise straight line × 1.3, labelled as an estimate.

Secrets for real projects:

```bash
firebase functions:secrets:set SEMAPHORE_API_KEY
firebase functions:secrets:set ORS_API_KEY
firebase functions:secrets:set PAYMONGO_SECRET_KEY
firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET
```

and in `functions/.env.<projectId>`: `SMS_PROVIDER=semaphore`, `PAYMENT_PROVIDER=paymongo`, `APP_BASE_URL=https://your-domain`.

For the emulator, copy `functions/.secret.local.example` to `functions/.secret.local`. Without it, you'll see harmless "secret not found" warnings and the fallbacks are used.

## Ratings, reports and strikes

- **Ratings:** after an order is completed, each side rates the other once (1–5 stars, quick tags, optional comment) within 7 days.
  - The customer rates the shop and the rider; the shop and the rider each rate the customer.
  - Averages on shops, riders and customers update in the same transaction.
  - Ratings of customers are visible only to staff. An order only records *that* each side rated, never the stars, so nobody sees how they were rated.
- **Reports:** "Report a problem" is on the customer's order page, the shop's order cards and the rider's jobs and history.
  - Reports land in the town coordinator's queue at `/coordinator/reports` (admins see every town). The reported person can't see who reported them.
  - Safety reports are urgent: the coordinator gets an SMS. If people have already met on that order (a rider was assigned) and the order is running or ended within 48 hours, the reported customer or rider is suspended at once until the coordinator decides.
  - To stop this being used as a weapon: shops are never taken offline by one report (the coordinator decides), and one person can trigger at most 2 instant suspensions in 30 days. Later reports still reach the queue.
- **Strikes:** a confirmed report is a strike, and so is a customer cancelling after the shop accepted.
  - Strikes are kept in a `strikes` collection no app user can read, so the reported person cannot trace a report back to an order or reporter.
  - 3 strikes in 30 days mean a 7-day suspension, which ends by itself (the sweep lifts it).
  - A confirmed safety report keeps the person suspended until an admin lifts it. A dismissed one lifts the suspension it caused.
  - Suspended customers can't order, suspended shops are hidden, and suspended riders go offline and can't go online.
  - A **ban** is final: reports, strikes, the sweep and coordinators never change a banned account. Only an admin's *Reinstate* does (which also clears strikes).

## Coordinator and admin tools

- **Coordinator area** (`/coordinator`, also open to admins, who can pick any town):
  - **Overview:** how many are waiting for verification, open reports, and sign-up links for a town accepting sign-ups before launch.
  - **Verify:** pending shops and riders. Each detail page shows their private details and documents (opened through short-lived links), with Approve or Reject; a rejection needs a note, which they see.
  - **Shops & riders:** everyone in the town with their status. Coordinators can suspend (pending admin review); only admins ban or reinstate.
  - **Reports:** the queue from M7.
  - **Dashboard:** the plan's pilot numbers against their targets (completed orders, completion rate, time to a rider, repeat customers, active shops and riders) and completed orders per day.
- **Admin** (`/admin`):
  - Dashboard for one town or all towns.
  - Towns, with a new "accept shop and rider sign-ups before going live" switch.
  - People: roles plus suspend, ban and reinstate for customer accounts.
- **Every action is logged** in `adminLog` with who did it and the note.
- **Pre-launch onboarding:** turn on sign-ups for a town that isn't live, import its barangays, then send the sign-up links from the coordinator overview (`/register/shop?town=…`, `/register/rider?town=…`). Customers still can't see the town until it is live.
- **Seed data:** Santa Monica accepts sign-ups, and San Roque has 14 days of sample orders for the dashboard.

## Plans and subscriptions

- **Plans** (`plans` collection; admins edit prices per town tier at `/admin/plans`):

  | Plan | Price | What it includes |
  |---|---|---|
  | Shop Basic | free | listing, contact, 10 items |
  | Shop Standard | ₱199/month | in-app orders |
  | Shop Plus | ₱399/month | featured first among open shops |
  | Rider Daily | ₱5 per day online | prepaid balance |
  | Rider Monthly | ₱69/month | |
  | Featured banner | ₱150/week | defined, not offered yet |

- **New shops and riders** start on a 60-day free trial (the town's trial date if it is set).
- **Status:** trial → active (paid) → grace for 3 days after the paid period ends → lapsed. The daily `sweepSubscriptionsDaily` job (00:05 Manila) moves them and texts people.
- **What a lapse means:**
  - A lapsed or Basic shop stays listed but customers see "Order by phone" with call/text buttons, at most 10 items, and no in-app orders.
  - A lapsed rider is taken offline and is hidden from rider selection.
- **Going online** goes through the `goOnline` function: it checks verification and the subscription and takes the Rider Daily fee once per day online (free during the trial). Riders still online after midnight are charged by the daily job, or go offline if out of balance.
- **Paying:**
  - Shops and riders pay from their **Plan** tab: months for monthly plans, top-ups for Rider Daily.
  - `PAYMENT_PROVIDER=paymongo` is the default. `mock` (set in `functions/.env.demo-hatod`) uses a local test page and only works inside the emulator, so a deploy can never hand out free plans. For PayMongo, set the `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` secrets, `APP_BASE_URL`, and point a PayMongo webhook (event `checkout_session.payment.paid`) at the `paymongoWebhook` function.
  - The webhook checks the signature (live-mode signature only with a live key), the checkout session id, the mode and the amount paid.
  - Coordinators record cash on **Coordinator → Payments** with the official receipt number. They cannot record payments for (or verify) their own shop or rider account; another coordinator or an admin must.
  - **Switching plans** carries over the peso value of unused paid time, not the time: a month of Standard (₱199) becomes about half a month of Plus (₱399). Value parked on free Basic comes back as time on a paid plan. A checkout paid after a switch is credited by its value on the current plan.
  - Every payment is stored once by its reference (provider id or `cash_{town}_{receipt}`), so retries and duplicate receipts never count twice.
- **Receipts:** online payments get an `E-…` reference. Cash payments carry the coordinator's official receipt number. BIR electronic invoicing is a later step.

## Tests

```bash
npm test               # shared business logic + translation checks (Vitest, no emulators needed)
npm run test:emulator  # Firestore rules + callable functions inside the emulators
npm run test:all       # both
npm run e2e            # Playwright: the 3 core flows in a phone browser against the emulators + seed
npm run typecheck      # all workspaces
npm run lint           # web app (includes the no-literal-text-in-JSX rule)
npm run check:bundle   # after a web build: customer home must stay under 200 KB of JS
```

**End-to-end tests** (`e2e/`): customer order to completion; a rider declines and the customer's second choice accepts; a rider whose subscription lapses disappears from rider selection. `npm run e2e` starts the emulators, and Playwright starts `next dev` (or reuses one on port 3000). Each test wipes and re-seeds Firestore. With emulators already running (`npm run dev`), use `npm run e2e:dev`. Traces are off; to debug a failure, run that test with `npx playwright test e2e/<file> --trace on`.

## Performance and offline

- **Customer home:** 129 KB first-load JS (budget 200 KB, checked by `npm run check:bundle`). Firebase loads after first paint. Links do not prefetch, to save mobile data. Auth skips Google's popup/redirect helper script, which phone sign-in does not need.
- **Lighthouse mobile** (production build, default throttling): Performance 96, Accessibility 100, Best Practices 100; first paint 0.9 s, LCP 2.1 s.
  - In a throttled browser at slow 3G (400 ms RTT, 400 kbps, 4× CPU), the page shows its main text at 1.4 s and finishes loading at about 4 s.
  - Lighthouse's own slow-3G simulation reports first paint at 2.4 s and LCP around 6.5 s, because its model counts the deferred Firebase scripts against the paint.
- **Offline:**
  - Pages already opened are cached by the service worker. Menus, orders and addresses stay readable through Firestore's offline cache, and writes queue until the signal returns.
  - A "Waiting for signal" bar shows while offline, and order buttons say "No signal" instead of a vague error.
  - A page never opened before shows a precached "No signal" page in the phone's language.

## Environment keys

| File | Purpose |
|---|---|
| `apps/web/.env.development` | Committed. Emulator settings for `next dev`. No secrets. |
| `apps/web/.env.example` | Every web key, documented. Copy to `.env.local` for a real project. |
| `functions/.env.example` | Function params (`ADMIN_PHONES`). Copy to `functions/.env.<projectId>`. |
| `functions/.env.demo-hatod` | Committed. Emulator-only params. |

Secrets (Semaphore, OpenRouteService, PayMongo) live in Cloud Secret Manager (`firebase functions:secrets:set`), never in the client. For the emulator, put test values in `functions/.secret.local` (see `functions/.secret.local.example`).

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
5. Create `functions/.env.<projectId>` from `functions/.env.example`: `ADMIN_PHONES=+63...` for the first admin, `SMS_PROVIDER=semaphore`, `PAYMENT_PROVIDER=paymongo`, `APP_BASE_URL=https://your-domain`.
6. Set the secrets: `firebase functions:secrets:set SEMAPHORE_API_KEY` (and `ORS_API_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`).
7. Tell the rules which Storage bucket images may come from (image uploads are refused until this is set):
   `GCLOUD_PROJECT=<id> STORAGE_BUCKET=<bucket> npx tsx scripts/set-config.ts`
8. In PayMongo, add a webhook for `checkout_session.payment.paid` pointing at the `paymongoWebhook` function URL.
9. For web push, create a Web Push certificate (Cloud Messaging settings) and set `NEXT_PUBLIC_FCM_VAPID_KEY`.

Functions run on **Node.js 24** (`.nvmrc`); local development works on Node 22 or newer.

Each release:

```bash
npm run test:all
firebase use prod
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
# App Hosting builds and deploys the web app on push to the configured branch
```
