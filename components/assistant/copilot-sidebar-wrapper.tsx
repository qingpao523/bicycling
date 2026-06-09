"use client";

import { CopilotSidebar } from "@copilotkit/react-ui";
import {
  useCopilotAction,
  useCopilotReadable,
} from "@copilotkit/react-core";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Props {
  user: {
    name: string;
    userType?: string;
    ftp?: number;
    weightKg?: number;
    maxHr?: number;
  };
  systemPrompt: string;
  isNewUser?: boolean;
}

const PAGE_DESCRIPTIONS: Record<string, string> = {
  "/analytics": "功率训练总览页 — 展示 PMC 图表（CTL/ATL/TSB 疲劳管理）、功率曲线、最近训练负荷趋势",
  "/activities": "训练历史列表 — 按时间倒序展示所有骑行记录，含距离、时长、TSS、功率等核心指标",
  "/wellness": "身体状态页 — 展示每日 HRV、静息心率、睡眠、体重趋势和训练就绪度评分",
  "/settings": "个人设置页 — 修改体重、FTP、心率区间、intervals.icu / Strava 同步配置",
  "/admin": "管理后台 — AI 模型配置、用户管理、系统功能开关、自动同步设置",
  "/dashboard": "仪表盘 — 训练概览和快速入口",
};

function getPageContext(pathname: string): string {
  for (const [path, desc] of Object.entries(PAGE_DESCRIPTIONS)) {
    if (pathname === path || pathname.startsWith(path + "/")) {
      return desc;
    }
  }
  if (pathname.startsWith("/activities/")) {
    return "单次骑行详情页 — 展示该次骑行的功率分布、心率曲线、赛段成绩、AI 点评和补给记录";
  }
  if (pathname.startsWith("/race-plan")) {
    return "比赛计划页 — 创建和管理比赛战术方案，包含路线剖面、车手分工和策略生成";
  }
  if (pathname.startsWith("/ride-plans")) {
    return "骑行补给计划页 — 根据距离、爬升、温度等条件生成个性化补给方案";
  }
  return "AI 骑行助手应用";
}

export function CopilotSidebarWrapper({ user, systemPrompt, isNewUser }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isNewUser) {
      const timer = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isNewUser]);

  useCopilotReadable({
    description: "当前用户信息",
    value: JSON.stringify(user),
  });

  useCopilotReadable({
    description: "系统角色指令",
    value: systemPrompt,
  });

  useCopilotReadable({
    description: "用户当前所在页面",
    value: JSON.stringify({
      path: pathname,
      description: getPageContext(pathname),
    }),
  });

  useCopilotAction({
    name: "navigate",
    description: "导航到应用内的指定页面，如功率分析、训练历史、设置等",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "目标路径：/analytics(功率训练) /activities(训练历史) /wellness(身体状态) /settings(设置) /admin(管理) /race-plan(比赛计划) /ride-plans/new(补给计划)",
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
    description: "同步用户的训练数据",
    parameters: [
      {
        name: "source",
        type: "string",
        description: "数据源: intervals(intervals.icu) 或 strava",
        required: true,
      },
    ],
    handler: async ({ source }) => {
      const endpoint = source === "intervals"
        ? "/api/integrations/intervals/sync"
        : "/api/integrations/strava/sync";
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) return `同步失败：${res.statusText}`;
      return `已触发 ${source} 数据同步，数据会在后台陆续更新`;
    },
  });

  useCopilotAction({
    name: "saveUserProfile",
    description: "保存用户的个人资料信息（体重、FTP、最大心率、训练目标、设备类型、intervals API Key等）。当用户在对话中提供了这些信息时调用此 action 保存。",
    parameters: [
      { name: "name", type: "string", description: "用户姓名", required: false },
      { name: "userType", type: "string", description: "训练类型: power/watch/basic", required: false },
      { name: "weightKg", type: "number", description: "体重(kg)", required: false },
      { name: "ftp", type: "number", description: "FTP功率阈值(瓦)", required: false },
      { name: "maxHr", type: "number", description: "最大心率(bpm)", required: false },
      { name: "primaryDevice", type: "string", description: "主力设备: garmin/apple_watch/whoop/coros/other", required: false },
      { name: "intervalsApiKey", type: "string", description: "intervals.icu API Key", required: false },
      { name: "goal", type: "string", description: "训练目标: race/fitness/weight/fun", required: false },
    ],
    handler: async (params) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") body[k] = v;
      }
      if (Object.keys(body).length === 0) return "没有需要保存的信息";
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return "保存失败，请稍后重试";
      router.refresh();
      return "个人资料已保存";
    },
  });

  useCopilotAction({
    name: "getTrainingOverview",
    description: "获取用户的训练数据概览，包括最近活动统计",
    parameters: [],
    handler: async () => {
      const res = await fetch("/api/system/health");
      if (!res.ok) return "无法获取系统状态";
      return await res.json();
    },
  });

  useCopilotAction({
    name: "explainCurrentPage",
    description: "向用户解释当前页面的功能和数据含义。当用户问'这个页面是什么'、'怎么看这些数据'时调用。",
    parameters: [],
    handler: async () => {
      return {
        page: pathname,
        description: getPageContext(pathname),
        tip: "你可以向我提问页面上任何数据指标的含义，比如 TSS、CTL、FTP 等",
      };
    },
  });

  const initialMessage = isNewUser
    ? `你好！欢迎使用 AI 骑行助手 🚴\n\n我先帮你做个简单设置。请问你叫什么名字？你平时用什么方式记录训练？（功率计、智能手表、还是暂时不用设备）\n\n你可以一次性告诉我，也可以一个一个聊。`
    : `${user.name}，有什么可以帮你的？`;

  return (
    <CopilotSidebar
      defaultOpen={open}
      clickOutsideToClose
      labels={{
        title: "AI 骑行助手",
        initial: initialMessage,
        placeholder: "输入你的问题...",
        stopGenerating: "停止",
        regenerateResponse: "重新回答",
      }}
    />
  );
}
