"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Wrench,
  CheckCircle2,
  XCircle,
  Zap,
  Brain,
  Search,
  PenTool,
  Shield,
  Scale,
  Quote,
} from "lucide-react";

interface ToolCall {
  tool: string;
  input: string;
  output_summary: string;
  status: string;
}

interface TraceEntry {
  id: string;
  nodeId: string;
  label: string;
  role: string;
  action: string;
  reasoning: string;
  toolCalls: ToolCall[];
  tokens: number;
  duration: number;
  timestamp: string;
}

interface TracePanelProps {
  traces: TraceEntry[];
}

// Role-based visual configuration
const ROLE_CONFIG: Record<
  string,
  { color: string; glow: string; icon: typeof Zap; label: string }
> = {
  orchestrator: {
    color: "from-violet-400 to-fuchsia-500",
    glow: "shadow-violet-500/40",
    icon: Brain,
    label: "编排",
  },
  collector: {
    color: "from-cyan-400 to-blue-500",
    glow: "shadow-cyan-500/40",
    icon: Search,
    label: "采集",
  },
  analyst: {
    color: "from-amber-400 to-orange-500",
    glow: "shadow-amber-500/40",
    icon: Zap,
    label: "分析",
  },
  writer: {
    color: "from-emerald-400 to-teal-500",
    glow: "shadow-emerald-500/40",
    icon: PenTool,
    label: "撰写",
  },
  arbiter: {
    color: "from-rose-400 to-pink-500",
    glow: "shadow-rose-500/40",
    icon: Scale,
    label: "仲裁",
  },
  reviewer: {
    color: "from-indigo-400 to-blue-600",
    glow: "shadow-indigo-500/40",
    icon: Shield,
    label: "审核",
  },
  citation: {
    color: "from-yellow-400 to-amber-500",
    glow: "shadow-yellow-500/40",
    icon: Quote,
    label: "引用",
  },
};

const DEFAULT_ROLE_CONFIG = {
  color: "from-slate-400 to-slate-500",
  glow: "shadow-slate-500/40",
  icon: Zap,
  label: "执行",
};

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role] || DEFAULT_ROLE_CONFIG;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
}

