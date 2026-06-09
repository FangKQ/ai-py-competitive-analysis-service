"use client";

import { useState, useEffect, useRef } from "react";
import {
  Brain,
  Search,
  Zap,
  PenTool,
  Scale,
  Shield,
  Quote,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

interface DemoPreviewProps {
  onStartReal: () => void;
}

interface PipelineNode {
  id: string;
  label: string;
  icon: typeof Brain;
  color: string;
  delay: number; // ms before starting
  duration: number; // ms to stay "running"
}

const PIPELINE: PipelineNode[] = [
  { id: "orch", label: "编排器", icon: Brain, color: "from-violet-400 to-fuchsia-500", delay: 0, duration: 1200 },
  { id: "coll1", label: "行业采集", icon: Search, color: "from-cyan-400 to-blue-500", delay: 1400, duration: 1800 },
  { id: "coll2", label: "客户采集", icon: Search, color: "from-cyan-400 to-blue-500", delay: 1600, duration: 1600 },
  { id: "coll3", label: "竞品采集", icon: Search, color: "from-cyan-400 to-blue-500", delay: 1800, duration: 2000 },
  { id: "analyst", label: "分析师×2", icon: Zap, color: "from-amber-400 to-orange-500", delay: 4000, duration: 2200 },
  { id: "arbiter1", label: "仲裁(分析)", icon: Scale, color: "from-rose-400 to-pink-500", delay: 6400, duration: 1400 },
  { id: "writer", label: "撰写者×2", icon: PenTool, color: "from-emerald-400 to-teal-500", delay: 8000, duration: 2400 },
  { id: "arbiter2", label: "仲裁(报告)", icon: Scale, color: "from-rose-400 to-pink-500", delay: 10600, duration: 1400 },
  { id: "cite", label: "引用验证", icon: Quote, color: "from-yellow-400 to-amber-500", delay: 12200, duration: 1200 },
  { id: "review", label: "质量审核", icon: Shield, color: "from-indigo-400 to-blue-600", delay: 13600, duration: 1000 },
];

const TOTAL_DURATION = 15000; // full cycle time

export default function DemoPreview({ onStartReal }: DemoPreviewProps) {
  const [nodeStates, setNodeStates] = useState<Record<string, "idle" | "running" | "completed">>({});
  const [cycle, setCycle] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisible = useRef(false);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  // Intersection observer to start animation only when visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          setCycle((c) => c + 1);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Run animation cycle
  useEffect(() => {
    if (cycle === 0) return;

    // Clear previous timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // Reset all nodes
    setNodeStates({});

    // Schedule each node's transitions
    PIPELINE.forEach((node) => {
      const startTimer = setTimeout(() => {
        setNodeStates((prev) => ({ ...prev, [node.id]: "running" }));
      }, node.delay);

      const endTimer = setTimeout(() => {
        setNodeStates((prev) => ({ ...prev, [node.id]: "completed" }));
      }, node.delay + node.duration);

      timersRef.current.push(startTimer, endTimer);
    });

    // Restart cycle after completion
    const restartTimer = setTimeout(() => {
      if (isVisible.current) {
        setCycle((c) => c + 1);
      }
    }, TOTAL_DURATION + 2000);
    timersRef.current.push(restartTimer);

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [cycle]);

  return (
    <div ref={containerRef} className="border border-surface-700/60 rounded-2xl bg-surface-800/20 overflow-hidden">
      {/* Pipeline visualization */}
      <div className="p-6 pb-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PIPELINE.map((node, idx) => {
            const state = nodeStates[node.id] || "idle";
            const Icon = node.icon;
            return (
              <div key={node.id} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-500 ${
                    state === "completed"
                      ? "bg-surface-800 border-emerald-500/40"
                      : state === "running"
                      ? `bg-gradient-to-r ${node.color} border-transparent shadow-lg`
                      : "bg-surface-800/60 border-surface-700/60"
                  }`}
                >
                  {state === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Icon
                      className={`w-4 h-4 transition-colors duration-300 ${
                        state === "running" ? "text-white" : "text-surface-500"
                      }`}
                    />
                  )}
                  <span
                    className={`text-xs font-medium transition-colors duration-300 ${
                      state === "running"
                        ? "text-white"
                        : state === "completed"
                        ? "text-emerald-400"
                        : "text-surface-500"
                    }`}
                  >
                    {node.label}
                  </span>
                </div>
                {idx < PIPELINE.length - 1 && (
                  <ArrowRight
                    className={`w-3 h-3 flex-shrink-0 transition-colors duration-300 ${
                      state === "completed" ? "text-emerald-500/60" : "text-surface-700"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 pb-4">
        <div className="h-1 bg-surface-700/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-emerald-500 rounded-full transition-all duration-500 ease-linear"
            style={{
              width: `${(Object.values(nodeStates).filter((s) => s === "completed").length / PIPELINE.length) * 100}%`,
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] text-surface-500">
          <span>
            {Object.values(nodeStates).filter((s) => s === "completed").length === PIPELINE.length
              ? "✓ 分析完成"
              : Object.values(nodeStates).some((s) => s === "running")
              ? "正在执行..."
              : "准备开始"}
          </span>
          <span>{Object.values(nodeStates).filter((s) => s === "completed").length}/{PIPELINE.length} 步骤</span>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-surface-700/40 px-6 py-4 bg-surface-800/30 flex items-center justify-between">
        <p className="text-xs text-surface-400">
          以上展示了一次竞品分析的完整 Agent 协作流程
        </p>
        <button
          onClick={onStartReal}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-all"
        >
          开始你的分析
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
