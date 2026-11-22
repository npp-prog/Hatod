# Hatod — Phase 1 MVP build plan

Hatod is a mobile-first PWA that connects customers, food shops and independent riders in small Philippine towns. It is a **gateway only**: it never holds order money, takes no commission, runs no promos, and earns only from flat shop and rider subscriptions.

This file is step 1 of the build brief. **No code will be written until this plan is approved.**

---

## 1. Folder structure (npm workspaces monorepo)

```
hatod/
├─ package.json                 # workspaces: apps/*, packages/*, functions
├─ firebase.json                # hosting, functions, firestore, storage, emulators
├─ .firebaserc                  # aliases: dev, staging, prod
├─ firestore.rules
├─ firestore.indexes.json
├─ storage.rules
├─ .env.example                 # every key documented (web + functions)
├─ README.md                    # setup, env, emulators, deploy
├─ PLAN.md
│
├─ packages/
│  └─ shared/                   # pure TypeScript, no Firebase SDK imports
│     ├─ src/
│     │  ├─ types/              # User, Shop, Rider, Order, Subscription, ... (single source of truth)
│     │  ├─ schemas/            # zod schemas used by web forms AND functions input validation
│     │  ├─ fees/               # computeDeliveryFee(), roundUpHalfKm(), surcharges, fixed fares
│     │  ├─ eligibility/        # isRiderEligible(rider, sub, dropoff, d)
│     │  ├─ orders/             # state machine: allowedTransitions, canTransition(order, to, actor)
│     │  ├─ subscriptions/      # nextStatus(sub, now), planLimits(plan) e.g. Basic = 10 items
│     │  ├─ trust/              # strike rule, new-customer cap (first 3 orders ≤ PHP 1,000)
│     │  ├─ hours/              # isOpenNow(hours, now Asia/Manila)
│     │  ├─ geo/                # haversine, ×1.3 fallback
│     │  └─ money/              # formatPHP (₱), centavo integers
│     └─ test/                  # Vitest, high coverage on all of the above
│
├─ functions/                   # Cloud Functions, Node 20, TypeScript
│  └─ src/
│     ├─ callable/              # placeOrder, shopRespond, chooseRider, riderRespond, advanceOrder,
│     │                         #   cancelOrder, markPaid, submitRating, submitReport,
│     │                         #   verifyListing, recordCashPayment, updateRateCard, setOnline, ...
│     ├─ scheduled/             # expireOffers (1 min), expireUnacceptedOrders, autoComplete (2 h),
│     │                         #   autoOffline (2 h idle), subscriptionLapses (daily, Asia/Manila)
│     ├─ triggers/              # onOrderWrite -> notifications, ratings aggregates
│     ├─ http/                  # paymongoWebhook (idempotent by payment ref)
│     ├─ providers/
│     │  ├─ sms/                # SmsProvider: ConsoleSms, SemaphoreSms
│     │  ├─ payments/           # PaymentProvider: MockPayments, PayMongo
│     │  └─ routing/            # RoutingProvider: OpenRouteService, Haversine fallback
│     └─ lib/                   # admin SDK init, auth/role guards, idempotency keys
│
├─ apps/
│  └─ web/                      # Next.js 15 App Router + TS strict + Tailwind + Serwist PWA
│     ├─ app/
│     │  ├─ [locale]/
│     │  │  ├─ (customer)/      # home, shop/[id], cart, checkout, orders, orders/[id], addresses
│     │  │  ├─ shop/            # register, menu, hours, inbox, sales, subscription
│     │  │  ├─ rider/           # register, rates, area, offers, job, earnings, subscription
│     │  │  ├─ coordinator/     # verify, payments, reports
│     │  │  ├─ admin/           # towns, plans, subscriptions, users, listings, reports, dashboard
│     │  │  ├─ auth/            # phone OTP, consent
│     │  │  └─ legal/           # terms, privacy (TODO lawyer text)
│     ├─ components/            # thin UI; no business rules
│     ├─ lib/firebase/          # client SDK, emulator wiring, typed converters
│     ├─ lib/offline/           # action queue + "waiting for signal" banner
│     ├─ messages/              # en.json, fil.json (next-intl)
│     └─ public/                # manifest icons, alert sound
│
├─ seed/                        # emulator seed script: 1 town, 10 barangays, 6 shops, 5 riders, 3 customers, plans
└─ e2e/                         # Playwright: 3 core flows against emulators
```

**Rule of the codebase:** fees, transitions, eligibility, subscription status, limits and strikes live only in `packages/shared` with tests. Functions call them to enforce; the web app calls them only to *preview* (e.g. fee estimate). UI components stay thin.

## 2. Key technical decisions

| Area | Choice | Note |
|---|---|---|
| PWA | **Serwist** (`@serwist/next`) | `next-pwa` is unmaintained for the App Router |
| i18n | **next-intl**, `en` + `fil` | Locale in URL segment; no hard-coded strings (lint rule) |
| Validation | **zod** in `packages/shared` | Same schema on the form and in the function |
| Maps | Leaflet + react-leaflet, OSM tiles, loaded dynamically | Kept off the customer home bundle (200 KB budget) |
| Routing distance | OpenRouteService behind `RoutingProvider` | Fallback haversine × 1.3, fee labelled "estimate" |
| Money | Integer pesos (no centavos needed for menus/fees) | Display with `₱` via `Intl.NumberFormat('en-PH')` |
| Time | All server logic in `Asia/Manila` | Hours, night surcharge, daily jobs |
| Rider choice at checkout | Customer picks one rider; offer goes out after the shop accepts | Matches the state machine in the brief |
| Order writes | Clients call callable functions only | Rules deny client writes to `orders`, `riderOffers`, `subscriptions`, `verified`, aggregates |
| Roles | Stored in `users.roles[]` **and** mirrored to Auth custom claims | Claims make security rules cheap and fast |
| Images | Client-side resize to WebP ≤ 100 KB before upload | Storage rules enforce size and content type |

