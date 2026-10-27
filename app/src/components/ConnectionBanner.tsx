"use client";

import { useFair } from "@/lib/client";
import { Notice } from "@/components/ui";

export function ConnectionBanner() {
  const { online } = useFair();
  if (online) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4">
      <Notice tone="warning">Offline or server unreachable. Showing the last known data and retrying every 2 seconds.</Notice>
    </div>
  );
}
