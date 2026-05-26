# TallyPadi API Documentation

Updated: 2026-05-26

This document describes the current TallyPadi API surface as mounted by `src/server.ts`.

## Base URL

All application API routes are prefixed with `/api`.

Production example:

```text
https://tallypadi.com/api/login
```

Local development example:

```text
http://127.0.0.1:5000/api/login
```

## Authentication

Protected user routes require a JWT bearer token.

```http
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

Normal authenticated users may be `OWNER` or `STAFF`. Admin routes additionally require an admin-capable account. Support-agent routes use the support login token.

Most JSON responses use one of these shapes:

```json
{ "success": true, "...": "..." }
```

```json
{ "error": "Human readable error" }
```

## Rate Limits And Caching

- General `/api/*` routes: 100 requests per 15 minutes per IP, backed by Redis when configured.
- Login routes: stricter IP and identifier limits.
- Register route: 5 accounts per hour per IP.
- Upload presign route: 30 requests per 15 minutes per user/IP.
- Marketplace public routes: 600 requests per minute per IP and CDN/browser friendly cache headers.
- Public marketplace responses are served from the materialized `MarketplaceListing` read model and Redis response cache where available.

## Auth

### Owner Registration

`POST /api/register`

Creates or updates an OTP-pending owner account. Registration now accepts an optional referral code from `/register?ref=CODE`.

Body:

```json
{
  "phoneNumber": "08012345678",
  "email": "owner@example.com",
  "businessName": "My Shop",
  "password": "secret_password",
  "countryCode": "NG",
  "closingTime": "20:00",
  "language": "English",
  "referralCode": "ABC123"
}
```

Response:

```json
{
  "success": true,
  "requiresOtp": true,
  "referralApplied": true,
  "message": "Verification Code sent to your email address."
}
```

### Verify Registration OTP

`POST /api/register/verify`

Body:

```json
{
  "identifier": "08012345678",
  "otp": "123456"
}
```

Response includes `token` and `user`.

### Owner Login

`POST /api/login`

Body:

```json
{
  "identifier": "08012345678",
  "password": "secret_password"
}
```

`identifier` may be phone number or email.

### Staff OTP Login

`POST /api/login/staff/request-otp`

Body:

```json
{
  "identifier": "08087654321"
}
```

`POST /api/login/staff`

Body:

```json
{
  "identifier": "08087654321",
  "otp": "123456"
}
```

Response includes `token` and staff `user`.

### Password Reset

`POST /api/auth/forgot-password`

Body:

```json
{
  "identifier": "08012345678"
}
```

`POST /api/auth/reset-password`

Body:

```json
{
  "identifier": "08012345678",
  "otp": "123456",
  "newPassword": "new_secret"
}
```

### Change Phone Number

Requires owner/staff auth.

`POST /api/auth/change-phone`

Body:

```json
{
  "newPhoneNumber": "2348012345678"
}
```

`POST /api/auth/change-phone/verify`

Body:

```json
{
  "otp": "123456"
}
```

### Push Subscription

`POST /api/shop/push/subscribe`

Requires auth. Stores a browser push subscription for the logged-in user.

## Dashboard

`GET /api/dashboard`

Requires auth.

Returns shop/user details, stats, sales chart data, recent transactions, top items, expenses, and inventory summary data for the dashboard.

## Inventory

All inventory routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/inventory` | List inventory items |
| GET | `/api/inventory/categories` | List inventory categories |
| GET | `/api/inventory/:id` | Get one inventory item |
| POST | `/api/inventory` | Create an inventory item |
| POST | `/api/inventory/bulk-parse` | Parse pasted/uploaded bulk inventory text |
| POST | `/api/inventory/bulk-save` | Save parsed bulk inventory items |
| PUT | `/api/inventory/:id` | Update an inventory item |
| DELETE | `/api/inventory/:id` | Delete an inventory item |

Create/update body example:

```json
{
  "name": "Rice 50kg",
  "stock": 20,
  "quantity": 20,
  "price": 50000,
  "costPrice": 45000,
  "category": "Grains",
  "description": "Premium local rice",
  "image": "https://example.com/rice.jpg"
}
```

## Uploads

`POST /api/uploads/presign`

Requires auth. Returns a presigned Cloudflare R2 upload target for images.

Body:

```json
{
  "mime": "image/jpeg",
  "ext": "jpg"
}
```

## Sales And Register

All sales routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/sales` | Record a sale |
| GET | `/api/sales` | List sales history |
| GET | `/api/sales/report` | Generate sales report |
| GET | `/api/sales/:saleId/receipt` | Generate sale receipt PDF |
| POST | `/api/sales/close-register` | Close current register/session |

Record sale body example:

```json
{
  "paymentMethod": "CASH",
  "items": [
    {
      "itemId": "inventory_id",
      "quantity": 2,
      "price": 50000
    }
  ]
}
```

Common sales query params:

```text
startDate=YYYY-MM-DD
endDate=YYYY-MM-DD
```

## Customers

All customer CRM routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |

## Debtors

All debtor routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/debtors` | List debtors |
| POST | `/api/debtors` | Create debtor |
| PUT | `/api/debtors/:id` | Update debtor |
| DELETE | `/api/debtors/:id` | Delete debtor |
| POST | `/api/debtors/payment` | Record debtor payment |

Create debtor body example:

```json
{
  "displayName": "Emeka",
  "initialDebt": 5000,
  "initialProduct": "Opening balance"
}
```

Payment body example:

```json
{
  "debtorId": "debtor_id",
  "amount": 2500
}
```

## Orders

All order routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/orders` | List orders |
| POST | `/api/orders` | Create order |
| GET | `/api/orders/:id` | Get order |
| PUT | `/api/orders/:id` | Update order |
| DELETE | `/api/orders/:id` | Delete order |

## Invoices

All invoice routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/invoices` | List invoices |
| POST | `/api/invoices` | Create invoice |
| GET | `/api/invoices/:id` | Get invoice |
| GET | `/api/invoices/:id/pdf` | Generate invoice PDF |
| PUT | `/api/invoices/:id` | Update invoice status |
| DELETE | `/api/invoices/:id` | Delete invoice |

## Expenses

All expense routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/expenses` | List expenses |
| GET | `/api/expenses/categories` | List expense categories |
| POST | `/api/expenses` | Create expense |
| DELETE | `/api/expenses/:id` | Delete expense |

Create expense body example:

```json
{
  "amount": 2000,
  "description": "Fuel",
  "category": "Utilities",
  "date": "2026-05-26"
}
```

## Owner Settings And Staff

### Owner Settings

`PUT /api/settings`

Requires auth. Updates the logged-in user's shop settings and selected account preferences.

Body example:

```json
{
  "businessName": "My Updated Shop",
  "settings": {
    "closingTime": "21:00",
    "language": "English",
    "pdfReportsEnabled": true,
    "staffTransactionReport": true,
    "smartMatchingEnabled": true,
    "location": {
      "country": "NG",
      "state": "Lagos",
      "city": "Ikeja",
      "address": "12 Market Road"
    },
    "staffPermissions": {
      "canViewDashboard": true,
      "canManageInventory": true,
      "canViewSalesHistory": true,
      "canViewReports": false,
      "canManageCustomers": true,
      "canViewSettings": false
    },
    "utcOffsetMinutes": 60
  }
}
```

### Staff Management

Requires owner auth. Staff management is plan-gated.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/staff` | List staff |
| POST | `/api/staff` | Add staff |
| PUT | `/api/staff/:id` | Update staff |
| DELETE | `/api/staff/:id` | Remove staff |

Add staff body:

```json
{
  "phoneNumber": "08087654321",
  "name": "Ada"
}
```

## Shop And Marketplace

### Authenticated Shop Owner Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/shop/me` | Get the current shop profile |
| PUT | `/api/shop/me` | Update shop settings/profile |
| GET | `/api/shop/verification` | Get current seller verification |
| POST | `/api/shop/verification/upload-url` | Get upload URL for verification documents |
| POST | `/api/shop/verification` | Submit seller verification |
| POST | `/api/shop/push/subscribe` | Save push subscription |

### Public Shop Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/shop/:slug` | Get public shop profile |
| GET | `/api/shop/:slug/products` | List public shop products |
| GET | `/api/shop/:slug/products/:productId` | Get one public shop product |
| POST | `/api/shop/:slug/visit` | Record shop visit |

### Public Marketplace Routes

Marketplace routes are public and use the `MarketplaceListing` read model plus Redis response caching where available.

`GET /api/marketplace`

Query params:

| Param | Values | Default |
| --- | --- | --- |
| `page` | Positive number | `1` |
| `limit` | `1` to `48` | `24` |
| `q` | Search text, max 80 chars | Empty |
| `category` | Category label/id | Empty |
| `state` | State filter | Empty |
| `city` | City filter | Empty |
| `sort` | `recommended`, `newest`, `price_asc`, `price_desc` | `recommended` |

Response includes:

```json
{
  "products": [],
  "categories": [],
  "locations": [],
  "pagination": {
    "page": 1,
    "limit": 24,
    "totalItems": 0,
    "totalPages": 0,
    "hasMore": false
  },
  "appliedFilters": {
    "q": "",
    "category": "",
    "state": "",
    "city": "",
    "sort": "recommended"
  }
}
```

`GET /api/marketplace/products/:productId`

Returns:

```json
{
  "product": {}
}
```

Marketplace cache header:

```text
Cache-Control: public, max-age=60, s-maxage=180, stale-while-revalidate=300
```

## Ads, Boosts, And Ads Wallet

All `/api/ads/*` routes require auth.

### Ads Wallet

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/ads/wallet/fund` | Initialize ads wallet funding |
| POST | `/api/ads/wallet/verify/:reference` | Verify Paystack wallet funding |

Funding body:

```json
{
  "amount": 10000
}
```

The wallet funding verification flow also triggers referral rewards when the referred user's first qualifying funding meets current admin referral settings.

### Plans And Assets

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/ads/plans` | Get ad boost plans |
| PUT | `/api/ads/plans` | Update ad boost plans |
| POST | `/api/ads/assets/upload-url` | Get upload URL for ad creative asset |

### Campaigns

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/ads/campaigns` | List my ad campaigns |
| POST | `/api/ads/campaigns` | Create campaign |
| GET | `/api/ads/campaigns/:id` | Get campaign |
| POST | `/api/ads/campaigns/:id/top-up` | Add budget to campaign |
| POST | `/api/ads/campaigns/:id/pause` | Pause campaign |
| POST | `/api/ads/campaigns/:id/resume` | Resume campaign run |
| POST | `/api/ads/campaigns/:id/stop` | Stop campaign |
| POST | `/api/ads/campaigns/:id/change-requests` | Request targeting/creative change |
| GET | `/api/ads/campaigns/:id/metrics` | Get campaign metrics |
| POST | `/api/ads/campaigns/:id/metrics/sync` | Sync campaign metrics from providers |
| POST | `/api/ads/boost/:productId` | Legacy/simple product boost |

Create campaign body example:

```json
{
  "productId": "inventory_id",
  "planId": "plan_id",
  "providers": ["TALLYPADI_MARKETPLACE_BOOST", "META_ADS"],
  "budget": 15000,
  "targetAudience": "Retail buyers in Lagos",
  "targetLocation": {
    "country": "NG",
    "state": "Lagos",
    "city": "Ikeja"
  },
  "adDetails": {
    "brief": "Promote this product",
    "keywords": ["rice", "wholesale"],
    "adDescription": "Fresh stock available now"
  },
  "adTermsAccepted": true
}
```

## Referrals

Referral links use:

```text
https://tallypadi.com/register?ref=CODE
```

Registration should submit `referralCode` from the `ref` query parameter.

### My Referral Summary

`GET /api/referrals/me`

Requires owner auth.

Returns:

```json
{
  "referralCode": "ABC123",
  "referralLink": "https://tallypadi.com/register?ref=ABC123",
  "totals": {
    "totalReferrals": 0,
    "pendingReferrals": 0,
    "successfulReferrals": 0,
    "totalEarned": 0,
    "totalEarnedMinor": 0,
    "currency": "NGN"
  },
  "transactions": []
}
```

Referral payout rules:

- Only owners can refer.
- The referrer must not be suspended.
- Self-referral is rejected.
- Referral becomes pending after registration and OTP verification.
- Reward is paid once, on the referred user's first qualifying ads-wallet funding.
- Admin settings control whether referrals are enabled, the minimum funding amount, and reward percentage.

## Payments And Webhooks

### User Payment

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/payment/initialize` | Initialize subscription/payment |
| GET | `/api/payment/verify/:reference` | Verify payment reference |

Initialize payment body:

```json
{
  "email": "owner@example.com",
  "phoneNumber": "08012345678",
  "targetPlan": "TYCOON",
  "duration": 1
}
```

`targetPlan` can be `OGA_BOSS` or `TYCOON`. `duration` supports `1`, `6`, or `12` months.

### Paystack Webhook

`POST /api/webhook/paystack`

Paystack webhook endpoint. The server stores raw request body for signature-capable webhook handling.

## Activities

All activity routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/activities` | List activity feed |
| GET | `/api/activities/unread-count` | Count unread activities |
| PATCH | `/api/activities/read-all` | Mark all activities read |
| PATCH | `/api/activities/:id/read` | Mark one activity read |

## HQ And Branches

All HQ routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/hq/branches` | List branches |
| GET | `/api/hq/dashboard` | Get HQ dashboard |
| POST | `/api/hq/transfer` | Transfer stock between branches |
| POST | `/api/hq/staff/promote` | Promote staff to HQ manager |
| POST | `/api/hq/branch` | Create branch |

## Investor

Investor routes require auth and investor privileges.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/investor/dashboard` | Investor dashboard stats |

## Draft Restock Links

Draft routes are public and secured by hard-to-guess draft ids.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/draft/:id` | Get draft restock request |
| GET | `/api/draft/:id/inventory` | Get inventory options for draft |
| POST | `/api/draft/:id/resolve` | Resolve draft |

## Blog

Public blog routes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/blog` | List published blog posts |
| GET | `/api/blog/:slug` | Get published blog post |

Admin blog CMS routes are under `/api/admin/blog`.

## Admin

All `/api/admin/*` routes require auth and admin privileges unless noted otherwise. `GET /api/admin/settings` is also mounted publicly in `src/server.ts` before the protected admin router, so clients can read public settings without an admin token.

### Analytics And Settings

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/analytics` | System analytics |
| GET | `/api/admin/settings` | Get global settings |
| PUT | `/api/admin/settings` | Update global settings |

Settings body supports:

```json
{
  "autoSuspendOnJailbreak": true,
  "maxMessageHistory": 500,
  "maxStaffAccounts": 5,
  "whatsappUrl": "https://wa.me/...",
  "smtp": {
    "host": "smtp.example.com",
    "port": 587,
    "secure": false,
    "user": "mailer@example.com",
    "pass": "secret",
    "from": "TallyPadi <mailer@example.com>"
  },
  "adsPlans": [
    {
      "id": "boost_5_days",
      "durationDays": 5,
      "price": 50000,
      "label": "5 Days Boost"
    }
  ],
  "referralProgram": {
    "enabled": true,
    "minimumFundingAmount": 10000,
    "rewardPercentage": 10
  }
}
```

### Admin Users, Staff, And Investors

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/users` | List users |
| GET | `/api/admin/users/:id/details` | User deep dive |
| PUT | `/api/admin/users/:id` | Manage user actions and plan/status changes |
| POST | `/api/admin/users/:id/ads-wallet/top-up` | Top up user ads wallet |
| DELETE | `/api/admin/users/:id/inventory/:itemId` | Delete one user's inventory item |
| DELETE | `/api/admin/users/:id/inventory` | Clear a user's inventory |
| POST | `/api/admin/users/:ownerId/staff` | Add staff to an owner account |
| POST | `/api/admin/staff/cleanup` | Cleanup staff hierarchy |
| DELETE | `/api/admin/staff/:staffId` | Delete staff |
| PUT | `/api/admin/staff/:staffId/unlink` | Unlink staff from owner |
| GET | `/api/admin/investors` | List investors |
| POST | `/api/admin/investors` | Create investor |
| DELETE | `/api/admin/investors/:id` | Delete investor |

### Admin Referrals

`GET /api/admin/referrals`

Query params:

```text
page=1
limit=50
status=PENDING_VERIFICATION|PENDING_FUNDING|REWARDED|INELIGIBLE
search=phone-or-name-or-code-or-reference
```

Returns referral transaction logs with referrer, referred user, status, funding amount, reward amount, Paystack reference, and wallet transaction ids.

### Admin Ads Review

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/ads` | List admin ad campaigns |
| GET | `/api/admin/ads/campaigns` | List admin ad campaigns |
| GET | `/api/admin/ads/provider-readiness` | Provider automation readiness |
| GET | `/api/admin/ads/campaigns/:id` | Get ad campaign |
| POST | `/api/admin/ads/campaigns/:id/approve` | Approve campaign |
| POST | `/api/admin/ads/campaigns/:id/reject` | Reject campaign |
| POST | `/api/admin/ads/campaigns/:id/pause` | Pause campaign |
| POST | `/api/admin/ads/campaigns/:id/resume` | Resume campaign |
| POST | `/api/admin/ads/campaigns/:id/complete` | Complete campaign |
| POST | `/api/admin/ads/provider-campaigns/:id/status` | Update provider campaign status |
| POST | `/api/admin/ads/provider-campaigns/:id/metrics` | Update provider campaign metrics |
| POST | `/api/admin/ads/provider-campaigns/:id/refund` | Refund provider campaign |
| POST | `/api/admin/ads/provider-campaigns/:id/reallocate` | Reallocate provider campaign budget |
| POST | `/api/admin/ads/provider-campaigns/:id/resubmit` | Resubmit provider campaign |

Legacy admin ad action aliases still exist:

```text
PATCH /api/admin/ads/:id/approve
PATCH /api/admin/ads/:id/reject
PATCH /api/admin/ads/:id/complete
```

### Admin Marketplace Seller Verification

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/marketplace-verifications` | List seller verifications |
| GET | `/api/admin/marketplace-verifications/:id` | Get verification |
| POST | `/api/admin/marketplace-verifications/:id/approve` | Approve seller |
| POST | `/api/admin/marketplace-verifications/:id/reject` | Reject seller |
| POST | `/api/admin/marketplace-verifications/:id/request-reverification` | Request reverification |
| DELETE | `/api/admin/marketplace-verifications/:id` | Delete verification |

### Admin Blog CMS

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/blog` | List blog posts |
| POST | `/api/admin/blog` | Create blog post |
| PUT | `/api/admin/blog/:id` | Update blog post |
| POST | `/api/admin/blog/:id/publish` | Publish blog post |
| POST | `/api/admin/blog/:id/unpublish` | Unpublish blog post |
| DELETE | `/api/admin/blog/:id` | Delete blog post |

### Admin Tools

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/admin/broadcast` | Send broadcast message/email |
| GET | `/api/admin/email-templates` | List email templates |
| POST | `/api/admin/email-templates` | Create email template |
| DELETE | `/api/admin/email-templates/:id` | Delete email template |
| GET | `/api/admin/fx` | Get FX rates |
| POST | `/api/admin/chat/send` | Send admin chat message |
| GET | `/api/admin/queues` | Bull Board queue dashboard |

## Support

### Support Admin

Requires support admin authorization.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/support/admin/agents` | Create support agent |
| GET | `/api/support/admin/agents` | List support agents |
| PUT | `/api/support/admin/agents/:id` | Update support agent |
| DELETE | `/api/support/admin/agents/:id` | Delete support agent |
| GET | `/api/support/admin/tickets` | List support tickets |
| GET | `/api/support/admin/tickets/:ticketId/messages` | Get ticket messages |
| POST | `/api/support/admin/tickets/:ticketId/assign` | Assign ticket |
| POST | `/api/support/admin/tickets/:ticketId/send` | Send ticket message |
| DELETE | `/api/support/admin/tickets/:ticketId` | Delete ticket |

### Support Agent

`POST /api/support/auth/login`

Body:

```json
{
  "email": "agent@example.com",
  "password": "secret"
}
```

Protected agent routes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/support/me` | Get agent profile/status |
| POST | `/api/support/status` | Set online/offline status |
| POST | `/api/support/push/subscribe` | Subscribe agent push notifications |
| GET | `/api/support/users` | List users for support |
| GET | `/api/support/users/:userId/details` | User deep dive |
| PUT | `/api/support/users/:userId` | Support manage user |
| GET | `/api/support/tickets` | List assigned/available tickets |
| GET | `/api/support/tickets/:ticketId/messages` | Get messages |
| POST | `/api/support/tickets/:ticketId/send` | Send message |
| POST | `/api/support/tickets/:ticketId/close` | Close ticket |
| POST | `/api/support/tickets/:ticketId/pickup` | Pick up ticket |
| POST | `/api/support/tickets/:ticketId/escalate` | Escalate ticket |
| DELETE | `/api/support/tickets/:ticketId` | Delete ticket |

### Support Webhook

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/support/webhook` | Verify support webhook |
| POST | `/api/support/webhook` | Receive support webhook event |

## Webhooks

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/whatsapp` | Verify Meta WhatsApp webhook |
| POST | `/api/whatsapp` | Receive WhatsApp messages |
| POST | `/api/webhook/paystack` | Receive Paystack events |
| GET | `/api/webhook/ads/meta` | Verify Meta Ads webhook |
| POST | `/api/webhook/ads/meta` | Receive Meta Ads webhook events |

Meta webhook POST routes verify `x-hub-signature-256` in production.

## Health And Static Files

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health/queue` | Queue health summary |
| POST | `/api/health/retry` | Retry failed queue jobs |
| GET | `/reports/*` | Static report files |
| GET | `/api/reports/*` | API-prefixed static report files |
| GET | `/uploads/*` | Static uploaded files |

## Notes For Mobile/Web Clients

- Prefer `POST` admin ad action endpoints under `/api/admin/ads/campaigns/:id/...`.
- Use `referralCode` during registration when a `ref` query param is present.
- Do not use `cache: "no-store"` for anonymous marketplace browsing unless freshness is more important than scale.
- Marketplace listing freshness is intentionally eventual, generally 1 to 5 minutes, because public browsing uses a read model and cache.
- Paystack wallet funding verification is idempotent; clients can safely retry verification for the same reference.
