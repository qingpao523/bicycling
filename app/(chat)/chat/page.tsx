"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotChatSuggestions } from "@copilotkit/react-core";

export default function ChatPage() {
  useCopilotChatSuggestions({
    suggestions: [
      { title: "训练负荷", message: "我的训练负荷怎么样？" },
      { title: "功率分析", message: "分析一下我最近的功率变化" },
      { title: "骑行等级", message: "评估一下我的骑行等级" },
      { title: "恢复状态", message: "我现在的恢复状态如何？" },
    ],
  });

  return (
    <CopilotChat
      labels={{
        title: "AI 骑行助手",
        initial: "你好！我是你的 AI 骑行助手，可以帮你分析训练数据、评估状态、制定计划。有什么可以帮你的？",
        placeholder: "输入你的问题...",
        stopGenerating: "停止",
        regenerateResponse: "重新回答",
      }}
      className="chat-main"
    />
  );
}