function formatTime(timestamp: string): string {
  try {
    // Parse the timestamp — treat bare timestamps (no Z/offset) as UTC
    // because the backend server runs in UTC timezone
    let date: Date;
    const hasTimezone = timestamp.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(timestamp);
    if (hasTimezone) {
      date = new Date(timestamp);
    } else {
      // No timezone suffix — backend is UTC, append Z to parse as UTC
      date = new Date(timestamp + "Z");
    }
    // Convert UTC to Beijing time (UTC+8)
    const h = String((date.getUTCHours() + 8) % 24).padStart(2, "0");
    const m = String(date.getUTCMinutes()).padStart(2, "0");
    const s = String(date.getUTCSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  } catch {
    return "";
  }
}

function TimelineNode({
  trace,
  index,
  isLast,
}: {
  trace: TraceEntry;
  index: number;
  isLast: boolean;
}) {
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  const config = getRoleConfig(trace.role);
  const RoleIcon = config.icon;
  const hasToolCalls = trace.toolCalls && trace.toolCalls.length > 0;

  // Line-based truncation
  const lines = trace.reasoning ? trace.reasoning.split("\n") : [];
  const isLong = lines.length > 3;

  // Staggered entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={nodeRef}
      className={`timeline-node relative flex gap-0 transition-all duration-500 ease-out ${
        visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Timeline spine + node marker */}
      <div className="flex flex-col items-center flex-shrink-0 w-16 relative">
        {/* Time label */}
        <span className="text-[10px] font-mono text-surface-500 mb-1.5 whitespace-nowrap">
          {formatTime(trace.timestamp)}
        </span>

        {/* Node marker */}
        <div
          className={`relative w-8 h-8 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center shadow-lg ${config.glow} z-10 ring-2 ring-surface-900`}
        >
          <RoleIcon className="w-4 h-4 text-white" />
          {/* Pulse ring for latest entry */}
          {isLast && (
            <span className="absolute inset-0 rounded-full animate-timeline-ping opacity-60">
              <span
                className={`absolute inset-0 rounded-full bg-gradient-to-br ${config.color} opacity-40`}
              />
            </span>
          )}
        </div>

        {/* Connecting line */}
        {!isLast && (
          <div className="flex-1 w-px mt-1.5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-surface-600 via-surface-700 to-surface-700" />
            {/* Animated data flow pulse */}
            <div className="absolute inset-x-0 h-6 animate-timeline-flow bg-gradient-to-b from-transparent via-primary-500/60 to-transparent" />
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="ml-2 border border-surface-700/80 rounded-xl bg-surface-800/60 backdrop-blur-sm overflow-hidden hover:border-surface-600/80 transition-colors duration-200 group">
          {/* Card header */}
          <div className="px-4 py-3 flex items-center gap-3">
            {/* Role badge */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r ${config.color} text-white/90`}
            >
              {config.label}
            </span>

            <span className="text-sm font-medium text-surface-100 flex-1 truncate">
              {trace.label}
            </span>

            {/* Metrics */}
            <div className="flex items-center gap-3 text-xs text-surface-400 flex-shrink-0">
              {trace.tokens > 0 && (
                <span className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <Cpu className="w-3 h-3" />
                  {formatTokens(trace.tokens)} tokens
                </span>
              )}
              {trace.duration > 0 && (
                <span className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <Clock className="w-3 h-3" />
                  {formatDuration(trace.duration)}
                </span>
              )}
            </div>
          </div>

          {/* Reasoning */}
          {trace.reasoning && (
            <div className="px-4 pb-3">
              <p className="text-xs text-surface-300/90 leading-relaxed whitespace-pre-wrap">
                {reasoningExpanded || !isLong
                  ? trace.reasoning
                  : lines.slice(0, 3).join("\n") + "..."}
              </p>
              {isLong && (
                <button
                  onClick={() => setReasoningExpanded(!reasoningExpanded)}
                  className="text-[11px] text-primary-400 hover:text-primary-300 mt-1.5 transition-colors"
                >
                  {reasoningExpanded ? "收起" : "展开全部"}
                </button>
              )}
            </div>
          )}

          {/* Tool calls */}
          {hasToolCalls && (
            <div className="border-t border-surface-700/60">
              <button
                onClick={() => setToolsExpanded(!toolsExpanded)}
                className="w-full px-4 py-2 flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-300 transition-colors"
              >
                {toolsExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <Wrench className="w-3 h-3" />
                <span>工具调用 ({trace.toolCalls.length})</span>
              </button>
              {toolsExpanded && (
                <div className="px-4 pb-3 space-y-2">
                  {trace.toolCalls.map((tc, i) => (
                    <div
                      key={i}
                      className="bg-surface-900/80 rounded-lg p-3 text-xs space-y-1.5 border border-surface-700/40"
                    >
                      <div className="flex items-center gap-2">
                        {tc.status === "success" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className="font-mono font-medium text-surface-200">
                          {tc.tool}
                        </span>
                      </div>
                      {tc.input && (
                        <div className="text-surface-500">
                          <span className="text-surface-600">输入：</span>
                          <span className="text-surface-400">{tc.input}</span>
                        </div>
                      )}
                      {tc.output_summary && (
                        <div className="text-surface-500">
                          <span className="text-surface-600">输出：</span>
                          <span className="text-surface-300">
                            {tc.output_summary}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TracePanel({ traces }: TracePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new traces arrive
  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current;
      // Only auto-scroll if user is near the bottom
      const isNearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
  }, [traces.length]);

  if (traces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-surface-400">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-2 border-surface-700 flex items-center justify-center">
            <Clock className="w-7 h-7 opacity-50" />
          </div>
          {/* Orbiting dot */}
          <div className="absolute inset-0 animate-spin-slow">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 rounded-full bg-primary-500/60" />
          </div>
        </div>
        <p className="text-sm mt-4 font-medium">等待 Agent 执行...</p>
        <p className="text-xs mt-1 opacity-50">决策日志将以时间线形式实时展示</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-4 pr-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pl-16 ml-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-surface-200 tracking-wide">
            决策追踪日志
          </h3>
        </div>
        <span className="text-[11px] text-surface-500 font-mono">
          {traces.length} 条记录
        </span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {traces.map((trace, index) => (
          <TimelineNode
            key={trace.id}
            trace={trace}
            index={index}
            isLast={index === traces.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
