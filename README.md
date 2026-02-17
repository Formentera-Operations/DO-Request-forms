# Void Checks Management App

A Next.js application for managing void check requests, with Supabase for data storage and Snowflake for owner/check number lookups.

## Features

- **New Entry Form** — Search-as-you-type dropdowns for Check Number and Owner Number (from Snowflake), with amount validation and file attachments
- **Duplicate Detection** — Warns before submitting if a matching Check #, Amount, and Owner # already exists
- **Submissions Table** — Filterable by search, status, created by, and date range with active filter tags
- **Bulk Status Updates** — Select multiple rows and change their status at once
- **Detail Modal** — Click any row to view full details with clickable attachments
- **Inline Editing** — Edit any entry directly from the detail modal
- **Auto Sign-Off Date** — Automatically set when status changes to "Complete"

## Setup in VS Code

### 1. Extract the project

```bash
# If you downloaded the .tar.gz archive:
tar -xzf void-checks.tar.gz
cd void-checks

# Or if you have the folder directly:
cd void-checks
```

### 2. Open in VS Code

```bash
code .
```

### 3. Install dependencies

Open the integrated terminal (`Ctrl+`` ` or `Cmd+`` `) and run:

```bash
npm install
```

### 4. Set up environment variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Snowflake
SNOWFLAKE_ACCOUNT=your-account
SNOWFLAKE_USERNAME=your-username
SNOWFLAKE_PASSWORD=your-password
SNOWFLAKE_DATABASE=your-database
SNOWFLAKE_SCHEMA=your-schema
SNOWFLAKE_WAREHOUSE=your-warehouse
SNOWFLAKE_ROLE=your-role
```

### 5. Set up Supabase database

Run the SQL from `supabase/migration.sql` in your Supabase SQL Editor to create the `void_checks` table.

### 6. Configure Snowflake queries

Edit `lib/snowflake.ts` and update the SQL queries in `getOwners()` and `getChecks()` to match your actual Snowflake table/view names and column names.

### 7. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
void-checks/
├── app/
│   ├── api/
│   │   ├── checks/route.ts     # GET - Snowflake check number lookup
│   │   ├── owners/route.ts     # GET - Snowflake owner number lookup
│   │   └── submissions/route.ts # GET/POST/PATCH - Supabase CRUD
│   ├── globals.css              # All styles
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Main page component (form + submissions)
├── lib/
│   ├── snowflake.ts             # Snowflake connection & queries
│   ├── supabase.ts              # Supabase client
│   └── types.ts                 # TypeScript interfaces
├── supabase/
│   └── migration.sql            # Database table creation
├── .env.example                 # Environment variable template
├── package.json
└── README.md
```

## Deploying to Vercel

1. Push your code to a GitHub repository
2. Import the repo in [vercel.com](https://vercel.com)
3. Add all environment variables from `.env.local` to the Vercel project settings
4. Deploy

## TODO

- [ ] Update Snowflake SQL queries in `lib/snowflake.ts` to match your actual schema
- [ ] Integrate Supabase Storage for file attachments
- [ ] Add authentication to populate `created_by` with actual user identity
- [ ] Add server-side duplicate validation in the POST endpoint
