"use client";

import dynamic from "next/dynamic";

export const LazyPmcChart = dynamic(
  () => import("@/components/analytics/pmc-chart").then((m) => m.PmcChart),
  { ssr: false }
);
