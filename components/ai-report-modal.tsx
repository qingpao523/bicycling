"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AiRichText } from "@/components/ai-rich-text";
import type { AiChatMessage } from "@/lib/types";

type AiReportModalProps = {
  activityId: string;
  activityTitle: string;
  reportText?: string;
  initialOpen: boolean;
  initialMessages: AiChatMessage[];
  successMessage?: string;
  errorMessage?: string;
  compact?: boolean;
};

export function AiReportModal({
  activityId,
  activityTitle,
  reportText,
  initialOpen,
  initialMessages,
  successMessage,
  errorMessage,
  compact = false,
}: AiReportModalProps) {
  const [open, setOpen] = useState(initialOpen);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentReportText, setCurrentReportText] = useState(reportText ?? "");
  const [reportStreamingText, setReportStreamingText] = useState("");
  const [isReportStreaming, setIsReportStreaming] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(successMessage ? decodeURIComponent(successMessage) : null);
  const [reportError, setReportError] = useState<string | null>(errorMessage ? decodeURIComponent(errorMessage) : null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<string[]>([]);
  const [suggestedPage, setSuggestedPage] = useState(0);
  const chatListRef = useRef<HTMLDivElement>(null);
  const reportListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      const node = chatListRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    });
  }, [messages, streamingText]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const node = reportListRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    });
  }, [reportStreamingText]);

  async function consumeNdjson(
    response: Response,
    handlers: {
      onDelta: (chunk: string) => void;
      onDone: (payload: Record<string, unknown>) => void;
      onError: (message: string) => void;
    },
  ) {
    if (!response.ok || !response.body) {
      throw new Error("流式请求启动失败。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const raw = line.trim();
        if (!raw) continue;
        const payload = JSON.parse(raw) as
          | { type: "start" }
          | { type: "delta"; content?: string }
          | { type: "done"; [key: string]: unknown }
          | { type: "error"; error?: string };

        if (payload.type === "delta" && payload.content) {
          handlers.onDelta(payload.content);
          continue;
        }

        if (payload.type === "done") {
          handlers.onDone(payload as Record<string, unknown>);
          continue;
        }

        if (payload.type === "error") {
          const message = payload.error || "流式请求失败。";
          handlers.onError(message);
          throw new Error(message);
        }
      }
    }
  }

  async function handleReportGenerate() {
    if (isReportStreaming) return;

    setOpen(true);
    setReportError(null);
    setReportStatus("AI 报告正在生成中...");
    setReportStreamingText("");
    setIsReportStreaming(true);

    try {
      const response = await fetch(`/api/activities/${activityId}/ai-report/stream`, {
        method: "POST",
      });

      await consumeNdjson(response, {
        onDelta(chunk) {
          setReportStreamingText((current) => current + chunk);
        },
        onDone(payload) {
          const nextReportText = String(payload.reportText ?? "");
          setCurrentReportText(nextReportText);
          setReportStreamingText("");
          setReportStatus("AI 报告已生成并保存。");
        },
        onError(message) {
          setReportError(message);
          setReportStatus(null);
          setReportStreamingText("");
        },
      });
    } catch (generateError) {
      setReportError(generateError instanceof Error ? generateError.message : "AI 报告生成失败。");
      setReportStatus(null);
      setReportStreamingText("");
    } finally {
      setIsReportStreaming(false);
    }
  }

  async function handleChatSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitQuestion();
  }

  async function submitQuestion() {
    const trimmed = question.trim();
    if (!trimmed || isStreaming) return;

    setChatError(null);
    setChatStatus("AI 正在流式分析这次骑行...");
    setStreamingText("");
    setIsStreaming(true);

    try {
      const response = await fetch(`/api/activities/${activityId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: trimmed }),
      });

      setMessages((current) => [
        ...current,
        {
          id: `temp-user-${Date.now()}`,
          activityId,
          userId: "current",
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
        },
      ]);
      setQuestion("");

      await consumeNdjson(response, {
        onDelta(chunk) {
          setStreamingText((current) => current + chunk);
        },
        onDone(payload) {
          setMessages((payload.messages as AiChatMessage[]) ?? []);
          setStreamingText("");
          setChatStatus("本轮对话已保存。");
        },
        onError(message) {
          setChatError(message);
          setChatStatus(null);
          setStreamingText("");
        },
      });
    } catch (chatSubmitError) {
      setChatError(chatSubmitError instanceof Error ? chatSubmitError.message : "AI 对话失败。");
      setChatStatus(null);
      setStreamingText("");
    } finally {
      setIsStreaming(false);
    }
  }

  const visibleReportText = reportStreamingText || currentReportText;
  const hasReport = Boolean(currentReportText || reportStreamingText);
  const suggestedQuestions = [
    "明天怎么恢复？",
    "为什么后半程掉功率？",
    "下次补给怎么安排？",
    "这次训练值不值得？",
    "我这次心率和功率关系正常吗？",
    "未来 3 天怎么安排训练？",
  ];
  const suggestedQuestionBatches = [
    suggestedQuestions.slice(0, 3),
    suggestedQuestions.slice(3, 6),
  ].filter((batch) => batch.length);
  const showSuggestedPrompts = !messages.some((message) => message.role === "user") && !streamingText;
  const currentSuggestedQuestions = suggestedQuestionBatches[suggestedPage % suggestedQuestionBatches.length] ?? suggestedQuestions.slice(0, 3);
  const chatStateLabel = isStreaming ? "流式输出" : messages.length ? "已保存" : "待提问";

  function toggleMessageExpanded(id: string) {
    setExpandedMessageIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <>
      {compact ? (
        <div className="activity-report-inline">
          <div className="activity-report-actions">
            <button type="button" className="primary" onClick={handleReportGenerate} disabled={isReportStreaming}>
              {isReportStreaming ? "生成中..." : currentReportText ? "重新生成" : "生成 AI 报告"}
            </button>
            {hasReport ? (
              <button type="button" onClick={() => setOpen(true)}>
                打开全文
              </button>
            ) : null}
          </div>
          {reportError ? <p className="error-banner">{reportError}</p> : null}
          {reportStatus ? <p className="success-banner">{reportStatus}</p> : null}
        </div>
      ) : (
        <div className="ai-report-preview">
          <div className="section-title">
            <h2>完整报告</h2>
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="primary" onClick={handleReportGenerate} disabled={isReportStreaming}>
                {isReportStreaming ? "生成中..." : currentReportText ? "重新生成" : "生成 AI 报告"}
              </button>
              {hasReport ? (
                <button type="button" onClick={() => setOpen(true)}>
                  打开全文
                </button>
              ) : null}
            </div>
          </div>
          {reportError ? <p className="error-banner">{reportError}</p> : null}
          {reportStatus ? <p className="success-banner">{reportStatus}</p> : null}
          <div className="stack">
            <div className="list-card">
              <h3>摘要预览</h3>
              {hasReport ? (
                <div className="report-preview-rich">
                  <AiRichText text={visibleReportText} />
                </div>
              ) : (
                <p>还没有 AI 报告。点击上方按钮开始生成。</p>
              )}
            </div>
          </div>
        </div>
      )}

      {mounted && open
        ? createPortal(
            <div className="modal-backdrop" onClick={() => setOpen(false)}>
              <div className="modal-panel modal-panel-wide" onClick={(event) => event.stopPropagation()}>
              <div className="section-title">
                  <h2>{activityTitle}单次骑行AI复盘</h2>
                  <div className="row" style={{ gap: 10 }}>
                    <button type="button" className="primary" onClick={handleReportGenerate} disabled={isReportStreaming}>
                      {isReportStreaming ? "生成中..." : currentReportText ? "重新生成" : "生成 AI 报告"}
                    </button>
                    <button type="button" onClick={() => setOpen(false)}>
                      关闭
                    </button>
                  </div>
                </div>
                {reportError ? <p className="error-banner">{reportError}</p> : null}
                {reportStatus ? <p className="success-banner">{reportStatus}</p> : null}
                <div className="modal-scroll">
                  <div className="modal-split">
                    <section className="modal-section">
                      <div className="modal-section-title">
                        <h3>报告全文</h3>
                        {isReportStreaming ? <span className="pill">流式输出</span> : null}
                      </div>
                      <div className="report-scroll" ref={reportListRef}>
                        {visibleReportText ? (
                          <AiRichText text={visibleReportText} />
                        ) : isReportStreaming ? (
                          <div className="report-skeleton">
                            <div className="report-skeleton-chip">🚴 正在生成骑行报告</div>
                            <div className="report-skeleton-line report-skeleton-line-lg" />
                            <div className="report-skeleton-line" />
                            <div className="report-skeleton-line report-skeleton-line-short" />
                            <div className="report-skeleton-section">
                              <div className="report-skeleton-title" />
                              <div className="report-skeleton-line" />
                              <div className="report-skeleton-line" />
                              <div className="report-skeleton-line report-skeleton-line-short" />
                            </div>
                            <div className="report-skeleton-section">
                              <div className="report-skeleton-title" />
                              <div className="report-skeleton-line" />
                              <div className="report-skeleton-line report-skeleton-line-short" />
                            </div>
                          </div>
                        ) : (
                          <p className="muted">点击右上角开始生成 AI 报告。</p>
                        )}
                      </div>
                    </section>

                    <section className="modal-section chat-modal-section">
                      <div className="modal-section-title">
                        <div>
                          <h3>继续问 AI</h3>
                          <p className="muted chat-section-subtitle">围绕这次骑行继续追问恢复、补给、功率等问题</p>
                        </div>
                        <span className="pill">{chatStateLabel}</span>
                      </div>
                      {showSuggestedPrompts ? (
                        <div className="chat-suggested-block">
                          <div className="chat-suggested-head">
                            <strong>猜你想问</strong>
                            {suggestedQuestionBatches.length > 1 ? (
                              <button
                                type="button"
                                className="chat-switch-batch"
                                onClick={() => setSuggestedPage((current) => current + 1)}
                              >
                                换一批
                              </button>
                            ) : null}
                          </div>
                          <div className="suggested-prompts">
                            {currentSuggestedQuestions.map((item) => (
                              <button key={item} type="button" className="suggested-prompt" onClick={() => setQuestion(item)}>
                                {item}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {chatError ? <p className="error-banner">{chatError}</p> : null}
                      {chatStatus ? <p className="success-banner">{chatStatus}</p> : null}
                      <div className="chat-shell chat-shell-embedded">
                        <div className="chat-list chat-list-embedded" ref={chatListRef}>
                          {messages.map((message) => (
                            <article
                              key={message.id}
                              className={
                                message.role === "assistant"
                                  ? "chat-bubble chat-bubble-assistant"
                                  : "chat-bubble chat-bubble-user"
                              }
                            >
                              <div className="chat-role">{message.role === "assistant" ? "AI 教练" : "你"}</div>
                              {message.role === "assistant" ? (
                                <>
                                  <div className={expandedMessageIds.includes(message.id) ? "chat-message-rich" : "chat-message-rich chat-message-rich-collapsed"}>
                                    <AiRichText text={message.content} />
                                  </div>
                                  {message.content.length > 180 ? (
                                    <button type="button" className="chat-expand-button" onClick={() => toggleMessageExpanded(message.id)}>
                                      {expandedMessageIds.includes(message.id) ? "收起全文" : "展开全文"}
                                    </button>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <p className={expandedMessageIds.includes(message.id) ? "chat-plain" : "chat-plain chat-plain-clamped"}>{message.content}</p>
                                  {message.content.length > 40 ? (
                                    <button type="button" className="chat-expand-button" onClick={() => toggleMessageExpanded(message.id)}>
                                      {expandedMessageIds.includes(message.id) ? "收起" : "展开"}
                                    </button>
                                  ) : null}
                                </>
                              )}
                            </article>
                          ))}
                          {streamingText ? (
                            <article className="chat-bubble chat-bubble-assistant chat-bubble-streaming">
                              <div className="chat-role">AI 教练</div>
                              <AiRichText text={streamingText} />
                            </article>
                          ) : null}
                          {!messages.length && !streamingText ? (
                            <div className="chat-empty">
                              <strong>还没有对话</strong>
                              <p>试试直接问：我这次后半程为什么掉功率？或者未来 3 天怎么安排训练？</p>
                            </div>
                          ) : null}
                        </div>

                        <form onSubmit={handleChatSubmit} className="chat-form">
                          <label>
                            继续提问
                            <textarea
                              name="question"
                              value={question}
                              onChange={(event) => setQuestion(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  void submitQuestion();
                                }
                              }}
                              placeholder="继续问恢复、补给、功率、心率等问题"
                              rows={2}
                            />
                          </label>
                          <div className="chat-form-footer">
                            <span className="muted chat-shortcut-hint">Enter 发送，Shift+Enter 换行</span>
                            <button type="submit" className="primary" disabled={isStreaming || !question.trim()}>
                              {isStreaming ? "生成中..." : "发送给 AI"}
                            </button>
                          </div>
                        </form>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
