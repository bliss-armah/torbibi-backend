# Torbibi — Payment & Payout Flow

## Overview

Torbibi operates as an **aggregator**: the platform collects customer payments into the Torbibi Paystack account, deducts a commission, and transfers the net amount to the shop owner's registered mobile money or bank account.

---

## 1. Prerequisite — Shop Owner Registers Payout Account

Before any payout can be sent, the shop owner must register their payout account once.

**Where:** Dashboard → Settings → "Payout account" section  
**Frontend page:** `/dashboard/settings`  
**API endpoint:** `POST /api/v1/payments/recipients/shop/:shopId`

### Supported account types

| Type | `bankCode` values | Notes |
|---|---|---|
| `mobile_money` | `MTN`, `ATL`, `VOD` | Phone number as account number |
| `ghipss` | Bank code e.g. `GCB` | Bank account transfer |

### What happens when registered
- Paystack validates the account and returns a `recipientCode` (e.g. `RCP_xxxxxxxx`)
- The `TransferRecipient` record is upserted in the DB (one per shop)
- The `recipientCode` is used for all future payouts to that shop

If a shop has **no registered payout account** when a payout job runs, the payout is marked `failed` with reason "Shop has not registered a payout account" and does not retry.

---

## 2. Payment Flow (Customer Pays)

```
Customer fills checkout form
  → POST /api/v1/orders/shop/:shopId
  → Order created (status: pending, paymentStatus: pending)
  → Backend initialises Paystack transaction
  → Returns paymentUrl to frontend
  → Frontend redirects: window.location.href = paymentUrl

Customer pays on Paystack (card / mobile money)
  → Paystack redirects to callback URL:
     /{shopSlug}/checkout/confirmation?orderId=...&orderNumber=...&reference=...

Confirmation page loads
  → Calls POST /api/v1/orders/:orderId/verify-payment?reference=...
  → Backend calls Paystack verify API
  → If success:
       order.status       → confirmed
       order.paymentStatus → paid
       Payment record updated with commission breakdown
       Payout record created (status: pending)
       Payout job enqueued (3s delay)
       SMS sent to buyer (payment confirmation)
       SMS sent to shop owner (new order notification)
  → Page shows "Payment received"
```

### Paystack email for guests
Customers without a Torbibi account (phone-only checkout) get a deterministic placeholder email for Paystack:
```
{digits_only_phone}@checkout.torbibi.com
```
e.g. `0244123456` → `0244123456@checkout.torbibi.com`

If the customer provides their email during checkout, that is used instead.

---

## 3. Payout Flow (Platform Pays Shop Owner)

```
Payout job dequeued by payout worker (concurrency: 2)
  → Fetch Payout record
  → Check status ≠ pending → skip (idempotent)
  → Lookup TransferRecipient by shopId
  → No recipient? → mark payout failed, stop (no retry)
  → Call Paystack Transfer API:
       amount    = netAmount (in pesewas)
       recipient = recipientCode from TransferRecipient
  → Payout status → processing
  → transferCode stored

Paystack processes the transfer (async, minutes to hours)
  → Paystack sends webhook: transfer.success | transfer.failed | transfer.reversed
  → POST /api/v1/orders/webhooks/paystack
  → transfer.success  → payout.status = paid,   paidAt = now
  → transfer.failed   → payout.status = failed,  failureReason = "failed — code: ..."
  → transfer.reversed → payout.status = failed,  failureReason = "reversed — code: ..."
```

### Commission calculation

```
customerPays     = order.total          (pesewas)
commissionRate   = PLATFORM_COMMISSION_RATE env (default: 0.05 = 5%)
commissionAmount = floor(customerPays × commissionRate)
netAmount        = customerPays - commissionAmount   ← shop owner receives this
```

Commission rate and amounts are stored on each `Payment` record at verification time, so historical payouts reflect the rate in effect when the sale occurred.

---

## 4. Payout Statuses

| Status | Meaning |
|---|---|
| `pending` | Created, waiting for the payout worker to initiate transfer |
| `processing` | Transfer initiated with Paystack, waiting for webhook confirmation |
| `paid` | Transfer completed — funds in shop owner's account |
| `failed` | Transfer failed or shop had no registered payout account |

