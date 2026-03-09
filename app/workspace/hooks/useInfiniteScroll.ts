'use client';

import { useEffect, useRef } from 'react';

interface UseInfiniteScrollProps {
  onLoadMore: () => void;
  enabled?: boolean;
  threshold?: number;
}

export function useInfiniteScroll({ onLoadMore, enabled = true, threshold = 0.1 }: UseInfiniteScrollProps) {
  const observerTarget = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !observerTarget.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onLoadMore();
        }
      },
      { threshold }
    );

    observer.observe(observerTarget.current);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, enabled, threshold]);

  return observerTarget;
}
