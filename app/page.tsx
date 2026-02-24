import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 px-6 py-16 md:px-12 md:py-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16">
        <div className="space-y-8">
          <div className="inline-block">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-100/60 px-4 py-1.5 text-sm font-semibold text-blue-700">
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
              className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:shadow-xl hover:from-blue-700 hover:to-blue-800"
            >
              Sign In
            </Link>
            <Link
              href="/workspace?mode=guest"
              className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Try as Guest
            </Link>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="group rounded-2xl bg-white/50 p-8 backdrop-blur transition hover:bg-white/80 hover:shadow-lg">
            <div className="mb-4 h-12 w-12 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
              <span className="text-xl">🔐</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Account Sync</h3>
            <p className="mt-2 text-slate-700">Sign in to sync tasks across all your devices securely.</p>
          </div>
          <div className="group rounded-2xl bg-white/50 p-8 backdrop-blur transition hover:bg-white/80 hover:shadow-lg">
            <div className="mb-4 h-12 w-12 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center">
              <span className="text-xl">✨</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">No Login</h3>
            <p className="mt-2 text-slate-700">Jump in instantly as a guest. Tasks stay private in your browser.</p>
          </div>
          <div className="group rounded-2xl bg-white/50 p-8 backdrop-blur transition hover:bg-white/80 hover:shadow-lg">
            <div className="mb-4 h-12 w-12 rounded-lg bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center">
              <span className="text-xl">📅</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Calendar View</h3>
            <p className="mt-2 text-slate-700">See your workload at a glance and plan weeks ahead.</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-24 border-t border-slate-200/50 pt-8 text-center">
        <p className="text-sm font-light text-slate-600">
          Powered by{" "}
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent font-bold italic tracking-wide">
            ShadowXByte
          </span>
        </p>
        <p className="mt-2 text-xs text-slate-600">
          GitHub: <a href="https://github.com/ShadowXByte" target="_blank" rel="noreferrer" className="underline decoration-dotted">@ShadowXByte</a>
        </p>
      </div>
    </main>
  );
}
