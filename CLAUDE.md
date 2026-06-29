# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # dev server at http://localhost:3000
npm run build    # production build
npm test         # run tests (Jest + React Testing Library)
npm test -- --testPathPattern=App  # run a single test file
```

## Project Overview

**TrueCell Electronics Trading LLC** — a mobile-first invoice generator PWA for internal salespersons. Designed as a phone-width (max 420px) single-page app. No backend; all state lives in `localStorage` and Zustand.

## Application Flows

### Flow 1 — Login (`/`)
- Sales reps log in with **name + secret code** (no username/password registration)
- Credentials are validated against `SALES_REPS` in `src/api/salesRepApi.ts` (replace with real API when backend exists)
- On success, `loggedInRep` is saved to the Zustand store (persisted) and user is redirected to `/history`
- If already logged in, `/` auto-redirects to `/history`

### Flow 2 — History (`/history`)
- Dashboard showing all invoices created by the logged-in rep (filtered by `salesRepresentative === loggedInRep.name`)
- Displays stats: total invoice count + total amount
- Each invoice card: invoice number, status badge (`PAID` / `PENDING` / `Deposit`), customer, amount, Edit / Delete / Share actions
- Edit → navigates to `/invoice/new` with `{ state: { invoice, isEditing: true } }`
- Delete → `ConfirmDialog` → `deleteFromHistory`
- Share → generates PDF from a hidden `InvoicePrintView` (same pattern as create page) → Web Share API or WhatsApp fallback
- FAB `+` → navigates to `/invoice/new`

### Flow 3 — Create / Edit Invoice (`/invoice/new`)
- Form: Customer Name, Items table (Model / Qty / Price), Deposit Amount, Full Payment Received checkbox
- Three footer actions:
  - **Preview** — saves to `store.currentInvoice`, navigates to `/invoice/preview` (does NOT add to history)
  - **Save** — generates invoice number if not set, saves to store + `invoiceHistory`, disables button after first save
  - **Share** — validates form, saves to history, generates PDF, Web Share API → WhatsApp fallback
- When `isEditing` (from location state): pre-fills form, auto-save draft is skipped, Save calls `updateInHistory` instead of `addToHistory`
- A hidden `InvoicePrintView` is rendered off-screen so `html2canvas` can capture it for PDF

### Flow 4 — Invoice Preview (`/invoice/preview`)
- Reads invoice from `store.currentInvoice`, falls back to `localStorage` via `last-invoice` key
- Renders `InvoicePrintView` with Download / Share / Print actions

## Architecture

### Routing (`src/routes/AppRoutes.tsx`)
- `/` → `LoginPage` (redirects to `/history` if authenticated)
- `/history` → `HistoryPage` (protected)
- `/invoice/new` → `CreateInvoicePage` (protected)
- `/invoice/preview` → `InvoicePreviewPage` (protected)
- `ProtectedRoute` wraps guarded routes; redirects unauthenticated users to `/`

### State Management (`src/store/invoiceStore.ts`)
Zustand store with `persist` middleware (key: `invoice-store`). Holds:
- `loggedInRep` — `{ id, name, code } | null` — persisted; gates all protected routes
- `selectedRepresentative` — kept in sync with `loggedInRep.name`
- `currentInvoice` — last invoice passed to preview page
- `invoiceHistory` — all saved invoices (all reps); persisted

### Invoice Data Flow
1. `CreateInvoicePage` uses `react-hook-form` + `useFieldArray` for the items table.
2. On every keystroke, `watch()` auto-saves a draft to `localStorage` (`invoice-draft`) — skipped in edit mode.
3. Totals are computed live via `useInvoiceCalculations` hook (`qty × price` sum, no tax).
4. `paymentStatus` is derived on submit: `paymentReceived → 'paid'`, `depositAmount > 0 → 'deposit'`, else `'pending'`.
5. `InvoicePreviewPage` reads from Zustand store first; falls back to `localStorage` via `last-invoice` key.

### Invoice Numbering (`src/utils/invoiceNumber.ts`)
Format: `{XX}-{DD}-{MM}-{YY}` where XX = first 2 uppercase chars of customer name.
If a collision exists in the history, appends `-2`, `-3`, etc.
`generateInvoiceNumber(customerName, existingNumbers[])` — pass the current `invoiceHistory` numbers.

### PDF Generation (`src/utils/pdf.ts`)
Uses `html2canvas` to screenshot a rendered `InvoicePrintView` DOM node, then writes it into a `jsPDF` A4 page.
Both `CreateInvoicePage` and `HistoryPage` render a hidden `InvoicePrintView` off-screen (opacity 0, z-index -1) that is always in the DOM, allowing `html2canvas` to capture it without a page transition.

### Share Flow
Tries `navigator.share()` (Web Share API, works on Android Chrome) with the PDF file. Falls back to opening the PDF in a new tab + opening `wa.me` with a pre-built text message (`buildWhatsappMessage`).

### Sales Reps (`src/api/salesRepApi.ts`)
Hardcoded `SALES_REPS` array with `{ id, name, code }`. `validateLogin(name, code)` does case-insensitive name matching. Replace with a real API call when a backend is added.

### Key Types (`src/types/invoice.ts`)
```ts
Invoice { invoiceNumber, customerName, salesRepresentative, invoiceDate, items[], subtotal, total, depositAmount?, paymentStatus? }
InvoiceItem { id, model, qty?, price? }
paymentStatus: 'paid' | 'pending' | 'deposit'
```

### CSS Architecture
Single global stylesheet at `src/App.css`. All layout uses CSS custom properties defined in `:root`. The app is constrained to `max-width: 420px; margin: 0 auto` on screens ≥ 600px. Page layout uses `.page` (flex column, `height: 100vh`) with a fixed header, scrollable `main`, and a fixed footer.

### Path Aliases
`tsconfig.json` sets `"baseUrl": "src"`, so all imports resolve from `src/` (e.g. `import { useInvoiceStore } from 'store/invoiceStore'`).

## Design System
- Primary color: `#8e1f5c` (deep magenta)
- Accent: `#ff8a00` (orange — deposit bar, WhatsApp button, paid status)
- Status badges: paid → `#27ae60` (green), pending → `#777` (grey), deposit → `#ff8a00` (orange)
- All assets live in `src/assets/` (SVG + PNG pairs); PNG versions are what the components import
