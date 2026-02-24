import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 px-6 py-16 md:px-12 md:py-24">
      <div className="pointer-events-none absolute -top-20 right-0 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-indigo-300/20 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-16">
        <div className="rounded-3xl border border-white/60 bg-white/55 p-6 shadow-xl backdrop-blur-xl md:p-10">
          <div className="space-y-8">
            <div className="inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-100/70 px-4 py-1.5 text-sm font-semibold text-blue-700 shadow-sm">
              <Image src="/unnamed.jpg" alt="Taskflow logo" width={18} height={18} className="rounded-full" />
              TASKFLOW
              </span>
            </div>

            <div>
              <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight text-slate-900 md:text-7xl">
                Plan your work.<br />
                Own your time.
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-slate-600 md:text-xl">
                Sync across devices with your account, or use guest mode for instant private planning.
                Either way, your calendar keeps you focused on what matters.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/workspace?mode=account"
                className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 text-base font-semibold text-white shadow-lg transition duration-200 hover:shadow-xl hover:from-blue-700 hover:to-blue-800"
              >
                Sign In
              </Link>
              <Link
                href="/workspace?mode=guest"
                className="rounded-xl border-2 border-slate-300/80 bg-white/90 px-6 py-3 text-base font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-slate-400 hover:bg-slate-50"
              >
                Try as Guest
              </Link>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-center text-xs text-slate-600">
                Offline-ready workflow
              </div>
              <div className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-center text-xs text-slate-600">
                Calendar + analytics
              </div>
              <div className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-center text-xs text-slate-600">
                Guest & account modes
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="group rounded-2xl border border-white/70 bg-white/60 p-8 shadow-sm backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-xl">
            <div className="mb-4 h-12 w-12 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
              <span className="text-xl">🔐</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Account Sync</h3>
            <p className="mt-2 text-slate-700">Sign in to sync tasks across all your devices securely.</p>
          </div>
          <div className="group rounded-2xl border border-white/70 bg-white/60 p-8 shadow-sm backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-xl">
            <div className="mb-4 h-12 w-12 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center">
              <span className="text-xl">✨</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">No Login</h3>
            <p className="mt-2 text-slate-700">Jump in instantly as a guest. Tasks stay private in your browser.</p>
          </div>
          <div className="group rounded-2xl border border-white/70 bg-white/60 p-8 shadow-sm backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-xl">
            <div className="mb-4 h-12 w-12 rounded-lg bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center">
              <span className="text-xl">📅</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Calendar View</h3>
            <p className="mt-2 text-slate-700">See your workload at a glance and plan weeks ahead.</p>
          </div>
        </div>
      </div>

      <footer className="mt-24 border-t border-slate-200/60 pt-8 pb-4 text-center">
        <p className="text-sm font-semibold text-slate-900">Taskflow</p>
        <p className="mt-1 text-xs text-slate-600">Plan better. Finish on time.</p>
        <p className="mt-2 text-[11px] text-slate-500">Privacy · Terms · Contact</p>
        <p className="mt-2 text-xs text-slate-700">
          GitHub ·{" "}
          <a
            href="https://github.com/ShadowXByte"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-slate-300/80 bg-white/80 px-2.5 py-1 font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            @ShadowXByte
          </a>
        </p>
        <p className="mt-2 text-[11px] text-slate-500">© 2026 ShadowXByte</p>
      </footer>
    </main>
  );
}
