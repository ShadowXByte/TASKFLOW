# TASKFLOW

<p align="center">
	<b>Your daily task planner with calendar + analytics.</b><br/>
	Stay organized, track progress, and finish work on time.
</p>

---

## 📸 Workspace Preview

![Taskflow Workspace](docs/workspace-sample.svg)

---

## ✨ What is TASKFLOW?

TASKFLOW is a modern productivity app for people who want a simple way to plan tasks and see progress.

You can:
- Add tasks with due date, time, and priority
- View everything in task list + calendar format
- Track productivity with built-in analytics
- Use Guest mode instantly or Account mode for sync

---

## ✅ Key Features

- **Clean Workspace UI** (easy to use on desktop + mobile)
- **Task Priorities** (LOW / MEDIUM / HIGH)
- **Calendar View** (see tasks by day)
- **Analytics Dashboard** (score, completion, overdue, distribution)
- **Dark / Light Mode**
- **Guest Mode** (no login required)
- **Offline Support** (with auto sync when internet returns)

---

## 📴 Offline Support

TASKFLOW works as an installable app and supports offline usage:

- **Homepage + Guest Mode:** available offline (local storage)
- **Account Mode (after previous login):** opens offline with cached tasks
- **Offline edits in Account Mode:** changes are saved locally in a queue
- **When internet returns:** queued changes sync automatically with your account
- **App updates:** new app version is fetched in the background and applied on next open/refresh

---

## 🧩 Tech Stack

<p>
	<img alt="Next.js" src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" />
	<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
	<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
	<img alt="Prisma" src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" />
	<img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white" />
	<img alt="NextAuth" src="https://img.shields.io/badge/NextAuth-4B5563?style=for-the-badge&logo=auth0&logoColor=white" />
</p>

- Next.js + TypeScript for app experience
- Tailwind CSS for clean, responsive UI
- Prisma + PostgreSQL (Neon) for data
- NextAuth for secure account login

---

## 🚀 Quick Start

### 1) Install

```bash
npm install
```

### 2) Create your env file

```bash
copy .env.example .env
```

### 3) Run

```bash
npm run dev
```

### 4) Open app

http://localhost:3000

---

## 👤 For non-technical users

- Use **Guest Mode** to try the app immediately
- Use **Account Mode** if you want saved/synced tasks
- Analytics helps you quickly understand your productivity each day

---

## 🛠 Basic Notes

- Account mode needs database values in `.env`
- Notification behavior can vary by device/browser settings

---

## 🔒 Security Note

- User passwords are **not stored in plain text**.
- Passwords are hashed using **bcrypt** before saving.
- During login, TASKFLOW verifies passwords securely against the hashed value.

---

## ❤️ Built by

**ShadowXByte**
