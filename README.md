# TASKFLOW

TASKFLOW is a full-stack task management app with calendar planning and account-based data isolation.

## Overview

TASKFLOW allows app users to register, sign in, and manage personal tasks with due dates on a monthly calendar interface.
Each authenticated account can only access its own tasks.

## Features

- Email/password authentication
- User-scoped tasks (multi-user safe)
- Create, complete, and delete tasks
- Monthly calendar view with per-day task counts
- Responsive UI built with Tailwind CSS

## Tech Stack

- Next.js (App Router + TypeScript)
- NextAuth.js (Credentials Provider)
- Prisma ORM
- Neon PostgreSQL
- Tailwind CSS

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

```bash
copy .env.example .env
```

Update `.env`:

- `DATABASE_URL` = pooled connection string
- `DIRECT_URL` = direct connection string
- `NEXTAUTH_URL` = `http://localhost:3000`
- `NEXTAUTH_SECRET` = a long random secret
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = VAPID public key for Web Push
- `VAPID_PRIVATE_KEY` = VAPID private key for Web Push
- `VAPID_SUBJECT` = contact URL/mailto value (example: `mailto:you@example.com`)
- `CRON_SECRET` = secret used by reminder cron endpoint (for non-Vercel manual calls)

### 3) Sync database schema and generate Prisma client

```bash
npm run prisma:push
npm run prisma:generate
```

### 4) Run development server

```bash
npm run dev
```

Open http://localhost:3000.

## Scripts

- `npm run dev` - Start local development server
- `npm run build` - Create production build
- `npm run start` - Run production server
- `npm run lint` - Run ESLint
- `npm run prisma:push` - Push Prisma schema to database
- `npm run prisma:generate` - Generate Prisma Client

## Notes

- Run `npm run prisma:push` for first-time Neon schema setup.
- Keep `NEXTAUTH_SECRET` private and rotate it if leaked.
- Push reminders for installed Android PWA use Service Worker + Web Push.
- `vercel.json` includes a 1-minute cron route at `/api/cron/push-reminders`.

## Author

- ShadowXByte

## Disclaimer

- This project is provided as-is for learning and development use.
- You are responsible for production security, backups, and environment configuration.
- Do not commit secrets such as database credentials or auth secrets to GitHub.
