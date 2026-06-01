"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  basisDates?: string[];
  source?: "openai" | "fallback";
};

type AdviceApiResponse = {
  ok: boolean;
  data?: {
    source: "openai" | "fallback";
    mode: "general" | "app_context" | "backtest_context";
    answer: string;
    basisDates: string[];
    referencedIndicators: string[];
  };
  error?: string;
};

const starterQuestions = [
  "현재 시장 위험 점수가 왜 이렇게 나왔는지 설명해줘",
  "최근 수급에서 가장 주의할 점은 뭐야?",
  "지수와 신용잔고를 같이 보면 위험한 구간이야?",
  "백테스트 결과상 sell/reduce 신호는 신뢰할 만해?"
];

export function MarketAdviceChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "시장 위험 데이터와 최신 신호를 기준으로 질문에 답합니다. 종목 매수/매도 지시는 하지 않고, 위험 요인과 점검 시나리오를 중심으로 설명합니다."
    }
  ]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const conversation = useMemo(
    () =>
      messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({ role: message.role, content: message.content })),
    [messages]
  );

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setInput("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: trimmed }]);

    try {
      const response = await fetch("/api/ai/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, messages: conversation, currentPath: window.location.pathname })
      });
      const json = (await response.json()) as AdviceApiResponse;
      if (!response.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "AI 상담 응답을 생성하지 못했습니다.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: json.data!.answer,
          basisDates: json.data!.basisDates,
          source: json.data!.source
        }
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 상담 중 오류가 발생했습니다.";
      setMessages((current) => [...current, { role: "assistant", content: message, source: "fallback" }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(input);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open ? (
        <section className="flex h-[min(680px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-950">AI 시장 상담</h2>
                <p className="text-xs text-slate-500">대시보드 데이터 기준</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              aria-label="AI 상담 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="border-b border-slate-100 p-3">
            <div className="flex flex-wrap gap-2">
              {starterQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => ask(question)}
                  disabled={loading}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6 ${
                    message.role === "user" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === "assistant" && message.basisDates && message.basisDates.length > 0 ? (
                    <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                      기준일: {message.basisDates.slice(-3).join(", ")}
                      {message.source ? ` · ${message.source === "openai" ? "OpenAI" : "기본 응답"}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  분석 중
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="border-t border-slate-200 p-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void ask(input);
                  }
                }}
                placeholder="시장 위험, 수급, 신용잔고에 대해 질문..."
                className="min-h-10 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 transition focus:ring-2"
                rows={1}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-label="질문 보내기"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-xl transition hover:bg-slate-800"
      >
        <MessageCircle className="h-4 w-4" />
        AI 상담
      </button>
    </div>
  );
}
