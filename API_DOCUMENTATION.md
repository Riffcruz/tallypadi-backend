# InventoryBot API Documentation

This documentation provides details on the API endpoints available for building the mobile application (Owner, Staff, and Agent Dashboards).

## Base URL
All API requests should be prefixed with `/api`.
Example: `https://api.tallypadi.com/api/login`

## Authentication
All protected routes require a Bearer Token in the `Authorization` header.
`Authorization: Bearer <TOKEN>`

### 1. Login (Owner)
**POST** `/api/login`
- **Body:**
  ```json
  {
    "identifier": "08012345678", // Phone or Email
    "password": "secret_password"
  }
  ```
- **Response:** Returns JWT token and user profile.

### 2. Register (Owner)
**POST** `/api/register`
- **Body:**
  ```json
  {
    "phoneNumber": "08012345678",
    "email": "owner@example.com",
    "businessName": "My Shop",
    "password": "secret_password",
    "countryCode": "NG"
  }
  ```

### 3. Staff Login (OTP Flow)
**Step 1: Request OTP**
**POST** `/api/login/staff/request-otp`
- **Body:**
  ```json
  {
    "identifier": "08087654321" // Staff Phone
  }
  ```

**Step 2: Verify OTP**
**POST** `/api/login/staff`
- **Body:**
  ```json
  {
    "identifier": "08087654321",
    "otp": "123456"
  }
  ```
- **Response:** Returns JWT token and staff profile.

### 4. Password Management
- **POST** `/api/auth/forgot-password` (Body: `{ "identifier": "phone" }`)
- **POST** `/api/auth/reset-password` (Body: `{ "identifier": "phone", "otp": "code", "newPassword": "new_pass" }`)

---

## Dashboard (Owner & Staff)
**GET** `/api/dashboard`
- **Headers:** `Authorization: Bearer <TOKEN>`
- **Response:** Returns comprehensive dashboard data including:
  - User/Shop details (Name, Plan, Subscription, Currency)
  - `stats`: Revenue, Items Sold, Expenses, Debtors Count, Pending Orders, Visits.
  - `salesChart`: Daily revenue for the last 7 days.
  - `transactions`: List of recent transactions.
  - `topItems`: Top selling products.
  - `expenses`: Recent expenses.
  - `inventory`: Full inventory list (legacy support).

---

## Inventory Management
**GET** `/api/inventory`
- List all inventory items.

**GET** `/api/inventory/:id`
- Get details of a single item.

**POST** `/api/inventory`
- **Body:**
  ```json
  {
    "name": "Rice 50kg",
    "stock": 20,
    "price": 50000,
    "costPrice": 45000,
    "category": "Grains",
    "image": "https://..." // Optional
  }
  ```

**PUT** `/api/inventory/:id`
- Update item details. Same body as POST.

**DELETE** `/api/inventory/:id`
- Delete an item.

---

## Sales & Transactions
**GET** `/api/sales`
- Get sales history.
- **Query Params:** `startDate=YYYY-MM-DD`, `endDate=YYYY-MM-DD`

**POST** `/api/sales`
- Record a new sale.
- **Body:**
  ```json
  {
    "paymentMethod": "CASH", // or TRANSFER, POS
    "items": [
      {
        "itemId": "inventory_id_123",
        "quantity": 2,
        "price": 50000
      }
    ]
  }
  ```

**GET** `/api/sales/:saleId/receipt`
- Download PDF receipt for a specific sale.

**GET** `/api/sales/report`
- Download sales report PDF (Tycoon Plan only).
- **Query Params:** `startDate`, `endDate`

---

## Debtors (Credit Management)
**GET** `/api/debtors`
- List all debtors with their total debt balance.

**POST** `/api/debtors`
- Create a new debtor.
- **Body:**
  ```json
  {
    "displayName": "Emeka",
    "initialDebt": 0,
    "initialProduct": "Opening Balance"
  }
  ```

**POST** `/api/debtors/payment`
- Record a payment received from a debtor.
- **Body:**
  ```json
  {
    "debtorId": "debtor_id_123",
    "amount": 5000
  }
  ```

**PUT** `/api/debtors/:id`
**DELETE** `/api/debtors/:id`

---

## Orders (Job Tracking)
**GET** `/api/orders`
**POST** `/api/orders`
**GET** `/api/orders/:id`
**PUT** `/api/orders/:id`
**DELETE** `/api/orders/:id`

---

## Invoices
**GET** `/api/invoices`
**POST** `/api/invoices`
**GET** `/api/invoices/:id/pdf`
**DELETE** `/api/invoices/:id`

---

## Expenses
**GET** `/api/expenses`
**POST** `/api/expenses`
- **Body:**
  ```json
  {
    "amount": 2000,
    "description": "Fuel for gen",
    "category": "Utilities",
    "date": "2023-10-27"
  }
  ```
**DELETE** `/api/expenses/:id`

---

## Staff Management (Owner Only)
**GET** `/api/staff`
**POST** `/api/staff`
- Add new staff member.
- **Body:** `{ "name": "John", "phoneNumber": "080...", "role": "STAFF" }`
**DELETE** `/api/staff/:id`

---

## Support (Agent App)
**POST** `/api/support/auth/login`
- Agent login.

**GET** `/api/support/me`
- Get agent status and profile.

**POST** `/api/support/status`
- Toggle online status.

**GET** `/api/support/tickets`
- List support tickets.

**POST** `/api/support/tickets/:ticketId/send`
- Reply to a ticket.

**POST** `/api/support/tickets/:ticketId/pickup`
- Assign ticket to self.

---

## Settings
**PUT** `/api/settings`
- Update shop settings (closing time, currency, language).
**PUT** `/api/shop/me`
- Update shop profile (slug, description).

## Uploads
**POST** `/api/uploads/presign`
- Get a presigned URL to upload images (for inventory items).
