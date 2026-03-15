"use client";

export default function LoadingScreen() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-slate-50 to-teal-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Animated background gradients */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-300/35 rounded-full filter blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-300/30 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-amber-200/35 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative z-10 w-full max-w-lg text-center">
        {/* Main card */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-2xl px-8 py-12 shadow-lg shadow-emerald-200/40">
          <div className="flex justify-center mb-8">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500 border-r-teal-500 animate-spin" />
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-amber-500 border-l-emerald-400 animate-spin" style={{ animationDirection: "reverse", animationDuration: "3s" }} />
              <div className="absolute inset-4 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 animate-pulse" />
            </div>
          </div>

          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-amber-600 bg-clip-text text-transparent mb-2">
            TASKFLOW
          </h1>
          <p className="text-slate-600 text-sm tracking-wide font-medium">Getting your workspace ready...</p>
        </div>
      </div>
    </main>
  );
}
