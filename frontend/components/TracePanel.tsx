"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Search,
  BarChart3,
  PenTool,
  ShieldCheck,
  Link2,
  Clock,
  Zap,
  Terminal,
} from "lucide-react";

interface TraceEntry {
  id: string;
  agent: string;
  action: string;
  reasoning: string;
  toolCalls: string[];
  tokens: number;
  duration: number;
  timestamp: string;
}

interface TracePanelProps {
  traces: TraceEntry[];
}

const AGENT_ICONS: Record<string, typeof Brain> = {
  orchestrator: Brain,
  collector: Search,
  analyst: BarChart3,
  writer: PenTool,
  reviewer: ShieldCheck,
  citation: Link2,
};

const AGENT_COLORS: Record<string, string> = {
  orchestrator: "#8b5cf6",
  collector: "#06b6d4",
  analyst: "#f59e0b",
  writer: "#10b981",
  reviewer: "#ef4444",
  citation: "#ec4899",
};

const AGENT_LABELS: Record<string, string> = {
  orchestrator: "编排器",
  collector: "采集器",
  analyst: "分析师",
  writer: "撰写者",
  reviewer: "审核员",
  citation: "引用器",
};

export default function TracePanel({ traces }: TracePanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (traces.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-12 h-12 text-surface-600 mx-auto mb-3" />
          <p className="text-surface-400 font-medium">等待 Agent 执行...</p>
          <p className="text-sm text-surface-500 mt-1">
            决策日志将实时显示在此处
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Terminal className="w-5 h-5 text-primary-400" />
          <h3 className="text-lg font-semibold">决策追踪日志</h3>
          <span className="ml-auto text-xs text-surface-500 bg-surface-800 px-2.5 py-1 rounded-full">
            {traces.length} 条记录
          </span>
        </div>

        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-surface-700" />

          <div className="space-y-4">
            {traces.map((trace, index) => {
              const Icon = AGENT_ICONS[trace.agent] || Brain;
              const color = AGENT_COLORS[trace.agent] || "#6366f1";
              const label = AGENT_LABELS[trace.agent] || trace.agent;
              const isExpanded = expandedIds.has(trace.id);

              return (
                <div
                  key={trace.id}
                  className="relative pl-12 animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div
                    className="absolute left-2 top-3 w-[22px] h-[22px] rounded-full flex items-center justify-center z-10"
                    style={{ backgroundColor: `${color}20`, border: `2px solid ${color}` }}
                  >
                    <Icon className="w-3 h-3" style={{ color }} />
                  </div>

                  <div className="bg-surface-800/70 border border-surface-700 rounded-xl p-4 hover:border-surface-600 transition-colors">
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => toggleExpand(trace.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-surface-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-surface-400 shrink-0" />
                      )}

                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: `${color}15`,
                          color: color,
                        }}
                      >
                        {label}
                      </span>

                      <span className="text-sm text-surface-200 font-medium flex-1">
                        {trace.action}
                      </span>

                      <div className="flex items-center gap-3 text-xs text-surface-500">
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {trace.tokens} tokens
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {(trace.duration / 1000).toFixed(1)}s
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-surface-700 space-y-3">
                        {trace.reasoning && (
                          <div>
                            <span className="text-xs font-medium text-surface-400 uppercase tracking-wide">
                              推理过程
                            </span>
                            <p className="text-sm text-surface-300 mt-1 leading-relaxed">
                              {trace.reasoning}
                            </p>
                          </div>
                        )}

                        {trace.toolCalls.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-surface-400 uppercase tracking-wide">
                              工具调用
                            </span>
                            <div className="mt-1 space-y-1">
                              {trace.toolCalls.map((call, i) => (
                                <code
                                  key={i}
                                  className="block text-xs bg-surface-900 px-3 py-1.5 rounded font-mono text-primary-300"
                                >
                                  {call}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-surface-500">
                          {new Date(trace.timestamp).toLocaleTimeString("zh-CN")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
