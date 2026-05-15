"use client";

import { useCallback, useMemo } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  BackgroundVariant,
  Position,
  Handle,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Brain,
  Search,
  BarChart3,
  PenTool,
  ShieldCheck,
  Link2,
} from "lucide-react";

type AgentRole =
  | "orchestrator"
  | "collector"
  | "analyst"
  | "writer"
  | "reviewer"
  | "citation";

type AgentNodeStatus = "idle" | "running" | "completed" | "error";

interface AgentStatus {
  orchestrator: AgentNodeStatus;
  collector: AgentNodeStatus;
  analyst: AgentNodeStatus;
  writer: AgentNodeStatus;
  reviewer: AgentNodeStatus;
  citation: AgentNodeStatus;
}

interface DAGViewProps {
  agentStatus: AgentStatus;
}

const AGENT_CONFIG: Record<
  AgentRole,
  { label: string; color: string; icon: typeof Brain; description: string }
> = {
  orchestrator: {
    label: "编排器",
    color: "#8b5cf6",
    icon: Brain,
    description: "任务拆解与调度",
  },
  collector: {
    label: "采集器",
    color: "#06b6d4",
    icon: Search,
    description: "竞品信息采集",
  },
  analyst: {
    label: "分析师",
    color: "#f59e0b",
    icon: BarChart3,
    description: "深度数据分析",
  },
  writer: {
    label: "撰写者",
    color: "#10b981",
    icon: PenTool,
    description: "报告内容生成",
  },
  reviewer: {
    label: "审核员",
    color: "#ef4444",
    icon: ShieldCheck,
    description: "质量审查校验",
  },
  citation: {
    label: "引用器",
    color: "#ec4899",
    icon: Link2,
    description: "来源引用标注",
  },
};

function AgentNode({ data }: { data: { role: AgentRole; status: AgentNodeStatus } }) {
  const config = AGENT_CONFIG[data.role];
  const Icon = config.icon;

  const statusStyles: Record<AgentNodeStatus, string> = {
    idle: "border-surface-600 bg-surface-800",
    running: "border-primary-500 bg-surface-800 node-running",
    completed: "border-emerald-500 bg-surface-800",
    error: "border-red-500 bg-surface-800",
  };

  const statusDot: Record<AgentNodeStatus, string> = {
    idle: "bg-surface-500",
    running: "bg-primary-400 animate-pulse",
    completed: "bg-emerald-400",
    error: "bg-red-400",
  };

  return (
    <div
      className={`relative px-5 py-4 rounded-xl border-2 min-w-[160px] transition-all duration-300 ${statusStyles[data.status]}`}
      style={{
        borderColor: data.status === "running" ? config.color : undefined,
        boxShadow:
          data.status === "running"
            ? `0 0 20px ${config.color}33`
            : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-surface-500 !border-surface-400 !w-2.5 !h-2.5"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-surface-500 !border-surface-400 !w-2.5 !h-2.5"
      />

      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <Icon className="w-5 h-5" style={{ color: config.color }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-surface-100">
              {config.label}
            </span>
            <span className={`w-2 h-2 rounded-full ${statusDot[data.status]}`} />
          </div>
          <span className="text-xs text-surface-400">{config.description}</span>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

export default function DAGView({ agentStatus }: DAGViewProps) {
  const nodes: Node[] = useMemo(
    () => [
      {
        id: "orchestrator",
        type: "agentNode",
        position: { x: 80, y: 200 },
        data: { role: "orchestrator", status: agentStatus.orchestrator },
      },
      {
        id: "collector",
        type: "agentNode",
        position: { x: 350, y: 100 },
        data: { role: "collector", status: agentStatus.collector },
      },
      {
        id: "analyst",
        type: "agentNode",
        position: { x: 350, y: 300 },
        data: { role: "analyst", status: agentStatus.analyst },
      },
      {
        id: "writer",
        type: "agentNode",
        position: { x: 620, y: 200 },
        data: { role: "writer", status: agentStatus.writer },
      },
      {
        id: "reviewer",
        type: "agentNode",
        position: { x: 890, y: 120 },
        data: { role: "reviewer", status: agentStatus.reviewer },
      },
      {
        id: "citation",
        type: "agentNode",
        position: { x: 890, y: 300 },
        data: { role: "citation", status: agentStatus.citation },
      },
    ],
    [agentStatus]
  );

  const edges: Edge[] = useMemo(
    () => [
      {
        id: "e-orch-coll",
        source: "orchestrator",
        target: "collector",
        animated: agentStatus.collector === "running",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      },
      {
        id: "e-orch-anal",
        source: "orchestrator",
        target: "analyst",
        animated: agentStatus.analyst === "running",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      },
      {
        id: "e-coll-writer",
        source: "collector",
        target: "writer",
        animated: agentStatus.writer === "running",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      },
      {
        id: "e-anal-writer",
        source: "analyst",
        target: "writer",
        animated: agentStatus.writer === "running",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      },
      {
        id: "e-writer-rev",
        source: "writer",
        target: "reviewer",
        animated: agentStatus.reviewer === "running",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      },
      {
        id: "e-writer-cite",
        source: "writer",
        target: "citation",
        animated: agentStatus.citation === "running",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      },
    ],
    [agentStatus]
  );

  const onInit = useCallback((instance: any) => {
    instance.fitView({ padding: 0.2 });
  }, []);

  return (
    <div className="h-full w-full" style={{ minHeight: "500px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-surface-900"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#334155"
        />
        <Controls
          className="!bg-surface-800 !border-surface-700 !shadow-xl [&>button]:!bg-surface-800 [&>button]:!border-surface-700 [&>button]:!text-surface-300 [&>button:hover]:!bg-surface-700"
        />
      </ReactFlow>

      <div className="absolute bottom-4 left-4 flex items-center gap-4 px-4 py-2.5 bg-surface-800/90 backdrop-blur-sm rounded-lg border border-surface-700">
        <span className="text-xs text-surface-400 font-medium">状态：</span>
        {(
          [
            ["idle", "等待中", "bg-surface-500"],
            ["running", "运行中", "bg-primary-400"],
            ["completed", "已完成", "bg-emerald-400"],
            ["error", "异常", "bg-red-400"],
          ] as const
        ).map(([, label, color]) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-surface-300">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
