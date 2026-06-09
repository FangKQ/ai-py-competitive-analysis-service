"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Download, ExternalLink, Copy, Check, Loader2 } from "lucide-react";

interface ReportViewProps {
  content: string | null;
  taskId?: string | null;
}

export default function ReportView({ content, taskId }: ReportViewProps) {
  const [copiedFootnote, setCopiedFootnote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  if (!content) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <FileText className="w-12 h-12 text-surface-600 mx-auto mb-3" />
          <p className="text-surface-400 font-medium">报告生成中...</p>
          <p className="text-sm text-surface-500 mt-1">
            Agent 完成分析后，报告将显示在此处
          </p>
        </div>
      </div>
    );
  }

  const handleCopyReport = async () => {
    await navigator.clipboard.writeText(content);
  };

  const handleExportPDF = async () => {
    if (!taskId) return;
    setExporting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/tasks/${taskId}/export/pdf`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      // Extract filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition") || "";
      let filename = "竞品分析报告.pdf";
      const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/);
      if (utf8Match) {
        filename = decodeURIComponent(utf8Match[1]);
      } else {
        const basicMatch = disposition.match(/filename="?([^"]+)"?/);
        if (basicMatch) filename = decodeURIComponent(basicMatch[1]);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="scrollbar-thin">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-end mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-surface-300 bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              复制
            </button>
            <button
              onClick={handleExportPDF}
              disabled={!taskId || exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-surface-300 bg-surface-800 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed border border-surface-700 rounded-lg transition-colors"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? "导出中..." : "导出 PDF"}
            </button>
          </div>
        </div>

        <article className="prose prose-invert prose-sm max-w-none bg-surface-800/50 border border-surface-700 rounded-xl p-8">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-surface-50 mb-4 pb-3 border-b border-surface-700">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-surface-100 mt-8 mb-3 flex items-center gap-2">
                  <span className="w-1 h-6 bg-primary-500 rounded-full" />
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-semibold text-surface-200 mt-6 mb-2">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-surface-300 leading-relaxed mb-4">
                  {children}
                </p>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-4 rounded-lg border border-surface-700">
                  <table className="w-full text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-surface-700/50">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-4 py-2.5 text-left font-semibold text-surface-200 border-b border-surface-700">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-2.5 text-surface-300 border-b border-surface-700/50">
                  {children}
                </td>
              ),
              ul: ({ children }) => (
                <ul className="space-y-1.5 my-3 text-surface-300">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="space-y-2 my-3 text-surface-300 list-decimal list-inside">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-surface-300 leading-relaxed">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-surface-100">
                  {children}
                </strong>
              ),
              hr: () => <hr className="border-surface-700 my-6" />,
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-400 hover:text-primary-300 underline underline-offset-2 inline-flex items-center gap-0.5"
                >
                  {children}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ),
              sup: ({ children }) => {
                const text = String(children);
                return (
                  <sup className="relative group">
                    <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-primary-500/20 text-primary-300 rounded cursor-pointer hover:bg-primary-500/30 transition-colors">
                      {text}
                    </span>
                  </sup>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
