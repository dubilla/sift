"use client";

import { useState, useRef } from "react";
import { useSwipeable } from "react-swipeable";

interface SwipeableThreadRowProps {
  children: React.ReactNode;
  onArchive: () => void;
  isArchiving: boolean;
  isSelected: boolean;
}

export default function SwipeableThreadRow({
  children,
  onArchive,
  isArchiving,
  isSelected,
}: SwipeableThreadRowProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isRemoving, setIsRemoving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const SWIPE_THRESHOLD = 0.3; // 30% of container width triggers archive
  const MAX_SWIPE = 0.5; // Cap swipe at 50% of width

  const handlers = useSwipeable({
    onSwiping: (e) => {
      if (isArchiving || isRemoving) return;

      // Only handle left swipes (negative deltaX)
      if (e.deltaX < 0) {
        const containerWidth = containerRef.current?.offsetWidth || 300;
        const maxOffset = containerWidth * MAX_SWIPE;
        const offset = Math.min(Math.abs(e.deltaX), maxOffset);
        setSwipeOffset(-offset);
      }
    },
    onSwipedLeft: (e) => {
      if (isArchiving || isRemoving) return;

      const containerWidth = containerRef.current?.offsetWidth || 300;
      const swipePercentage = Math.abs(e.deltaX) / containerWidth;

      if (swipePercentage >= SWIPE_THRESHOLD) {
        // Animate off-screen then archive
        setIsRemoving(true);
        setSwipeOffset(-containerWidth);

        setTimeout(() => {
          onArchive();
        }, 200);
      } else {
        // Snap back
        setSwipeOffset(0);
      }
    },
    onSwiped: () => {
      // Reset if not removing
      if (!isRemoving) {
        setSwipeOffset(0);
      }
    },
    trackMouse: false,
    trackTouch: true,
    preventScrollOnSwipe: true,
    delta: 10,
  });

  const containerWidth = containerRef.current?.offsetWidth || 300;
  const swipePercentage = Math.abs(swipeOffset) / containerWidth;
  const isOverThreshold = swipePercentage >= SWIPE_THRESHOLD;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden transition-all ${
        isRemoving ? "h-0 opacity-0" : ""
      }`}
      style={{
        transitionDuration: isRemoving ? "200ms" : "0ms",
      }}
    >
      {/* Background revealed when swiping */}
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-end px-6 transition-colors ${
          isOverThreshold ? "bg-red-500" : "bg-red-400"
        }`}
        style={{
          width: Math.abs(swipeOffset) + 20,
          opacity: Math.min(swipePercentage * 2, 1),
        }}
      >
        <div className="flex items-center gap-2 text-white">
          <svg
            className={`w-6 h-6 transition-transform ${
              isOverThreshold ? "scale-110" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
          {isOverThreshold && (
            <span className="text-sm font-medium">Archive</span>
          )}
        </div>
      </div>

      {/* Swipeable content */}
      <div
        {...handlers}
        className={`relative bg-white transition-colors ${
          isSelected ? "bg-blue-50" : ""
        }`}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 || isRemoving ? "transform 200ms ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