## 3. Milestones (stop for review after each)

Each milestone ends with: summary, how to test it, and a green test run (`npm test`, emulator tests where relevant).

| # | Milestone | Done when |
|---|---|---|
| **M1** | Monorepo, TS strict, lint, Tailwind, Firebase emulators, phone OTP auth (emulator test numbers), roles + custom claims, role-based routing, next-intl en/fil, Serwist PWA shell + manifest, consent checkbox, legal placeholder pages | Sign in on emulator, land on the right area per role, installable PWA |
| **M2** | Towns, barangays (admin CSV import stub), town picker, saved addresses with barangay dropdown + landmark + Leaflet pin | Customer saves 2 addresses; data scoped by `townId` |
| **M3** | Shop registration (photos, QR, optional permit → private Storage), menu manager (categories, variants, add-ons, sold-out), weekly hours, busy toggle, closed-today | Shop builds a full menu; `isOpenNow` unit-tested |
| **M4** | Rider registration (private docs), rate card editor with live example fee, service area, `computeDeliveryFee` + eligibility in shared with full unit tests, 24 h rate-change limit | Fee tests cover rounding, minimum, fixed fares, night/rain/extra-stop, maxKm |
| **M5** | Customer home (open first, categories, search), shop page, cart (one shop), checkout with payment methods + rider list (fee breakdown, sort by price/rating/nearest), new-customer cap | Customer can reach "Place order" with a chosen rider |
| **M6** | Order state machine in functions, offers with 60 s expiry + transaction, rider re-pick flow, self-delivery, cancellations, scheduled expiries, push (FCM) + SMS mock, tracking timeline, shop inbox alert sound, rider offer countdown + active job + deep links, mark paid | Full order to COMPLETED in emulator; idempotent callables |
| **M7** | Two-way ratings + aggregates, reports, strike rule (3 in 30 days → 7-day suspension), report a problem | Strike logic unit-tested; suspended users blocked |
| **M8** | Coordinator: verification queue, cash payment recording with receipt no., town reports, suspend pending review. Admin: towns/barangays CSV, plans per tier, trial dates, subscriptions, users, take-downs, dashboard metrics | Coordinator verifies a shop and it appears to customers |
| **M9** | Subscriptions: 60-day trial per new town, PayMongo checkout behind `PaymentProvider` (mock in dev), idempotent webhook, daily lapse job (active → grace 3 days → lapsed), Basic downgrade, rider hide, Rider Daily load balance | Lapse transitions unit-tested + emulator test |
| **M10** | Firestore + Storage rules tests in emulator, performance pass (Lighthouse mobile, bundle budget check in CI), offline queue polish, Playwright e2e ×3 (order to completion; rider declines → second rider accepts; lapse hides rider), README | All tests green; Lighthouse report attached |

Seed data (one demo town, 10 barangays, 6 shops, 5 riders, 3 customers, all plans) lands in M2 and grows with each milestone so every flow is demo-able in the emulator.

## 4. Open questions (need your answer before or during M1)

1. **Next.js version.** The brief pins Next.js 15. Next.js 16 is current as of now. Stay on 15 as written, or use the latest stable?
2. **Hosting for Next.js.** Server-rendered Next.js on Firebase needs **Firebase App Hosting** (Blaze plan) or Vercel. Which do you prefer? Static export is possible but loses server rendering for shop pages.
3. **Firebase plan.** Cloud Functions, scheduled jobs and phone auth need the **Blaze (pay-as-you-go)** plan. Phone OTP SMS is billed per message by Firebase. That counts toward your PHP 3,000/month pilot ceiling. OK, or should OTP go through Semaphore with a custom-token flow (usually cheaper in PH)?
4. **Rider Daily plan "prepaid as a load balance".** Riders top up a balance and ₱5 is deducted on each day they go online. This is subscription money, not order money, so it fits the gateway rule. Confirm: no refunds of unused balance, and the rider can't go online at ₱0?
5. **Shop Basic orders.** The brief says Basic is "orders by call or Messenger link only". So Basic shops appear in browse but show Call/Messenger buttons instead of a cart. Is that right?
6. **Who pays the rider for self-delivery shops?** I assume the shop's own delivery fee is a flat amount set in shop settings. OK?
7. **OpenRouteService key** for dev, or use the haversine fallback only until M10?
8. **Semaphore and PayMongo accounts.** I'll build against mocks; real keys are only needed for staging. Fine?
9. **Third language.** Is the pilot town Hiligaynon- or Cebuano-speaking? It's Phase 2, but it affects the locale codes I reserve.
10. **Pilot town.** Do you have a real town for seed data (barangay names and centroids), or should I use a fictional one?

## 5. Guardrails I will follow

- No feature that collects order payments, adds commissions or platform fees, or creates promos. If something seems to need one, I'll ask first.
- No secrets in client code; `.env.example` documents every key.
- All callables are idempotent (client-supplied request id) so retries never duplicate orders.
- Placeholder legal text is clearly marked `TODO: lawyer review`.
