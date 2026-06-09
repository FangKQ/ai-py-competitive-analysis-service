"use client";

import { useState, useEffect, useRef } from "react";
import DAGView from "@/components/DAGView";
import TracePanel from "@/components/TracePanel";

interface DAGNodeInfo {
  id: string;
  role: string;
  label: string;
  status: "idle" | "running" | "completed" | "error";
}

interface TraceEntry {
  id: string;
  nodeId: string;
  label: string;
  role: string;
  action: string;
  reasoning: string;
  toolCalls: { tool: string; input: string; output_summary: string; status: string }[];
  tokens: number;
  duration: number;
  timestamp: string;
}

const DEMO_NODES: DAGNodeInfo[] = [
  { id: "orchestrate", role: "orchestrator", label: "编排器", status: "completed" },
  { id: "collect_industry", role: "collector", label: "行业/趋势采集", status: "idle" },
  { id: "collect_customer", role: "collector", label: "市场/客户采集", status: "idle" },
  { id: "collect_competitor_0", role: "collector", label: "GitHub Copilot", status: "idle" },
  { id: "collect_competitor_1", role: "collector", label: "Cursor", status: "idle" },
  { id: "analyze_gpt", role: "analyst", label: "分析师(GPT)", status: "idle" },
  { id: "analyze_claude", role: "analyst", label: "分析师(Claude)", status: "idle" },
  { id: "arbiter_analysis", role: "arbiter", label: "仲裁官(分析)", status: "idle" },
  { id: "writer_gpt", role: "writer", label: "撰写者(GPT)", status: "idle" },
  { id: "writer_claude", role: "writer", label: "撰写者(Claude)", status: "idle" },
  { id: "arbiter_report", role: "arbiter", label: "仲裁官(报告)", status: "idle" },
  { id: "cite", role: "citation", label: "引用器", status: "idle" },
  { id: "review", role: "reviewer", label: "审核员", status: "idle" },
];

const SEQUENCE = [
  { id: "collect_industry", delay: 500 },
  { id: "collect_customer", delay: 1000 },
  { id: "collect_competitor_0", delay: 1500 },
  { id: "collect_competitor_1", delay: 2000 },
  { id: "analyze_gpt", delay: 4000 },
  { id: "analyze_claude", delay: 4300 },
  { id: "arbiter_analysis", delay: 7000 },
  { id: "writer_gpt", delay: 8500 },
  { id: "writer_claude", delay: 8800 },
  { id: "arbiter_report", delay: 11500 },
  { id: "cite", delay: 13000 },
  { id: "review", delay: 14500 },
];

