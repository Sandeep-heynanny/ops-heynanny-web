# HeyNanny Ops

Internal dashboard for the operations team: every booking request from heynanny.in, live.

- **Who can use it:** `@heynanny.in` Google accounts that an admin has given a role (`ops` or `admin`).
- **Data:** the same Firestore `bookings` collection the website writes to (Firebase project `hey-nanny-web`).
- **Security:** enforced by Firestore rules, which live in the **website repo** (`hey-nanny/firestore.rules`). Deploy rules from there only.

## Features

- Summary: new requests, received today, contacted, confirmed this month.
- Status tabs: New → Contacted → Confirmed / Cancelled (plus Completed, All).
- Search (name, phone, email, request ID, pincode) and filters (service, lead source, date received).
- Detail panel: Call / WhatsApp / Email, status, "assigned to", internal notes (customers never see them), estimated price.
- Live updates, with a pop-up and tab-title count when a new request arrives.
- Export the current view to Excel (CSV).

## Run locally

```bash
npm install
npm run dev          # http://localhost:3001
```

`.env.local` holds the "HeyNanny Ops" web-app config (see `.env.example`).

To preview the UI with sample data and no sign-in, add `NEXT_PUBLIC_OPS_DEMO=1` to `.env.local` (never on the live site).

## Give someone access

They must sign in once first (they'll see "No access yet"), then:

```bash
npm run role -- priya@heynanny.in ops      # view + update bookings
npm run role -- sandeep@heynanny.in admin  # same, plus admin-only actions (delete bookings)
npm run role -- priya@heynanny.in none     # remove access
npm run role -- --list                     # who has access
```

They then press **Check again** (or reload).

The script needs admin credentials, once per computer. Sign in with your own Google account (an Owner of the Firebase project):

```bash
brew install --cask google-cloud-sdk        # if gcloud isn't installed
gcloud auth application-default login
gcloud auth application-default set-quota-project hey-nanny-web
```

(Service-account keys are blocked by the organisation policy, which is the safer default. If they are ever allowed, a key saved as `service-account.json` here also works; it's git-ignored.)

## Deploy (Firebase App Hosting)

First time:
1. `firebase apphosting:backends:create --project hey-nanny-web` → backend ID **`heynanny-ops`**, same region as the website.
2. `firebase deploy --only apphosting`
3. App Hosting → heynanny-ops → Settings → **Add custom domain** `ops.heynanny.in`, then add the DNS records it shows in Namecheap (Host: `ops`).
4. Firebase → Authentication → Settings → **Authorized domains**: add `ops.heynanny.in` and the `*.hosted.app` URL of the backend.

After that, deploy with `firebase deploy --only apphosting`.

## Keep in sync with the website

`src/lib/catalog.ts` copies the service/plan names from the website (`src/config/services.ts`). Update it when plans change there.
