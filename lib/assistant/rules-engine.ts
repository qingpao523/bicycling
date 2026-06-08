import type { AssistantChunk, AssistantAction } from "./protocol";

interface Intent {
  kind: "navigate" | "sync" | "query" | "advice" | "chat" | "help";
  target?: string;
}

const NAV_RULES: { patterns: RegExp[]; path: string; label: string }[] = [
  {
    patterns: [/设置|配置|api.?key|icu|strava|密码/i],
    path: "/settings",
    label: "设置页",
  },
  {
    patterns: [/活动|骑行记录|历史|rides?/i],
    path: "/activities",
    label: "活动列表",
  },
  {
    patterns: [/分析|总览|数据|dashboard|趋势|概览/i],
    path: "/analytics",
    label: "数据分析",
  },
  {
    patterns: [/补给|营养|能量胶|fuel|nutrition/i],
    path: "/fuel",
    label: "补给计划",
  },
  {
    patterns: [/管理|admin|用户管理|系统/i],
    path: "/admin",
    label: "管理后台",
  },
];

const SYNC_PATTERNS = [
  { pattern: /同步.*(interval|icu|数据)/i, source: "intervals" as const },
  { pattern: /同步.*strava/i, source: "strava" as const },
  { pattern: /(同步|拉取|更新).*(训练|骑行|活动)/i, source: "intervals" as const },
];

const QUERY_PATTERNS: { pattern: RegExp; response: string }[] = [
  {
    pattern: /ftp|功率阈值/i,
    response: "你可以在**数据分析**页面查看 FTP 趋势和最新估算值。",
  },
  {
    pattern: /tss|训练负荷|疲劳/i,
    response: "TSS 和训练负荷趋势在**数据分析**页面的负荷图表中可以查看。",
  },
  {
    pattern: /心率|hr|心率区间/i,
    response: "心率数据和区间分析在每次活动详情中可以查看。整体趋势在**数据分析**页面。",
  },
  {
    pattern: /最近.*(骑|训练|活动)/i,
    response: "你可以在**活动列表**页面查看最近的骑行记录。要我帮你打开？",
  },
];

const ADVICE_PATTERNS: { pattern: RegExp; response: string }[] = [
  {
    pattern: /提升.?ftp|提高.?功率|怎么.?变强/i,
    response:
      "提升 FTP 的关键：\n1. **Sweet Spot 训练**（88-94% FTP），每周 2-3 次\n2. **阈值间歇**（95-105% FTP），每周 1 次\n3. **充分恢复**，训练和恢复同样重要\n4. **持续 6-8 周**才能看到显著提升\n\n要我帮你看看最近的训练负荷是否合理？",
  },
  {
    pattern: /恢复|休息|该不该练/i,
    response:
      "恢复建议需要看你最近的训练负荷。一般原则：\n- ATL（急性负荷）连续上升 3 天以上→安排恢复骑\n- Form（TSB）低于 -20→高风险，建议休息\n- 睡眠不好或身体不适→强烈建议休息\n\n要我帮你看看当前的训练状态？",
  },
  {
    pattern: /今天.*(练|骑|训练)|训练.?建议/i,
    response:
      "今天的训练建议取决于你最近的负荷和恢复状态。要我帮你打开数据分析页面查看？",
  },
];

const HELP_PATTERNS = [
  /帮助|help|你能做什么|功能|怎么用/i,
  /你是谁|介绍/i,
];

function classifyIntent(message: string): Intent {
  const msg = message.trim();

  for (const rule of NAV_RULES) {
    if (rule.patterns.some((p) => p.test(msg))) {
      return { kind: "navigate", target: rule.path };
    }
  }

  for (const s of SYNC_PATTERNS) {
    if (s.pattern.test(msg)) {
      return { kind: "sync", target: s.source };
    }
  }

  for (const q of QUERY_PATTERNS) {
    if (q.pattern.test(msg)) {
      return { kind: "query", target: q.response };
    }
  }

  for (const a of ADVICE_PATTERNS) {
    if (a.pattern.test(msg)) {
      return { kind: "advice", target: a.response };
    }
  }

  if (HELP_PATTERNS.some((p) => p.test(msg))) {
    return { kind: "help" };
  }

  return { kind: "chat" };
}

export function processGlobalMessage(userMessage: string): AssistantChunk[] {
  const intent = classifyIntent(userMessage);
  const chunks: AssistantChunk[] = [];

  switch (intent.kind) {
    case "navigate": {
      const rule = NAV_RULES.find((r) => r.path === intent.target);
      chunks.push({ type: "delta", content: `好的，带你去${rule?.label ?? "对应页面"}。` });
      chunks.push({
        type: "action",
        action: { kind: "navigate", path: intent.target! },
      });
      break;
    }

    case "sync": {
      const source = intent.target as "intervals" | "strava";
      chunks.push({
        type: "delta",
        content: `正在触发${source === "intervals" ? "intervals.icu" : "Strava"} 数据同步...`,
      });
      chunks.push({ type: "action", action: { kind: "sync", source } });
      break;
    }

    case "query": {
      chunks.push({ type: "delta", content: intent.target! });
      break;
    }

    case "advice": {
      chunks.push({ type: "delta", content: intent.target! });
      break;
    }

    case "help": {
      chunks.push({
        type: "delta",
        content:
          "我是你的骑行训练 AI 助手，可以帮你：\n\n" +
          "- **快速导航**：「打开设置」「看看活动记录」\n" +
          "- **数据同步**：「同步 intervals.icu 数据」\n" +
          "- **训练答疑**：「如何提升 FTP？」「今天该怎么练？」\n" +
          "- **状态查询**：「最近训练负荷怎么样？」\n\n" +
          "直接输入你想做的事情就好！",
      });
      chunks.push({
        type: "action",
        action: {
          kind: "suggest_prompts",
          prompts: [
            "同步最新数据",
            "看看我最近的骑行",
            "如何提升 FTP？",
            "打开设置",
          ],
        },
      });
      break;
    }

    case "chat":
    default: {
      chunks.push({
        type: "delta",
        content:
          "这个问题我暂时还回答不了 😅 目前我擅长帮你导航系统、同步数据和基础训练问答。\n\n试试问我：",
      });
      chunks.push({
        type: "action",
        action: {
          kind: "suggest_prompts",
          prompts: [
            "看看我的训练数据",
            "同步最新数据",
            "如何提升 FTP？",
          ],
        },
      });
      break;
    }
  }

  return chunks;
}
