# Faculty Management System

A full-stack faculty and family management application with Excel import/export.

## Stack

- **Backend**: Node.js + Express + Prisma (PostgreSQL)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS

## Setup

### 1. Clone and install dependencies

```bash
# Backend
npm install

# Frontend
cd frontend && npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
```

### 3. Run database migrations and seed

```bash
npm run db:migrate
npm run db:seed
```

Default admin credentials: `admin@faculty.app` / `admin123`

### 4. Start development servers

```bash
# Backend (port 3001)
npm run dev

# Frontend (port 5173) — in a separate terminal
cd frontend && npm run dev
```

## Bug Fixes (v1.0.1)

The following bugs were identified and corrected:

### Backend

1. **`src/routes/dashboard.js` — Incorrect Prisma `groupBy` orderBy and `_count` reference**
   - `departmentStats` used `orderBy: { _count: { department: "desc" } }` but the `_count` selector was `true` (boolean) instead of `{ department: true }`. Also, the response mapping incorrectly used `d._count` (boolean) instead of `d._count.department` (number). Fixed both.

2. **`src/routes/excel.js` — Missing file upload guard in `/preview` and `/import`**
   - Both routes would crash with an unhandled `TypeError` if no file was attached. Added explicit `if (!req.file)` guards returning a `400` error.

3. **`src/routes/excel.js` — Missing mapping guard in `/import`**
   - If `req.body.mapping` was absent the `JSON.parse` call would throw. Added guard.

4. **`src/routes/excel.js` — Missing worksheet guard in `/import`**
   - `workbook.worksheets[0]` can be `undefined` on a blank workbook. Added guard.

5. **`src/routes/excel.js` — Empty rows not skipped during import**
   - Completely empty rows in the Excel sheet caused spurious "Missing required fields" errors. Added an `allEmpty` check to skip them.

6. **`src/routes/excel.js` — Preview response not returned early**
   - The preview branch fell through to `workbook.xlsx.write(res)`, causing a double-response error (`ERR_HTTP_HEADERS_SENT`). Changed to `return res.json(...)`.

7. **`src/routes/excel.js` — Sparse header array in export preview**
   - `firstSheet.getRow(1).values` is a 1-indexed sparse array. Filtering `undefined` entries and correctly mapping column indices prevents empty/undefined header keys in the preview JSON.

### Frontend

8. **`frontend/package.json` — Missing TypeScript and React type definitions**
   - `typescript`, `@types/react`, and `@types/react-dom` were absent, causing `tsc` and IDE type-checking to fail entirely. Added all three as `devDependencies`. Also updated the `build` script to run `tsc` before `vite build`.

9. **`frontend/tsconfig.json` and `frontend/tsconfig.node.json` — Missing TypeScript config files**
   - Neither tsconfig existed, so TypeScript had no configuration for the project or Vite config. Created both with appropriate settings for a Vite + React + SWC project.

10. **`frontend/src/App.tsx` — Missing `React` import**
    - JSX was used without importing React. Added `import React from "react"`.

11. **`frontend/src/pages/DashboardPage.tsx` — Stale closure bug in "Preview: All Faculty" export**
    - The button called `setSelectedIts(null)` then `handleExportPreview()`, but React state updates are async, so `selectedIts` was still set when the request fired. Fixed by passing an explicit `null` argument to `handleExportPreview(null)`, which takes precedence over the stale state value.

12. **`frontend/src/pages/DashboardPage.tsx` — Unsafe `any` types on error catches**
    - `catch (e: any)` blocks used throughout. Replaced with typed `unknown` and explicit cast for safer error handling.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register user |
| GET | `/api/faculty` | List faculty (search, paginate) |
| POST | `/api/faculty` | Add faculty |
| PUT | `/api/faculty/:id` | Update faculty |
| DELETE | `/api/faculty/:id` | Soft-delete faculty |
| GET | `/api/family/faculty/:id` | List family members |
| POST | `/api/family` | Add family member |
| PUT | `/api/family/:id` | Update family member |
| DELETE | `/api/family/:id` | Delete family member |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category (admin) |
| GET | `/api/custom-fields` | List custom fields |
| POST | `/api/custom-fields` | Create custom field (admin) |
| POST | `/api/excel/preview` | Preview uploaded Excel |
| POST | `/api/excel/import` | Import faculty from Excel |
| GET | `/api/excel/export` | Export faculty to Excel |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/dashboard/completeness` | Data completeness report |
