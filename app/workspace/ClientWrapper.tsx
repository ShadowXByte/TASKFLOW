"use client";

import { useState, useEffect } from "react";
import LoadingScreen from "./LoadingScreen";
import { PageContent } from "./page";

export default function ClientWrapper() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Show loading screen for at least 2 seconds
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return <PageContent />;
}
