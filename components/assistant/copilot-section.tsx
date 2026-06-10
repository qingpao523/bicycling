"use client";

import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";
import { CopilotSidebarWrapper } from "./copilot-sidebar-wrapper";

interface Props {
  user: { name: string; userType?: string; ftp?: number; weightKg?: number; maxHr?: number };
  systemPrompt: string;
  isNewUser: boolean;
}

export default function CopilotSection({ user, systemPrompt, isNewUser }: Props) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <CopilotSidebarWrapper user={user} systemPrompt={systemPrompt} isNewUser={isNewUser} />
    </CopilotKit>
  );
}
