# CT Lead Finder

A React + TypeScript internal tool for finding Principal Investigator (PI) contact information from [ClinicalTrials.gov](https://clinicaltrials.gov) by location. Built for GTM cold email outreach to clinical trial sites.

## Features

- **Location search** — geocoded address input with real-time autocomplete (OpenStreetMap/Nominatim)
- **Radius filter** — search within 1–100 miles of any location
- **PI contacts** — extracts name, email, role from trial sites within range
- **Card-based results** — grouped by facility/site, PIs sorted to top
- **Filters** — show only contacts with email, or PIs only
- **CSV export** — copy to clipboard or download filtered results
- **Pagination** — 15 cards/page, loads more from API on demand
- **Dark/light mode** — teal-based theme, persisted to localStorage

## Tech Stack

- React 19 + TypeScript + Vite 6
- Tailwind CSS v4 + shadcn/ui
- React Router v6
- ClinicalTrials.gov v2 REST API
- Nominatim geocoding API (OpenStreetMap)
- DM Sans Variable font

## Getting Started

```bash
npm install
npm run dev
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
    Header.tsx          # Nav bar with logo + dark mode toggle
    SearchPanel.tsx     # Location input + radius selector
    ResultsTable.tsx    # Card grid, filters, pagination, export
    LocationInput.tsx   # Autocomplete address input
  services/
    clinicalTrials.ts   # ClinicalTrials.gov v2 API client
    geocoding.ts        # Nominatim geocoding + autocomplete
  types/
    index.ts            # ContactRow type
  App.tsx               # Root layout, search state, URL params
```
