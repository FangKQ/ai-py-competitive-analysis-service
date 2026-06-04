"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Clock, Cpu, Wrench, CheckCircle2, XCircle } from "lucide-react";

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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
}

function useTypewriter(text: string, speed: number = 15): string {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (!text) {
      setDisplayed("");
      return;
    }
    indexRef.current = 0;
    setDisplayed("");
    const timer = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        clearInterval(timer);
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return displayed;
}

function TraceCard({ trace }: { trace: TraceEntry }) {
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const hasToolCalls = trace.toolCalls && trace.toolCalls.length > 0;
  const maxChars = 200;
  const isLong = trace.reasoning && trace.reasoning.length > maxChars;
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  return (
    <div className="border border-surface-700 rounded-xl bg-surface-800/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary-500/10 text-primary-300">
          {trace.nodeId}
        </span>

        <span className="text-sm font-medium text-surface-100 flex-1">
          {trace.label}
        </span>

        <div className="flex items-center gap-3 text-xs text-surface-400">
          {trace.tokens > 0 && (
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              {formatTokens(trace.tokens)} tokens
            </span>
          )}
          {trace.duration > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(trace.duration)}
            </span>
          )}
        </div>
      </div>

      {/* Reasoning with gradient fade */}
      {trace.reasoning && (
        <div className="px-4 pb-3 relative">
          <div className={`${!reasoningExpanded && isLong ? "max-h-[80px] overflow-hidden" : ""}`}>
            <p className="text-xs text-surface-300 leading-relaxed whitespace-pre-wrap">
              {trace.reasoning}
            </p>
          </div>
          {/* Gradient fade overlay */}
          {isLong && !reasoningExpanded && (
            <div className="absolute bottom-3 left-0 right-0 h-10 bg-gradient-to-t from-surface-800/90 to-transparent flex items-end justify-center pb-1">
              <button
                onClick={() => setReasoningExpanded(true)}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                展开全部
              </button>
            </div>
          )}
          {isLong && reasoningExpanded && (
            <button
              onClick={() => setReasoningExpanded(false)}
              className="text-xs text-primary-400 hover:text-primary-300 mt-1"
            >
              收起
            </button>
          )}
        </div>
      )}

      {/* Tool calls section - only show if there are actual tool calls */}
      {hasToolCalls && (
        <div className="border-t border-surface-700">
          <button
            onClick={() => setToolsExpanded(!toolsExpanded)}
            className="w-full px-4 py-2 flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-300 transition-colors"
          >
            {toolsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Wrench className="w-3 h-3" />
            <span>工具调用 ({trace.toolCalls.length})</span>
          </button>
          {toolsExpanded && (
            <div className="px-4 pb-3 space-y-2">
              {trace.toolCalls.map((tc, i) => (
                <div key={i} className="bg-surface-900 rounded-lg p-3 text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    {tc.status === "success" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span className="font-mono font-medium text-surface-200">{tc.tool}</span>
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
                      <span className="text-surface-300">{tc.output_summary}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TracePanel({ traces }: TracePanelProps) {
  if (traces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-surface-400">
        <Clock className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">等待 Agent 执行...</p>
        <p className="text-xs mt-1 opacity-60">决策日志将实时显示在此处</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-surface-200">决策追踪日志</h3>
        <span className="text-xs text-surface-500">{traces.length} 条记录</span>
      </div>
      {traces.map((trace) => (
        <TraceCard key={trace.id} trace={trace} />
      ))}
    </div>
  );
}
