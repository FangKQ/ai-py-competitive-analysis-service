"use client";

import { useState, useEffect, useCallback } from "react";
import { useHistory } from "@/lib/history-context";
import {
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  Cpu,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FOCUS_AREA_LABELS: Record<string, string> = {
  product: "产品功能",
  pricing: "定价策略",
  technology: "技术架构",
  market: "市场策略",
  user_experience: "用户体验",
  ecosystem: "生态系统",
  team: "团队背景",
  funding: "融资情况",
};

interface TaskHistoryItem {
  id: string;
  query: string;
  self_description: string;
  competitors: string[];
  industry: string;
  focus_areas: string[];
  report_depth: string;
  status: "running" | "completed" | "failed";
  executive_summary: string | null;
  total_tokens: number;
  total_duration_ms: number;
  created_at: string;
  completed_at: string | null;
}

function formatBeijingTime(timestamp: string): string {
  if (!timestamp) return "";
  const hasTimezone =
    timestamp.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(timestamp);
  let date: Date;
  if (hasTimezone) {
    date = new Date(timestamp);
  } else {
    date = new Date(timestamp + "Z");
  }
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const h = String((date.getUTCHours() + 8) % 24).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month}-${day} ${h}:${m}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        运行中
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3" />
        已完成
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
      <XCircle className="w-3 h-3" />
      失败
    </span>
  );
}

function HistoryItem({ item }: { item: TaskHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);

  const handleExpand = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const handleViewReport = useCallback(async () => {
    if (report) {
      setShowFullReport(true);
      return;
    }
    setLoadingReport(true);
    try {
      const res = await fetch(`${API_BASE}/api/history/${item.id}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data.markdown_report || "");
        setShowFullReport(true);
      }
    } catch (e) {
      console.error("Failed to load report:", e);
    } finally {
      setLoadingReport(false);
    }
  }, [item.id, report]);

  const [exporting, setExporting] = useState(false);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${item.id}/export/pdf`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      let filename = `${item.query.slice(0, 30)}.pdf`;
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
  }, [item.id, item.query]);

  return (
    <div className="border border-surface-700/60 rounded-lg overflow-hidden bg-surface-800/40 hover:bg-surface-800/70 transition-colors">
      {/* Summary row */}
      <button
        onClick={handleExpand}
        className="w-full px-4 py-3 flex items-start gap-3 text-left"
      >
        <div className="mt-0.5">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-surface-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-surface-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={item.status} />
            <span className="text-[11px] text-surface-500">
              {formatBeijingTime(item.created_at)}
            </span>
          </div>
          <p className="text-sm font-medium text-surface-100 truncate">
            {item.query}
          </p>
          {item.competitors && item.competitors.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {item.competitors.slice(0, 3).map((c) => (
                <span
                  key={c}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-400"
                >
                  {c}
                </span>
              ))}
              {item.competitors.length > 3 && (
                <span className="text-[10px] text-surface-500">
                  +{item.competitors.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-surface-700/40 space-y-3">
          {/* User inputs */}
          <div className="space-y-2 text-xs">
            {item.self_description && (
              <div>
                <span className="text-surface-500">自身情况：</span>
                <span className="text-surface-300">{item.self_description.slice(0, 100)}{item.self_description.length > 100 ? "..." : ""}</span>
              </div>
            )}
            {item.industry && (
              <div>
                <span className="text-surface-500">行业：</span>
                <span className="text-surface-300">{item.industry}</span>
              </div>
            )}
            {item.focus_areas && item.focus_areas.length > 0 && (
              <div className="flex items-start gap-1">
                <span className="text-surface-500 flex-shrink-0">关注维度：</span>
                <div className="flex flex-wrap gap-1">
                  {item.focus_areas.map((f) => (
                    <span key={f} className="px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-300 text-[10px]">
                      {FOCUS_AREA_LABELS[f] || f}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {item.report_depth && (
              <div>
                <span className="text-surface-500">报告篇幅：</span>
                <span className="text-surface-300">{item.report_depth === "brief" ? "精炼版" : "标准版"}</span>
              </div>
            )}
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-4 text-xs text-surface-400">
            {item.total_duration_ms > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {(item.total_duration_ms / 1000).toFixed(1)}s
              </span>
            )}
            {item.total_tokens > 0 && (
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                {item.total_tokens >= 1000
                  ? `${(item.total_tokens / 1000).toFixed(1)}k`
                  : item.total_tokens}{" "}
                tokens
              </span>
            )}
          </div>

          {/* Summary */}
          {item.executive_summary && (
            <p className="text-xs text-surface-300 leading-relaxed line-clamp-4">
              {item.executive_summary.slice(0, 200)}
              {item.executive_summary.length > 200 ? "..." : ""}
            </p>
          )}

          {/* Actions */}
          {item.status === "completed" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleViewReport}
                disabled={loadingReport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                {loadingReport ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <FileText className="w-3 h-3" />
                )}
                查看报告
              </button>
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-700 hover:bg-surface-600 disabled:opacity-60 text-surface-200 rounded-lg border border-surface-600 transition-colors"
              >
                {exporting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {exporting ? "导出中..." : "导出 PDF"}
              </button>
            </div>
          )}

          {item.status === "running" && (
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <Zap className="w-3 h-3" />
              <span>任务正在执行中，完成后可查看报告</span>
            </div>
          )}

          {/* Full report inline */}
          {showFullReport && report && (
            <div className="mt-3 border-t border-surface-700/40 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-surface-300">
                  完整报告
                </span>
                <button
                  onClick={() => setShowFullReport(false)}
                  className="text-xs text-surface-500 hover:text-surface-300"
                >
                  收起
                </button>
              </div>
              <div className="prose prose-invert prose-sm max-w-none max-h-96 overflow-y-auto scrollbar-thin rounded-lg bg-surface-900/60 p-4 border border-surface-700/40">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {report}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoryDrawer() {
  const { isOpen, close } = useHistory();
  const [tasks, setTasks] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch history when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API_BASE}/api/history`)
      .then((res) => res.json())
      .then((data) => {
        setTasks(data.tasks || []);
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Auto-refresh every 10s while open (for running tasks)
  useEffect(() => {
    if (!isOpen) return;
    const hasRunning = tasks.some((t) => t.status === "running");
    if (!hasRunning) return;

    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/history`)
        .then((res) => res.json())
        .then((data) => setTasks(data.tasks || []))
        .catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, [isOpen, tasks]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-surface-900 border-l border-surface-700 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700 bg-surface-900/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-400" />
            <h3 className="text-base font-semibold">分析历史</h3>
          </div>
          <button
            onClick={close}
            className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto h-[calc(100%-65px)] p-4 space-y-3 scrollbar-thin">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
            </div>
          )}

          {!loading && tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-500">
              <FileText className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">暂无分析记录</p>
              <p className="text-xs mt-1 opacity-60">
                创建分析任务后，记录将自动保存在此
              </p>
            </div>
          )}

          {!loading &&
            tasks.map((task) => <HistoryItem key={task.id} item={task} />)}
        </div>
      </div>
    </>
  );
}
