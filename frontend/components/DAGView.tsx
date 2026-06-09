"use client";

import { useMemo, useCallback, useRef, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  BackgroundVariant,
  Position,
  Handle,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { Brain, Search, BarChart3, PenTool, ShieldCheck, Link2 } from "lucide-react";

type NodeStatus = "idle" | "running" | "completed" | "error";

interface DAGNodeInfo {
  id: string;
  role: string;
  label: string;
  status: NodeStatus;
}

interface DAGViewProps {
  nodes: DAGNodeInfo[];
}

const ROLE_CONFIG: Record<string, { color: string; icon: typeof Brain }> = {
  orchestrator: { color: "#8b5cf6", icon: Brain },
  collector: { color: "#06b6d4", icon: Search },
  analyst: { color: "#f59e0b", icon: BarChart3 },
  writer: { color: "#10b981", icon: PenTool },
  reviewer: { color: "#ef4444", icon: ShieldCheck },
  citation: { color: "#ec4899", icon: Link2 },
  arbiter: { color: "#a855f7", icon: Brain },
};

function AgentNode({ data }: { data: { label: string; role: string; status: NodeStatus } }) {
  const config = ROLE_CONFIG[data.role] || ROLE_CONFIG.collector;
  const Icon = config.icon;

  const statusStyles: Record<NodeStatus, string> = {
    idle: "border-surface-600 bg-surface-800",
    running: "border-primary-500 bg-surface-800",
    completed: "border-emerald-500 bg-surface-800",
    error: "border-red-500 bg-surface-800",
  };

  const statusDot: Record<NodeStatus, string> = {
    idle: "bg-surface-500",
    running: "bg-primary-400 animate-pulse",
    completed: "bg-emerald-400",
    error: "bg-red-400",
  };

  return (
    <div
      className={`relative px-3 py-2.5 rounded-xl border-2 max-w-[160px] transition-all duration-300 ${statusStyles[data.status]}`}
      style={{
        borderColor: data.status === "running" ? config.color : undefined,
        boxShadow: data.status === "running" ? `0 0 20px ${config.color}33` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-surface-500 !border-surface-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-surface-500 !border-surface-400 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <div className="p-1 rounded-lg flex-shrink-0" style={{ backgroundColor: `${config.color}20` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-xs text-surface-100 truncate">{data.label}</span>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot[data.status]}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

export default function DAGView({ nodes }: DAGViewProps) {
  // Compute layout positions dynamically
  const { flowNodes, flowEdges } = useMemo(() => {
    if (nodes.length === 0) {
      return { flowNodes: [], flowEdges: [] };
    }

    const collectors = nodes.filter((n) => n.role === "collector");
    const orchestrator = nodes.find((n) => n.role === "orchestrator");
    const postCollector = nodes.filter(
      (n) => n.role !== "collector" && n.role !== "orchestrator"
    );

    // Detect cross-validation mode by checking for arbiter nodes
    const hasArbiter = nodes.some((n) => n.role === "arbiter");

    const colWidth = 190;
    const rowHeight = 60;
    const collectorStartY = Math.max(0, (collectors.length - 1) * rowHeight * 0.5);

    const fNodes: Node[] = [];
    const fEdges: Edge[] = [];

    // Orchestrator
    if (orchestrator) {
      const orchY = collectors.length > 0 ? collectorStartY : 100;
      fNodes.push({
        id: orchestrator.id,
        type: "agentNode",
        position: { x: 50, y: orchY },
        data: { label: orchestrator.label, role: orchestrator.role, status: orchestrator.status },
      });
    }

    // Collectors
    collectors.forEach((c, i) => {
      const y = i * rowHeight;
      fNodes.push({
        id: c.id,
        type: "agentNode",
        position: { x: 50 + colWidth, y },
        data: { label: c.label, role: c.role, status: c.status },
      });

      if (orchestrator) {
        fEdges.push({
          id: `e-orch-${c.id}`,
          source: orchestrator.id,
          target: c.id,
          animated: c.status === "running",
          style: { stroke: "#6366f1", strokeWidth: 2 },
        });
      }
    });

    const postStartX = 50 + colWidth * 2;
    const postY = collectors.length > 0 ? collectorStartY : 100;

    if (hasArbiter) {
      // Cross-validation layout: parallel branches with arbiter merge points
      // Order: [analyst_gpt, analyst_claude] → arbiter_analysis → [writer_gpt, writer_claude] → arbiter_report → cite → review
      const analysts = postCollector.filter((n) => n.role === "analyst");
      const arbiterAnalysis = postCollector.find((n) => n.role === "arbiter" && n.id.includes("analysis"));
      const writers = postCollector.filter((n) => n.role === "writer");
      const arbiterReport = postCollector.find((n) => n.role === "arbiter" && n.id.includes("report"));
      const citation = postCollector.find((n) => n.role === "citation");
      const reviewer = postCollector.find((n) => n.role === "reviewer");

      // Parallel analysts (vertical split)
      const parallelOffset = 50;
      analysts.forEach((n, i) => {
        const y = postY + (i === 0 ? -parallelOffset : parallelOffset);
        fNodes.push({
          id: n.id,
          type: "agentNode",
          position: { x: postStartX, y },
          data: { label: n.label, role: n.role, status: n.status },
        });
        // Connect collectors to each analyst
        collectors.forEach((c) => {
          fEdges.push({
            id: `e-${c.id}-${n.id}`,
            source: c.id,
            target: n.id,
            animated: n.status === "running",
            style: { stroke: "#6366f1", strokeWidth: 2 },
          });
        });
      });

      // Arbiter analysis
      if (arbiterAnalysis) {
        fNodes.push({
          id: arbiterAnalysis.id,
          type: "agentNode",
          position: { x: postStartX + colWidth, y: postY },
          data: { label: arbiterAnalysis.label, role: arbiterAnalysis.role, status: arbiterAnalysis.status },
        });
        analysts.forEach((n) => {
          fEdges.push({
            id: `e-${n.id}-${arbiterAnalysis.id}`,
            source: n.id,
            target: arbiterAnalysis.id,
            animated: arbiterAnalysis.status === "running",
            style: { stroke: "#a855f7", strokeWidth: 2 },
          });
        });
      }

      // Parallel writers
      writers.forEach((n, i) => {
        const y = postY + (i === 0 ? -parallelOffset : parallelOffset);
        fNodes.push({
          id: n.id,
          type: "agentNode",
          position: { x: postStartX + colWidth * 2, y },
          data: { label: n.label, role: n.role, status: n.status },
        });
        if (arbiterAnalysis) {
          fEdges.push({
            id: `e-${arbiterAnalysis.id}-${n.id}`,
            source: arbiterAnalysis.id,
            target: n.id,
            animated: n.status === "running",
            style: { stroke: "#6366f1", strokeWidth: 2 },
          });
        }
      });

      // Arbiter report
      if (arbiterReport) {
        fNodes.push({
          id: arbiterReport.id,
          type: "agentNode",
          position: { x: postStartX + colWidth * 3, y: postY },
          data: { label: arbiterReport.label, role: arbiterReport.role, status: arbiterReport.status },
        });
        writers.forEach((n) => {
          fEdges.push({
            id: `e-${n.id}-${arbiterReport.id}`,
            source: n.id,
            target: arbiterReport.id,
            animated: arbiterReport.status === "running",
            style: { stroke: "#a855f7", strokeWidth: 2 },
          });
        });
      }

      // Citation + Reviewer in sequence after arbiter_report
      const tailNodes = [citation, reviewer].filter(Boolean) as DAGNodeInfo[];
      tailNodes.forEach((n, i) => {
        fNodes.push({
          id: n.id,
          type: "agentNode",
          position: { x: postStartX + colWidth * (4 + i), y: postY },
          data: { label: n.label, role: n.role, status: n.status },
        });
        if (i === 0 && arbiterReport) {
          fEdges.push({
            id: `e-${arbiterReport.id}-${n.id}`,
            source: arbiterReport.id,
            target: n.id,
            animated: n.status === "running",
            style: { stroke: "#6366f1", strokeWidth: 2 },
          });
        } else if (i > 0) {
          const prev = tailNodes[i - 1];
          fEdges.push({
            id: `e-${prev.id}-${n.id}`,
            source: prev.id,
            target: n.id,
            animated: n.status === "running",
            style: { stroke: "#6366f1", strokeWidth: 2 },
          });
        }
      });
    } else {
      // Single-model layout (original behavior)
      const orderedRoles = ["analyst", "writer", "citation", "reviewer"];
      const orderedNodes = orderedRoles
        .map((role) => postCollector.find((n) => n.role === role))
        .filter(Boolean) as DAGNodeInfo[];

      orderedNodes.forEach((n, i) => {
        fNodes.push({
          id: n.id,
          type: "agentNode",
          position: { x: postStartX + i * colWidth, y: postY },
          data: { label: n.label, role: n.role, status: n.status },
        });

        if (i === 0) {
          collectors.forEach((c) => {
            fEdges.push({
              id: `e-${c.id}-${n.id}`,
              source: c.id,
              target: n.id,
              animated: n.status === "running",
              style: { stroke: "#6366f1", strokeWidth: 2 },
            });
          });
        } else {
          const prev = orderedNodes[i - 1];
          fEdges.push({
            id: `e-${prev.id}-${n.id}`,
            source: prev.id,
            target: n.id,
            animated: n.status === "running",
            style: { stroke: "#6366f1", strokeWidth: 2 },
          });
        }
      });
    }

    return { flowNodes: fNodes, flowEdges: fEdges };
  }, [nodes]);

  const onInit = useCallback((instance: any) => {
    instance.fitView({ padding: 0.3, maxZoom: 0.85 });
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-surface-400">
        等待编排器规划任务...
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <DAGFlowInner flowNodes={flowNodes} flowEdges={flowEdges} />
    </ReactFlowProvider>
  );
}

function DAGFlowInner({ flowNodes, flowEdges }: { flowNodes: Node[]; flowEdges: Edge[] }) {
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-fit when container resizes (e.g. drag handle)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // Small delay to let ReactFlow recalculate
      setTimeout(() => fitView({ padding: 0.3, maxZoom: 0.85 }), 50);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitView]);

  // Also refit when nodes change
  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.3, maxZoom: 0.85 }), 100);
  }, [flowNodes, fitView]);

  return (
    <div ref={containerRef} className="h-full w-full absolute inset-0">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 0.85 }}
        minZoom={0.3}
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
        className="bg-surface-900"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls showInteractive={false} className="!bg-surface-800 !border-surface-700 !shadow-xl [&>button]:!bg-surface-800 [&>button]:!border-surface-700 [&>button]:!text-surface-300 [&>button:hover]:!bg-surface-700" />
      </ReactFlow>

      <div className="absolute top-2 left-2 flex items-center gap-3 px-3 py-1.5 bg-surface-800/90 backdrop-blur-sm rounded-lg border border-surface-700 z-10">
        <span className="text-xs text-surface-400 font-medium">状态：</span>
        {([
          ["idle", "等待中", "bg-surface-500"],
          ["running", "运行中", "bg-primary-400"],
          ["completed", "已完成", "bg-emerald-400"],
          ["error", "异常", "bg-red-400"],
        ] as const).map(([, label, color]) => (
          <span key={label} className="flex items-center gap-1 text-xs text-surface-300">
            <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
