"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    router.replace(isMobile ? "/wellness" : "/analytics");
  }, [router]);

  return null;
}
