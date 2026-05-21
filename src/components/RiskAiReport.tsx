import { BrainCircuit } from "lucide-react";
import type { RiskReport } from "@/lib/aiRiskReport";

interface RiskAiReportProps {
  report: RiskReport;
}

export function RiskAiReport({ report }: RiskAiReportProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
            <BrainCircuit className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">AI 해석 리포트</h2>
            <p className="text-xs text-slate-500">{report.source === "openai" ? "OpenAI 구조화 리포트" : "기본 해석 리포트"}</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{report.phase}</span>
      </div>

      <div className="mt-5">
        <p className="text-xl font-semibold leading-7 text-slate-950">{report.headline}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{report.summary}</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {report.sections.map((section) => (
          <div key={section.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-950">{section.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{section.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-950">대응 체크</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {report.actions.map((action) => (
            <div key={action.label} className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">{action.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{action.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">{report.caveat}</p>
    </section>
  );
}
