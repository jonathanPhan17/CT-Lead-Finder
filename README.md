# CT Lead Finder

A React + TypeScript tool for finding Principal Investigator (PI) contact information from [ClinicalTrials.gov](https://clinicaltrials.gov) by location, and managing cold email outreach to clinical trial sites.

## Features

### Search
- **Location search** — geocoded address input with real-time autocomplete (OpenStreetMap/Nominatim)
- **Radius filter** — search within 1–100 miles of any location
- **Auto-pagination** — fetches up to 20 pages of results automatically, with early stopping
- **PI contacts** — extracts name, email, phone, role from trial location contacts within radius only
- **Session caching** — results cached in sessionStorage; navigating away and back is instant

### Results
- **Card-based results** — grouped by facility/site, PIs sorted to top
- **Sort options** — by outreach priority (PIs with email first), facility, condition, sponsor
- **Filters** — show only contacts with email, or PIs only
- **Search** — filter results by name, email, facility, condition, or sponsor
- **CSV export** — download filtered results
- **Dark/light mode** — persisted to localStorage

### Outreach
- **Cart system** — select contacts and add them to a floating outreach cart
- **Gmail integration** — OAuth via Google Identity Services, sends directly from your Gmail
- **Email composer** — template variables: `{{firstName}}`, `{{fullName}}`, `{{trialTitle}}`, `{{condition}}`, `{{facility}}`, `{{nctId}}`, `{{phase}}`
- **Personalization** — auto-fills template variables per contact
- **Batch sending** — send to all selected contacts with 300ms throttle
- **Contacted badges** — previously emailed contacts are visually flagged in results

### Outreach History (CRM)
- **History page** — tracks every email sent with contact, trial, subject, and body preview
- **Status tracking** — No Reply, Replied, Interested, Not Interested, Wrong Contact
- **Notes** — inline editable notes per contact
- **Filters** — search and filter by status
- **Stats** — total sent, replied, interested counts
- **CSV export** — export history records
- **Persistent** — stored in localStorage, survives page refresh

## Tech Stack

- React 19 + TypeScript + Vite 6
- Tailwind CSS v4 + shadcn/ui
- React Router v7
- ClinicalTrials.gov v2 REST API
- Nominatim geocoding API (OpenStreetMap)
- Google Identity Services (Gmail OAuth)
- Gmail REST API

## Getting Started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in your values:

```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
VITE_API_URL=your-outreach-history-api-url
VITE_MAX_PAGES=20
```

The dev server proxies API requests to avoid CORS:
- `/nominatim-proxy` → `https://nominatim.openstreetmap.org`
- `/ct-proxy` → `https://clinicaltrials.gov`

## Build

```bash
npm run build
```

## Project Structure

```
src/
  components/
    Header.tsx              # Nav bar with Search / Outreach History links + dark mode
    SearchPanel.tsx         # Location input + radius selector
    ResultsTable.tsx        # Card grid, filters, sort, search, cart, export
    LocationInput.tsx       # Autocomplete address input
    OutreachCart.tsx        # Floating cart for selected contacts
    OutreachComposer.tsx    # Gmail OAuth + email template composer
    OutreachHistory.tsx     # CRM history page with status tracking
  services/
    clinicalTrials.ts       # ClinicalTrials.gov v2 API client + deduplication
    geocoding.ts            # Nominatim geocoding + autocomplete
    gmail.ts                # Google Identity Services OAuth + Gmail send
    outreachHistory.ts      # localStorage CRUD for outreach records
  types/
    index.ts                # ContactRow, OutreachRecord, OutreachStatus types
  App.tsx                   # Root layout, search state, URL params, sessionStorage cache
```
