"use client";

import { CopilotSidebar } from "@copilotkit/react-ui";
import {
  useCopilotAction,
  useCopilotReadable,
} from "@copilotkit/react-core";
import { useRouter } from "next/navigation";

interface Props {
  user: {
    name: string;
    userType?: string;
    ftp?: number;
    weightKg?: number;
    maxHr?: number;
  };
  systemPrompt: string;
}

export function CopilotSidebarWrapper({ user, systemPrompt }: Props) {
  const router = useRouter();

  useCopilotReadable({
    description: "当前用户信息",
    value: JSON.stringify(user),
  });

  useCopilotReadable({
    description: "系统角色指令",
    value: systemPrompt,
  });

  useCopilotAction({
    name: "navigate",
    description: "导航到应用内的指定页面",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "目标路径，如 /analytics、/activities、/settings、/wellness",
        required: true,
      },
    ],
    handler: async ({ path }) => {
      router.push(path);
      return `已导航到 ${path}`;
    },
  });

  useCopilotAction({
    name: "syncData",
    description: "同步用户的训练数据（intervals.icu 或 Strava）",
    parameters: [
      {
        name: "source",
        type: "string",
        description: "数据源: intervals 或 strava",
        required: true,
      },
    ],
    handler: async ({ source }) => {
      await fetch(`/api/integrations/${source}/sync`, { method: "POST" });
      return `已触发 ${source} 数据同步`;
    },
  });

  return (
    <CopilotSidebar
      labels={{
        title: "AI 骑行助手",
        initial: "有什么可以帮你的？",
      }}
      defaultOpen={false}
      clickOutsideToClose
    />
  );
}
