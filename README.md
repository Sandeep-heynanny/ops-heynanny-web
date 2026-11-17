# HeyNanny Ops

Internal dashboard for the operations team: every enquiry from the Contact and WhatsApp forms on heynanny.in, and from Meta (Facebook / Instagram) lead ads, live.

Meta leads are saved by the `leads` Cloud Functions in the website repo (`hey-nanny/functions-leads`, see its README for the Meta setup). They have `channel: "meta_lead_ad"`, a `META-…` reference, `leadSource` `meta_facebook` / `meta_instagram` / `meta_organic`, and a **Meta ad** section in the detail panel with campaign, ad set, ad, form and every form answer.

- **Who can use it:** `@heynanny.in` Google accounts that an admin has given a role (`sales`, `servicing`, `supply`, `manager` or `admin`).
- **Data:** the Firestore `leads` collection the website writes to (Firebase project `hey-nanny-web`).
- **Security:** enforced by Firestore rules, which live in the **website repo** (`hey-nanny/firestore.rules`). Deploy rules from there only.

## Features

- Summary: new requests, received today, contacted, confirmed this month.
- Status tabs: New → Contacted → Confirmed / Cancelled (plus Completed, All).
- Search (name, phone, email, request ID, pincode) and filters (service, lead source, date received).
- Detail panel: Call / WhatsApp / Email, status, "assigned to", internal notes (customers never see them), estimated price.
- Live updates, with a pop-up and tab-title count when a new request arrives.
- Export the current view to Excel (CSV).

## Roles

| Role | Sees |
| --- | --- |
| `ops` | Enquiries |
| `servicing` | Servicing, Nannies (nanny data is confidential: no export) |
| `manager` | Enquiries, Servicing, Nannies (everything except Payments; no nanny export) |
| `admin` | Everything, plus Payments, nanny import/export, deleting nannies and enquiries |

Firestore rules (website repo) enforce the same split; the dashboard only decides what to show.

## Servicing (servicing team + admins)

`/servicing`: every paying customer from payment to placement. The `linkPaymentsToServicing` Cloud Function (website repo, `functions/src/servicing`) runs every 2 minutes: each successful Cashfree payment received after `SERVICING_START` is added to the customer's open case (matched by phone) or creates a new one, and their enquiry is marked converted. Customers who paid earlier are added with **New case**.

Stages: New → Profiles shared → Interviews → Approved → Placed (plus On hold / Cancelled). The stage moves by itself as the team records each step in the case panel:
1. **Profiles shared**: multi-select nannies (available ones first, matching live-in/day), "Copy for WhatsApp".
2. **Shortlist and interviews**: shortlisted tick, interview date/time and status, "Customer approved" / "Not selected" with feedback.
3. **Placement**: approved nanny, start date, site address. The nanny is marked placed (and a replaced nanny freed); if the case came from a website booking, `bookings/{id}.assignment` is set for the customer app.

Data: `servicing/{caseId}` (customer can read their own case in the app, by phone; nanny details on it are copied profiles without phone, except the placed nanny), internal notes in `servicing/{caseId}/internal/notes` (staff only).

## Nannies (servicing team + admins)

`/nannies`: caregiver database (`nannies`). Add/edit profiles; admins can import a CSV (columns are matched on screen) and export. Placement status is set from the servicing case.

## Payments (admins only)

`/payments` (the **Payments** link in the header, shown only to admins). Date filter has the same choices as Cashfree (Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, Custom range), plus Today / Last 7 days / This month cards with a comparison to the previous period. Three tabs:

- **Transactions**: Firestore `cashfreePayments`, filled by the `cashfreeWebhook` Cloud Function (website repo) since it went live on 11 Nov 2026. Totals count successful payments, as Cashfree does. Amount bars + count line, list with search, status filter and CSV.
- **Refunds**: Firestore `cashfreeRefunds`. New refunds arrive by webhook once **Refund** is ticked on the Cashfree webhook endpoint. "Import from Cashfree" fetches refunds for payments from the last 120 days (`POST /api/cashfree/refunds/import`). Cancelled refunds aren't counted in totals.
- **Settlements**: live from Cashfree (`GET /api/cashfree/settlements`, which calls Cashfree's Get All Settlements), so they always match the Cashfree dashboard. Latest settlements, amount settled, charges, adjustments, pending, and the list with UTRs.

The `/api/cashfree/*` routes run on the server, check that the caller is an admin (Firebase ID token), and use the website's Cashfree keys from Secret Manager. Give this backend access once:

```bash
firebase apphosting:secrets:grantaccess CASHFREE_CLIENT_ID,CASHFREE_CLIENT_SECRET --backend heynanny-ops
```

Firestore rules allow only `admin` to read `cashfreePayments` and `cashfreeRefunds`. Test (sandbox) payments are hidden unless "Include test payments" is ticked.

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
npm run role -- priya@heynanny.in sales      # Enquiries only ("ops" is the old name; --sync renames)
npm run role -- ravi@heynanny.in servicing   # Servicing (everything) + Nannies (view, add, edit)
npm run role -- asha@heynanny.in supply      # Nannies only (view, add, edit)
npm run role -- meera@heynanny.in manager    # everything except Payments; can import nannies
npm run role -- sandeep@heynanny.in admin    # everything (Payments, export, nanny documents, deletes)
npm run role -- priya@heynanny.in none     # remove access
npm run role -- --list                     # who has access
npm run role -- --sync                     # rebuild the "Assigned to" list from current roles
```

Every role change also updates the Firestore `staff` collection, which fills the **Assigned to** dropdown (name from their Google account). Run `--sync` once after first setting this up, so people who already have access appear.

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
