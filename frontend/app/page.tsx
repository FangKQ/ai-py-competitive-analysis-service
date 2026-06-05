"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import TaskForm from "@/components/TaskForm";
import DAGView from "@/components/DAGView";
import TracePanel from "@/components/TracePanel";
import ReportView from "@/components/ReportView";
import { createTask, streamEvents } from "@/lib/api";
import {
  Sparkles,
  ArrowRight,
  Activity,
  FileText,
  GitBranch,
  X,
} from "lucide-react";

type AppState = "idle" | "creating" | "running" | "completed";

export interface DAGNodeInfo {
  id: string;
  role: string;
  label: string;
  status: "idle" | "running" | "completed" | "error";
}

export interface TraceEntry {
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function HomePage() {
  const searchParams = useSearchParams();
  const [appState, setAppState] = useState<AppState>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [dagNodes, setDagNodes] = useState<DAGNodeInfo[]>([]);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  // Auto-open task creation form if ?action=create
  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setAppState("creating");
    }
  }, [searchParams]);

  const handleStartAnalysis = () => {
    setAppState("creating");
  };

  const handleSubmitTask = useCallback(
    async (data: {
      query: string;
      selfDescription: string;
      competitors: string[];
      industry: string;
      focusAreas: string[];
      reportDepth: "brief" | "standard";
    }) => {
      try {
        const task = await createTask(data);
        setTaskId(task.id);
        setAppState("running");

        // Start with just orchestrator node
        setDagNodes([
          { id: "orchestrate", role: "orchestrator", label: "编排器", status: "running" },
        ]);

        const eventSource = streamEvents(task.id);

        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);

          // DAG plan received - render full dynamic DAG
          if (payload.type === "dag_plan") {
            const nodes: DAGNodeInfo[] = (payload.data?.nodes || []).map(
              (n: { id: string; role: string; label: string }) => ({
                ...n,
                status: n.id === "orchestrate" ? "completed" : "idle",
              })
            );
            setDagNodes(nodes);
          }

          // Node started
          if (payload.type === "node_started") {
            setDagNodes((prev) =>
              prev.map((n) =>
                n.id === payload.source ? { ...n, status: "running" } : n
              )
            );
          }

          // Node completed
          if (payload.type === "node_completed") {
            setDagNodes((prev) =>
              prev.map((n) =>
                n.id === payload.source ? { ...n, status: "completed" } : n
              )
            );
          }

          // Node failed
          if (payload.type === "node_failed") {
            setDagNodes((prev) =>
              prev.map((n) =>
                n.id === payload.source ? { ...n, status: "error" } : n
              )
            );
          }

          // Node trace - enrich existing trace with final info (reasoning, tokens, duration)
          if (payload.type === "node_trace") {
            const d = payload.data || {};
            const nodeId = payload.source;
            setTraces((prev) => {
              const existingIdx = prev.findIndex((t) => t.nodeId === nodeId);
              if (existingIdx >= 0) {
                // Enrich existing entry with final data
                const updated = [...prev];
                const existing = updated[existingIdx];
                updated[existingIdx] = {
                  ...existing,
                  label: d.label || existing.label,
                  action: d.label || existing.action,
                  reasoning: d.reasoning || existing.reasoning,
                  toolCalls: (d.tool_calls && d.tool_calls.length > 0) ? d.tool_calls : existing.toolCalls,
                  tokens: (d.input_tokens || 0) + (d.output_tokens || 0),
                  duration: d.duration_ms || 0,
                };
                return updated;
              }
              // No existing entry — create new (for agents without tool calls)
              return [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  nodeId,
                  label: d.label || nodeId,
                  role: d.role || "",
                  action: d.label || "执行完成",
                  reasoning: d.reasoning || "",
                  toolCalls: d.tool_calls || [],
                  tokens: (d.input_tokens || 0) + (d.output_tokens || 0),
                  duration: d.duration_ms || 0,
                  timestamp: payload.timestamp || new Date().toISOString(),
                },
              ];
            });
          }

          // Real-time tool call — append to matching trace or create temp entry
          if (payload.type === "tool_call") {
            const d = payload.data || {};
            const nodeId = payload.source; // Now uses node_id thanks to backend fix
            const toolEntry = {
              tool: d.tool || "unknown",
              input: d.input || "",
              output_summary: d.output_summary || "",
              status: d.status || "success",
            };
            setTraces((prev) => {
              const existingIdx = prev.findIndex((t) => t.nodeId === nodeId);
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  toolCalls: [...updated[existingIdx].toolCalls, toolEntry],
                };
                return updated;
              }
              // Find label from dagNodes
              const dagNode = dagNodes.find((n) => n.id === nodeId);
              const label = dagNode?.label || nodeId;
              return [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  nodeId,
                  label,
                  role: d.role || "",
                  action: "采集中...",
                  reasoning: "",
                  toolCalls: [toolEntry],
                  tokens: 0,
                  duration: 0,
                  timestamp: payload.timestamp || new Date().toISOString(),
                },
              ];
            });
          }

          // Done
          if (payload.type === "done") {
            fetch(`${API_BASE}/api/tasks/${task.id}/report`)
              .then((res) => res.json())
              .then((data) => {
                setReport(data.markdown_report || data.executive_summary || "");
                setAppState("completed");
                setReportReady(true);
                // Delay open so DOM renders first, then transition plays
                requestAnimationFrame(() => {
                  setTimeout(() => setReportOpen(true), 50);
                });
              })
              .catch(() => setAppState("completed"));
            eventSource.close();
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
        };
      } catch (error) {
        console.error("Task creation failed:", error);
      }
    },
    [dagNodes]
  );

  const handleDemoRun = useCallback(() => {
    setAppState("running");
    setTaskId("demo-001");
    setDagNodes([
      { id: "orchestrate", role: "orchestrator", label: "编排器", status: "completed" },
      { id: "collect_industry", role: "collector", label: "行业/趋势采集", status: "idle" },
      { id: "collect_customer", role: "collector", label: "市场/客户采集", status: "idle" },
      { id: "collect_competitor_0", role: "collector", label: "GitHub Copilot", status: "idle" },
      { id: "collect_competitor_1", role: "collector", label: "Cursor", status: "idle" },
      { id: "analyze", role: "analyst", label: "分析师", status: "idle" },
      { id: "write", role: "writer", label: "撰写者", status: "idle" },
      { id: "cite", role: "citation", label: "引用器", status: "idle" },
      { id: "review", role: "reviewer", label: "审核员", status: "idle" },
    ]);

    const sequence = [
      { id: "collect_industry", delay: 1000 },
      { id: "collect_customer", delay: 1500 },
      { id: "collect_competitor_0", delay: 2000 },
      { id: "collect_competitor_1", delay: 2500 },
      { id: "analyze", delay: 5000 },
      { id: "write", delay: 7000 },
      { id: "cite", delay: 9000 },
      { id: "review", delay: 10500 },
    ];

    sequence.forEach(({ id, delay }) => {
      setTimeout(() => {
        setDagNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: "running" } : n)));
      }, delay);
      setTimeout(() => {
        setDagNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: "completed" } : n)));
        setTraces((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            nodeId: id,
            label: id,
            role: "demo",
            action: `${id} 完成`,
            reasoning: "Demo 模式模拟执行",
            toolCalls: [{ tool: "web_search", input: "demo query", output_summary: "Demo 结果", status: "success" }],
            tokens: Math.floor(Math.random() * 3000) + 500,
            duration: Math.floor(Math.random() * 5000) + 2000,
            timestamp: new Date().toISOString(),
          },
        ]);
      }, delay + 1500);
    });

    setTimeout(() => {
      setReport(DEMO_REPORT);
      setAppState("completed");
      setReportReady(true);
      // Delay open so DOM renders first, then transition plays
      requestAnimationFrame(() => {
        setTimeout(() => setReportOpen(true), 50);
      });
    }, 12000);
  }, []);

  return (
    <div className={`h-screen flex flex-col ${appState === "running" || appState === "completed" ? "overflow-hidden" : "overflow-y-auto"}`}>
      <Header />

      {appState === "idle" && (
        <main className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-sm mb-8">
              <Sparkles className="w-4 h-4" />
              <span>AI 驱动的多 Agent 协作平台</span>
            </div>

            <h1 className="text-5xl font-bold tracking-tight mb-6 bg-gradient-to-r from-white via-primary-200 to-primary-400 bg-clip-text text-transparent">
              竞品分析 Agent 协作系统
            </h1>

            <p className="text-lg text-surface-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              基于多 Agent 架构，自动化完成竞品信息采集、深度分析、报告撰写与质量审核。
              多维度方法论驱动，为您提供战略级竞品洞察。
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleStartAnalysis}
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-primary-600/25 hover:shadow-primary-600/40 hover:-translate-y-0.5"
              >
                开始分析
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={handleDemoRun}
                className="inline-flex items-center gap-2 px-8 py-4 bg-surface-800 hover:bg-surface-700 text-surface-200 font-semibold rounded-xl border border-surface-700 transition-all duration-200"
              >
                <Activity className="w-5 h-5" />
                演示模式
              </button>
            </div>

            <div className="grid grid-cols-3 gap-6 mt-20">
              {[
                { icon: GitBranch, title: "DAG 任务编排", desc: "可视化 Agent 协作流程" },
                { icon: Activity, title: "实时追踪", desc: "全链路决策日志透明可见" },
                { icon: FileText, title: "战略分析报告", desc: "战略级分析带引用溯源" },
              ].map((item) => (
                <div key={item.title} className="p-6 rounded-xl bg-surface-800/50 border border-surface-700/50">
                  <item.icon className="w-8 h-8 text-primary-400 mb-3" />
                  <h3 className="font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-surface-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {appState === "creating" && (
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-2xl animate-fade-in">
            <h2 className="text-2xl font-bold mb-2">创建分析任务</h2>
            <p className="text-surface-400 mb-8">
              描述您的分析需求，系统将自动编排 Agent 完成竞品分析
            </p>
            <TaskForm onSubmit={handleSubmitTask} />
          </div>
        </main>
      )}

      {(appState === "running" || appState === "completed") && (
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* DAG area - frozen at top */}
          <section className="relative flex-shrink-0 border-b border-surface-700" style={{ height: "280px" }}>
            <DAGView nodes={dagNodes} />
          </section>

          {/* Trace area - scrollable within remaining space */}
          <section className="flex-1 overflow-y-auto scrollbar-thin">
            <TracePanel traces={traces} />
          </section>

          {/* Report button - show when completed but panel closed */}
          {appState === "completed" && report && !reportOpen && (
            <button
              onClick={() => setReportOpen(true)}
              className="fixed top-16 right-4 z-40 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg shadow-lg shadow-primary-600/30 hover:shadow-primary-600/50 transition-all duration-200 hover:-translate-y-0.5"
            >
              <FileText className="w-4 h-4" />
              查看报告
            </button>
          )}

          {/* Report slide-in panel from right */}
          {reportReady && (
            <>
              {/* Backdrop */}
              <div
                className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${reportOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={() => setReportOpen(false)}
              />
              {/* Panel */}
              <div
                className={`fixed top-0 right-0 z-50 h-full w-full max-w-3xl bg-surface-900 border-l border-surface-700 shadow-2xl transition-transform duration-300 ease-out ${reportOpen ? "translate-x-0" : "translate-x-full"}`}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700 bg-surface-900/95 backdrop-blur-sm sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary-400" />
                    <h3 className="text-lg font-semibold">竞品分析报告</h3>
                  </div>
                  <button
                    onClick={() => setReportOpen(false)}
                    className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto h-[calc(100%-65px)] scrollbar-thin">
                  <ReportView content={report} taskId={taskId} />
                </div>
              </div>
            </>
          )}
        </main>
      )}
    </div>
  );
}

const DEMO_REPORT = `# AI 编程助手市场竞争分析报告

## 摘要
本报告分析了 AI 编程助手市场竞争格局，市场规模预计 2025 年达 50 亿美元 [1]。GitHub Copilot 和 Cursor 占据领导地位，市场正从代码补全向全链路 AI 开发平台演进。

## 一、看行业/趋势
全球 AI 编程助手市场 2024 年规模约 48.6 亿美元，年复合增长率 27.1% [1]。预计 2028 年突破 200 亿美元 [2]。关键技术趋势包括多模态理解、Agent 化工作流、长上下文支持。

## 二、看市场/客户
目标客户分为个人开发者和企业团队两大群体。企业客户决策因素依次为：安全合规 > 集成能力 > 代码质量 > 价格。未被满足的需求集中在私有化部署和行业定制化。

## 三、看竞争

| 能力维度 | GitHub Copilot | Cursor | Codeium |
|---------|---------------|--------|---------|
| 代码补全 | 强 | 强 | 中 |
| Agent 能力 | 中 | 强 | 弱 |
| 安全合规 | 强 | 中 | 中 |
| 价格竞争力 | 弱 | 中 | 强 |

## 四、看自己
我们具备大模型微调和 RAG 应用开发的核心能力，但品牌知名度低，产品处于 MVP 阶段。

## 五、看机会
💡 基于分析的战略建议

企业级私有化部署是最大机会窗口（吸引力高、可行性中）。

## 六、定控制点
💡 基于分析的战略建议

建议以"私有化部署 + 行业知识库"作为核心壁垒。⭐ 推荐

## 七、定目标
💡 基于分析的战略建议

短期（6个月）：完成产品 GA，获取 10 个付费企业客户。

## 八、定策略
💡 基于分析的战略建议

产品策略：聚焦企业安全场景，提供私有化方案。⭐ 推荐

## 附录：数据来源
[1] Grand View Research - AI Code Assistants Market Report 2024 - https://www.grandviewresearch.com/
[2] Gartner - AI-Augmented Software Engineering Forecast - https://www.gartner.com/
`;
