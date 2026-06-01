import { NextResponse } from "next/server";
import { generateMarketAdvice, type MarketAdviceMessage } from "@/lib/aiMarketAdvice";

type AdviceRequestBody = {
  question?: unknown;
  messages?: unknown;
  currentPath?: unknown;
};

function shouldIncludeBacktest(question: string, currentPath: string): boolean {
  const normalized = `${question} ${currentPath}`.toLowerCase();
  return ["backtest", "백테스트", "검증", "성공률", "forward", "5d", "20d", "sell/reduce", "reduce", "action"].some((keyword) =>
    normalized.includes(keyword)
  );
}

function parseMessages(value: unknown): MarketAdviceMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is MarketAdviceMessage => {
      if (typeof item !== "object" || item === null) return false;
      const message = item as Partial<MarketAdviceMessage>;
      return (message.role === "user" || message.role === "assistant") && typeof message.content === "string";
    })
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2000)
    }))
    .slice(-8);
}

export async function POST(request: Request) {
  let body: AdviceRequestBody;
  try {
    body = (await request.json()) as AdviceRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ ok: false, error: "질문을 입력해 주세요." }, { status: 400 });
  }
  if (question.length > 1200) {
    return NextResponse.json({ ok: false, error: "질문은 1200자 이내로 입력해 주세요." }, { status: 400 });
  }

  const currentPath = typeof body.currentPath === "string" ? body.currentPath.slice(0, 200) : "";
  const advice = await generateMarketAdvice(question, parseMessages(body.messages), {
    includeBacktest: shouldIncludeBacktest(question, currentPath),
    currentPath
  });
  return NextResponse.json({ ok: true, data: advice });
}
