"use client";

import dynamic from "next/dynamic";

const CopilotSection = dynamic(() => import("./copilot-section"), { ssr: false });

interface Props {
  user: { name: string; userType?: string; ftp?: number; weightKg?: number; maxHr?: number };
  systemPrompt: string;
  isNewUser: boolean;
}

export function LazyCopilot(props: Props) {
  return <CopilotSection {...props} />;
}