export default function InlineDemo() {
  const [dagNodes, setDagNodes] = useState<DAGNodeInfo[]>(DEMO_NODES);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  // Start demo when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  // Run demo animation
  useEffect(() => {
    if (!started) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    SEQUENCE.forEach(({ id, delay }) => {
      // Start running
      const t1 = setTimeout(() => {
        setDagNodes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, status: "running" } : n))
        );
      }, delay);

      // Complete + add trace
      const t2 = setTimeout(() => {
        setDagNodes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, status: "completed" } : n))
        );

        const roleLabel = id.includes("arbiter")
          ? "arbiter"
          : id.includes("analyze")
          ? "analyst"
          : id.includes("writer")
          ? "writer"
          : id.includes("collect")
          ? "collector"
          : id.includes("cite")
          ? "citation"
          : "reviewer";

        setTraces((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            nodeId: id,
            label: DEMO_NODES.find((n) => n.id === id)?.label || id,
            role: roleLabel,
            action: `${id} 完成`,
            reasoning: id.includes("arbiter")
              ? "对比两个模型的分析结果，共识结论直接采纳，冲突项按证据强度择优"
              : id.includes("collect")
              ? "搜索 2 次，获取 5 条结果"
              : "Demo 模式模拟执行",
            toolCalls: id.includes("collect")
              ? [{ tool: "web_search", input: "demo query", output_summary: "获取 5 条搜索结果", status: "success" }]
              : [],
            tokens: Math.floor(Math.random() * 3000) + 500,
            duration: Math.floor(Math.random() * 5000) + 2000,
            timestamp: new Date().toISOString(),
          },
        ]);
      }, delay + 1500);

      timersRef.current.push(t1, t2);
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [started]);

  // Show report after all nodes complete
  const allDone = SEQUENCE.every(({ id }) => {
    const node = dagNodes.find((n) => n.id === id);
    return node?.status === "completed";
  });
  const [reportOpen, setReportOpen] = useState(false);
  const [fading, setFading] = useState(false);

  // Open report panel when done
  useEffect(() => {
    if (!allDone) return;
    const timer = setTimeout(() => setReportOpen(true), 800);
    return () => clearTimeout(timer);
  }, [allDone]);

  // Loop: fade out → reset → fade in → restart
  useEffect(() => {
    if (!allDone || !started) return;
    const timer = setTimeout(() => {
      // Start fade out
      setFading(true);
      setTimeout(() => {
        setReportOpen(false);
        setDagNodes(DEMO_NODES);
        setTraces([]);
        setStarted(false);
        // Fade back in and restart
        setTimeout(() => {
          setFading(false);
          setTimeout(() => setStarted(true), 300);
        }, 100);
      }, 500);
    }, 8000);
    return () => clearTimeout(timer);
  }, [allDone, started]);

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl overflow-hidden bg-surface-900 border border-surface-700/50 shadow-[0_4px_40px_-8px_rgba(0,0,0,0.5)] relative transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* DAG */}
      <div className="h-[280px] relative overflow-hidden">
        <DAGView nodes={dagNodes} />
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-surface-600/80 to-transparent" />

      {/* Trace */}
      <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
        <TracePanel traces={traces} />
      </div>

      {/* Report slide-in panel (mirroring real behavior) */}
      {allDone && (
        <>
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 z-10 ${
              reportOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setReportOpen(false)}
          />
          <div
            className={`absolute top-0 right-0 z-20 h-full w-full max-w-sm bg-surface-900 border-l border-surface-700 shadow-2xl transition-transform duration-300 ease-out ${
              reportOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 bg-surface-900/95 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-primary-500/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-sm bg-primary-400" />
                </div>
                <h3 className="text-sm font-semibold text-surface-100">竞品分析报告</h3>
              </div>
              <button
                onClick={() => setReportOpen(false)}
                className="text-xs text-surface-500 hover:text-surface-300 px-2 py-1 rounded hover:bg-surface-800"
              >
                关闭
              </button>
            </div>
            <div className="overflow-y-auto h-[calc(100%-49px)] p-4 text-xs text-surface-300 leading-relaxed space-y-3 scrollbar-thin">
              <h4 className="text-sm font-bold text-surface-100">AI 编程助手市场竞争分析报告</h4>
              <p className="font-medium text-surface-200">摘要</p>
              <p>全球 AI 编程助手市场 2025 年规模约 50 亿美元，年复合增长率 27.1%。GitHub Copilot 和 Cursor 占据领导地位，市场正从代码补全向全链路 AI 开发平台演进。</p>
              <p className="font-medium text-surface-200">一、看行业/趋势</p>
              <p>关键技术趋势包括多模态理解、Agent 化工作流、长上下文支持。预计 2028 年市场突破 200 亿美元。[1]</p>
              <p className="font-medium text-surface-200">二、看市场/客户</p>
              <p>企业客户决策因素：安全合规 &gt; 集成能力 &gt; 代码质量 &gt; 价格。未被满足的需求集中在私有化部署和行业定制化。[2]</p>
              <p className="font-medium text-surface-200">三、看竞争</p>
              <p>GitHub Copilot 代码补全强、安全合规强；Cursor Agent 能力强；Codeium 价格竞争力强。[3]</p>
              <p className="font-medium text-surface-200 mt-2">...</p>
              <div className="border-t border-surface-700/50 pt-3 mt-4">
                <p className="text-[10px] text-surface-500">完整报告包含 8 章节 · 12 条数据引用 · 5200+ 字</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
