"use client";

import { useState, useEffect } from "react";
import LoadingScreen from "./LoadingScreen";
import { PageContent } from "./page";

export default function ClientWrapper() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Keep a short minimum to avoid abrupt flash while still feeling responsive.
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 700);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return <PageContent />;
}
