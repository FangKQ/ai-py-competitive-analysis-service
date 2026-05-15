"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";

type AppState = "idle" | "creating" | "running" | "completed";

interface AgentStatus {
  orchestrator: "idle" | "running" | "completed" | "error";
  collector: "idle" | "running" | "completed" | "error";
  analyst: "idle" | "running" | "completed" | "error";
  writer: "idle" | "running" | "completed" | "error";
  reviewer: "idle" | "running" | "completed" | "error";
  citation: "idle" | "running" | "completed" | "error";
}

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

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    orchestrator: "idle",
    collector: "idle",
    analyst: "idle",
    writer: "idle",
    reviewer: "idle",
    citation: "idle",
  });
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dag" | "trace" | "report">("dag");

  const handleStartAnalysis = () => {
    setAppState("creating");
  };

  const handleSubmitTask = useCallback(
    async (data: {
      query: string;
      competitors: string[];
      industry: string;
      focusAreas: string[];
    }) => {
      try {
        const task = await createTask(data);
        setTaskId(task.id);
        setAppState("running");

        const eventSource = streamEvents(task.id);

        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);

          if (payload.type === "agent_status") {
            setAgentStatus((prev) => ({
              ...prev,
              [payload.agent]: payload.status,
            }));
          }

          if (payload.type === "trace") {
            setTraces((prev) => [
              ...prev,
              {
                id: payload.id || crypto.randomUUID(),
                agent: payload.agent,
                action: payload.action,
                reasoning: payload.reasoning || "",
                toolCalls: payload.tool_calls || [],
                tokens: payload.tokens || 0,
                duration: payload.duration || 0,
                timestamp: payload.timestamp || new Date().toISOString(),
              },
            ]);
          }

          if (payload.type === "report") {
            setReport(payload.content);
            setAppState("completed");
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
    []
  );

  const handleDemoRun = useCallback(() => {
    setAppState("running");
    setTaskId("demo-001");

    const demoSequence: { agent: keyof AgentStatus; delay: number }[] = [
      { agent: "orchestrator", delay: 500 },
      { agent: "collector", delay: 2000 },
      { agent: "analyst", delay: 4000 },
      { agent: "writer", delay: 6000 },
      { agent: "reviewer", delay: 8000 },
      { agent: "citation", delay: 9500 },
    ];

    demoSequence.forEach(({ agent, delay }) => {
      setTimeout(() => {
        setAgentStatus((prev) => ({ ...prev, [agent]: "running" }));
        setTraces((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            agent,
            action: `${agent} 开始处理任务`,
            reasoning: `分析当前任务上下文，决定执行 ${agent} 阶段的数据处理流程`,
            toolCalls: [`${agent}.execute()`, `${agent}.validate()`],
            tokens: Math.floor(Math.random() * 2000) + 500,
            duration: Math.floor(Math.random() * 3000) + 1000,
            timestamp: new Date().toISOString(),
          },
        ]);
      }, delay);

      setTimeout(() => {
        setAgentStatus((prev) => ({ ...prev, [agent]: "completed" }));
      }, delay + 1500);
    });

    setTimeout(() => {
      setReport(DEMO_REPORT);
      setAppState("completed");
    }, 11000);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
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
              6 个专业 Agent 协同工作，为您提供全面的竞品洞察。
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
                {
                  icon: GitBranch,
                  title: "DAG 任务编排",
                  desc: "可视化 Agent 协作流程",
                },
                {
                  icon: Activity,
                  title: "实时追踪",
                  desc: "全链路决策日志透明可见",
                },
                {
                  icon: FileText,
                  title: "专业报告",
                  desc: "结构化分析带引用溯源",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-6 rounded-xl bg-surface-800/50 border border-surface-700/50"
                >
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
          <div className="border-b border-surface-700 px-6">
            <div className="flex items-center gap-1">
              {[
                { key: "dag" as const, label: "Agent DAG", icon: GitBranch },
                { key: "trace" as const, label: "决策追踪", icon: Activity },
                { key: "report" as const, label: "分析报告", icon: FileText },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? "border-primary-500 text-primary-300"
                      : "border-transparent text-surface-400 hover:text-surface-200"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
              {taskId && (
                <span className="ml-auto text-xs text-surface-500 font-mono">
                  Task: {taskId}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === "dag" && <DAGView agentStatus={agentStatus} />}
            {activeTab === "trace" && <TracePanel traces={traces} />}
            {activeTab === "report" && <ReportView content={report} />}
          </div>
        </main>
      )}
    </div>
  );
}

const DEMO_REPORT = `# 竞品分析报告：AI 编程助手市场

## 执行摘要

本报告对当前 AI 编程助手市场的主要竞品进行了全面分析，涵盖 GitHub Copilot、Cursor、Codeium 和 Amazon CodeWhisperer 四款产品。分析表明，市场正从基础代码补全向全链路 AI 开发平台演进[^1]。

## 竞品概览

| 产品 | 公司 | 定位 | 月活用户 |
|------|------|------|----------|
| GitHub Copilot | Microsoft/GitHub | 全功能 AI 编程伙伴 | 1500万+ |
| Cursor | Anysphere | AI-Native IDE | 200万+ |
| Codeium | Exafunction | 免费 AI 代码助手 | 100万+ |
| CodeWhisperer | Amazon | AWS 生态集成 | 50万+ |

## SWOT 分析

### GitHub Copilot
- **优势**: 海量训练数据、GitHub 生态深度集成、品牌认知度高[^2]
- **劣势**: 价格较高、隐私顾虑、定制化能力有限
- **机会**: Enterprise 市场扩展、Agent 模式演进
- **威胁**: 开源替代品涌现、竞品差异化竞争

### Cursor
- **优势**: AI-Native 设计理念、多模型支持、创新交互体验[^3]
- **劣势**: 用户基数较小、生态建设早期
- **机会**: 开发者工作流革新、团队协作场景
- **威胁**: VS Code 功能追赶、大厂资源碾压

## 功能对比

| 功能维度 | Copilot | Cursor | Codeium | CodeWhisperer |
|----------|---------|--------|---------|---------------|
| 代码补全 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 多文件编辑 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| 对话能力 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Agent 能力 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| 安全合规 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## 建议

1. **差异化定位**: 聚焦垂直场景（如安全审计、数据工程），避免正面竞争
2. **技术壁垒**: 投资 Agent 架构和工具链集成，构建生态护城河
3. **商业模式**: 采用 Freemium + Enterprise 双轨策略，快速获客[^4]
4. **合作生态**: 与云厂商和开发工具链深度集成

---

[^1]: Gartner, "AI-Augmented Software Engineering", 2025
[^2]: GitHub Blog, "Copilot Metrics Report", 2025
[^3]: TechCrunch, "Cursor raises Series B", 2025
[^4]: McKinsey, "The economic potential of generative AI in software", 2025
`;
