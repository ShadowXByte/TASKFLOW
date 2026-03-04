"use client";

import { useState, useEffect } from "react";

const MOTIVATIONAL_SLIDES = [
  {
    line1: "Stay",
    line2: "Focused"
  },
];

export default function LoadingScreen() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const slideTimer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % MOTIVATIONAL_SLIDES.length);
    }, 2500);

    return () => window.clearInterval(slideTimer);
  }, []);

  useEffect(() => {
    const progressTimer = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + Math.random() * 30));
    }, 300);

    return () => window.clearInterval(progressTimer);
  }, []);

  const currentSlide = MOTIVATIONAL_SLIDES[slideIndex];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Animated background gradients */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/20 rounded-full mix-blend-screen filter blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/20 rounded-full mix-blend-screen filter blur-3xl animate-pulse" style={{animationDelay: '1s'}} />
        <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-cyan-500/15 rounded-full mix-blend-screen filter blur-3xl animate-pulse" style={{animationDelay: '2s'}} />
      </div>

      <div className="relative z-10 w-full max-w-lg text-center">
        {/* Main card */}
        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl px-8 py-16 shadow-2xl">
          {/* Premium animated spinner */}
          <div className="flex justify-center mb-12">
            <div className="relative w-20 h-20">
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 border-r-cyan-400 animate-spin" />
              {/* Middle ring */}
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-purple-400 border-l-blue-300 animate-spin" style={{animationDirection: 'reverse', animationDuration: '3s'}} />
              {/* Inner dot */}
              <div className="absolute inset-4 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 animate-pulse" />
            </div>
          </div>

          {/* Main heading */}
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-300 via-cyan-300 to-purple-300 bg-clip-text text-transparent mb-2 animate-pulse">
            TASKFLOW
          </h1>
          <p className="text-slate-300 text-sm tracking-widest uppercase mb-8 font-semibold">Initializing Workspace</p>

          {/* Motivational slideshow with 2-line punchy text */}
          <div className="min-h-[130px] flex flex-col items-center justify-center mb-10 px-2">
            <div key={slideIndex} className="animate-in fade-in duration-700 text-center">
              <p className="text-4xl md:text-5xl font-black bg-gradient-to-r from-yellow-300 via-orange-300 to-red-400 bg-clip-text text-transparent leading-[1.15]">
                {currentSlide.line1}
              </p>
              <p className="text-4xl md:text-5xl font-black bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-400 bg-clip-text text-transparent leading-[1.15]">
                {currentSlide.line2}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 rounded-full transition-all duration-500"
                style={{width: `${progress}%`}}
              />
            </div>
            <p className="text-xs text-slate-400 font-medium">{Math.round(progress)}% Ready</p>
          </div>

          {/* Animated dots indicator */}
          <div className="flex justify-center gap-2 mb-8">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{animationDelay: '0.1s'}} />
            <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{animationDelay: '0.2s'}} />
          </div>

          {/* Loading text */}
          <p className="text-xs text-slate-400 tracking-wider">Preparing your productivity hub...</p>
        </div>

        {/* Bottom accent */}
        <div className="mt-8 flex justify-center gap-2">
          <div className="w-1 h-1 rounded-full bg-blue-400/50 animate-pulse" />
          <div className="w-1 h-1 rounded-full bg-cyan-400/50 animate-pulse" style={{animationDelay: '0.2s'}} />
          <div className="w-1 h-1 rounded-full bg-purple-400/50 animate-pulse" style={{animationDelay: '0.4s'}} />
        </div>
      </div>
    </main>
  );
}