---

## 5. Retry Strategy

| Queue | Attempts | Backoff |
|---|---|---|
| `payment-verify` | 5 | Exponential starting 30s |
| `payout` | 5 | Exponential: 30s, 60s, 120s, 240s, 480s |

Paystack transient errors (network timeouts, 5xx) are retried automatically. A missing `TransferRecipient` is treated as a terminal failure — the payout is marked `failed` immediately without retrying.

---

## 6. Webhook Configuration

Paystack sends two types of webhooks to `POST /api/v1/orders/webhooks/paystack`:

| Event | What it does |
|---|---|
| `charge.success` | Enqueues payment verification job (2s delay for DB write race) |
| `transfer.success` | Marks payout as `paid` |
| `transfer.failed` | Marks payout as `failed` |
| `transfer.reversed` | Marks payout as `failed` |

### Webhook signature
Paystack signs webhooks with your **secret key** using HMAC-SHA512. The backend validates this before processing any event. The `PAYSTACK_WEBHOOK_SECRET` env var is intentionally unset — the code falls back to `PAYSTACK_SECRET_KEY`.

### Setting up in production
In the Paystack dashboard → **Settings → API Keys & Webhooks**, set:
```
Webhook URL: https://your-domain.com/api/v1/orders/webhooks/paystack
```

In **local development**, webhooks cannot reach `localhost`. The confirmation page handles this via the `verifyPayment` endpoint which is called directly from the browser after Paystack's redirect.

---

## 7. Key Files

### Backend
| File | Purpose |
|---|---|
| `src/interface/http/controllers/OrderController.ts` | `create`, `verifyPayment`, `paystackWebhook` |
| `src/interface/http/controllers/PaymentController.ts` | Recipient registration, payout listing |
| `src/infrastructure/payments/PaystackService.ts` | Paystack API wrapper (charge, transfer, verify) |
| `src/infrastructure/queue/workers/payment.worker.ts` | Verifies charge, calculates commission, enqueues payout |
| `src/infrastructure/queue/workers/payout.worker.ts` | Initiates Paystack transfer to shop owner |
| `src/infrastructure/database/repositories/PayoutRepository.ts` | Payout CRUD |
| `src/infrastructure/database/repositories/TransferRecipientRepository.ts` | Recipient upsert / lookup |
| `src/application/payments/use-cases/RegisterTransferRecipient.ts` | Registration logic |
| `prisma/schema.prisma` | `Payment`, `Payout`, `TransferRecipient` models |

### Frontend
| File | Purpose |
|---|---|
| `src/app/(storefront)/[shopSlug]/checkout/page.tsx` | Checkout form → redirects to Paystack |
| `src/app/(storefront)/[shopSlug]/checkout/confirmation/page.tsx` | Calls verifyPayment, shows result |
| `src/app/dashboard/settings/page.tsx` | Payout account registration form |
| `src/lib/api/payment.api.ts` | `registerRecipient`, `getRecipient`, `listPayouts` |
| `src/lib/api/order.api.ts` | `create`, `verifyPayment` |

---

## 8. Environment Variables

```env
PAYSTACK_SECRET_KEY=sk_live_...        # Used for API calls and webhook signature validation
PAYSTACK_PUBLIC_KEY=pk_live_...        # Frontend (not currently used server-side)
PLATFORM_COMMISSION_RATE=0.005          # Platform cut (default 0.5%)
FRONTEND_URL=https://your-domain.com   # Used to build the Paystack callback URL
APP_URL=https://api.your-domain.com    # Backend base URL
```

---

## 9. Known Gaps

- **No SMS when payout completes** — shop owner is not notified when funds land
- **No manual payout retry UI** — failed payouts can only be retriggered by reprocessing the job via BullMQ dashboard or code
- **No reconciliation job** — if a `transfer.success` webhook is never delivered, payout stays `processing` indefinitely
- **No refund flow** — `transfer.reversed` marks payout failed but does not adjust order status or initiate customer refund
