"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import {
  Bot,
  Cpu,
  Search,
  PenTool,
  Shield,
  Link2,
  Save,
  RotateCcw,
  Send,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AgentConfig {
  id: number;
  role: string;
  display_name: string;
  model: string;
  model_b: string | null;
  system_prompt: string;
  system_prompt_b: string | null;
  token_budget: number;
  enabled_tools: string[];
  updated_at: string;
}

interface ModelOption {
  id: string;
  name: string;
  description: string;
}

interface ToolCallRecord {
  tool: string;
  input: string;
  output_summary: string;
  status: string;
}

interface TestResult {
  response: string;
  tokens_used: number;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  iterations: number;
  model: string;
  status: string;
  tool_calls: ToolCallRecord[];
  config_used: {
    model: string;
    system_prompt_length: number;
    token_budget: number;
    enabled_tools: string[];
  };
}

const ROLE_ICONS: Record<string, typeof Bot> = {
  orchestrator: Cpu,
  collector: Search,
  analyst: Bot,
  writer: PenTool,
  reviewer: Shield,
  citation: Link2,
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("orchestrator");
  const [editForm, setEditForm] = useState<Partial<AgentConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/agents`).then((r) => r.json()),
      fetch(`${API_BASE}/api/agents/models`).then((r) => r.json()),
    ])
      .then(([agentsData, modelsData]) => {
        setAgents(agentsData.agents || []);
        setModels(modelsData.models || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load agent configs:", err);
        setLoading(false);
      });
  }, []);

  // Update edit form when selected role changes
  useEffect(() => {
    const config = agents.find((a) => a.role === selectedRole);
    if (config) {
      setEditForm({ ...config });
    }
    setTestResult(null);
    setTestError(null);
  }, [selectedRole, agents]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch(`${API_BASE}/api/agents/${selectedRole}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: editForm.model,
          model_b: editForm.model_b,
          system_prompt: editForm.system_prompt,
          system_prompt_b: editForm.system_prompt_b,
          token_budget: editForm.token_budget,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Save failed");
      }
      const updated = await res.json();
      setAgents((prev) =>
        prev.map((a) => (a.role === selectedRole ? updated : a))
      );
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err: any) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  }, [selectedRole, editForm]);

  const handleReset = useCallback(async () => {
    if (!confirm("确认重置该 Agent 的配置为系统默认值？")) return;
    try {
      const res = await fetch(`${API_BASE}/api/agents/${selectedRole}/reset`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Reset failed");
      const updated = await res.json();
      setAgents((prev) =>
        prev.map((a) => (a.role === selectedRole ? updated : a))
      );
      setEditForm(updated);
    } catch (err) {
      console.error("Reset failed:", err);
    }
  }, [selectedRole]);

  const handleTest = useCallback(async () => {
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch(`${API_BASE}/api/agents/${selectedRole}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testMessage,
          model: editForm.model,
          system_prompt: editForm.system_prompt,
          token_budget: editForm.token_budget,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Test failed");
      }
      const result = await res.json();
      setTestResult(result);
    } catch (err: any) {
      setTestError(err.message || "Test failed");
    } finally {
      setTesting(false);
    }
  }, [selectedRole, testMessage, editForm]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
        </main>
      </div>
    );
  }

  const currentConfig = agents.find((a) => a.role === selectedRole);

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Agent role list */}
        <aside className="w-56 flex-shrink-0 border-r border-surface-700/60 bg-surface-900/50 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
              Agent 角色
            </h2>
            <div className="space-y-1">
              {agents.map((agent) => {
                const Icon = ROLE_ICONS[agent.role] || Bot;
                const isActive = agent.role === selectedRole;
                return (
                  <button
                    key={agent.role}
                    onClick={() => setSelectedRole(agent.role)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? "bg-primary-500/15 border border-primary-500/30 text-primary-300"
                        : "text-surface-400 hover:text-surface-200 hover:bg-surface-800"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{agent.display_name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right panel - Config editor */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {/* Scrollable config area */}
          <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-surface-100">
                  {editForm.display_name || "Agent 配置"}
                </h1>
                <p className="text-sm text-surface-500 mt-1">
                  角色: {selectedRole}
                  {currentConfig?.updated_at && (
                    <span className="ml-3">
                      更新于: {new Date(currentConfig.updated_at).toLocaleString("zh-CN")}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded-lg border border-surface-700 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  重置默认
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    saveStatus === "success"
                      ? "bg-green-600 text-white"
                      : saveStatus === "error"
                      ? "bg-red-600 text-white"
                      : "bg-primary-600 hover:bg-primary-700 text-white"
                  }`}
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : saveStatus === "success" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : saveStatus === "error" ? (
                    <AlertCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saveStatus === "success" ? "已保存" : saveStatus === "error" ? "保存失败" : "保存"}
                </button>
              </div>
            </div>

            {/* Model selection */}
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-2">
                模型{(selectedRole === "analyst" || selectedRole === "writer") ? " A（主模型）" : ""}
              </label>
              <select
                value={editForm.model || ""}
                onChange={(e) => setEditForm((prev) => ({ ...prev, model: e.target.value }))}
                className="w-full px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Model B selection - only for analyst and writer (cross-validation) */}
            {(selectedRole === "analyst" || selectedRole === "writer") && (
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-2">
                  模型 B（交叉验证）
                </label>
                <select
                  value={editForm.model_b || ""}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      model_b: e.target.value || null,
                    }))
                  }
                  className="w-full px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
                >
                  <option value="">不启用（单模型模式）</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.description}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-surface-500">
                  启用后，该角色将使用两个模型并行执行，由仲裁官融合结果
                </p>
              </div>
            )}

            {/* Token budget */}
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-2">
                Token 预算（每任务）
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1024}
                  max={32768}
                  step={1024}
                  value={editForm.token_budget || 8192}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, token_budget: parseInt(e.target.value) || 8192 }))
                  }
                  className="w-40 px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
                />
                <span className="text-sm text-surface-500">
                  范围: 1024 - 32768
                </span>
              </div>
            </div>

            {/* System prompt */}
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-2">
                {selectedRole === "arbiter" ? "分析仲裁 Prompt" : "System Prompt"}
              </label>
              <textarea
                value={editForm.system_prompt || ""}
                onChange={(e) => setEditForm((prev) => ({ ...prev, system_prompt: e.target.value }))}
                rows={14}
                className="w-full px-4 py-3 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 resize-y font-mono text-sm leading-relaxed transition-all"
                style={{ minHeight: "200px" }}
              />
              <p className="mt-1 text-xs text-surface-500">
                {(editForm.system_prompt || "").length} / 20000 字符
              </p>
            </div>

            {/* System prompt B - only for arbiter (report arbitration) */}
            {selectedRole === "arbiter" && (
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-2">
                  报告仲裁 Prompt
                </label>
                <textarea
                  value={editForm.system_prompt_b || ""}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, system_prompt_b: e.target.value }))}
                  rows={14}
                  className="w-full px-4 py-3 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 resize-y font-mono text-sm leading-relaxed transition-all"
                  style={{ minHeight: "200px" }}
                />
                <p className="mt-1 text-xs text-surface-500">
                  {(editForm.system_prompt_b || "").length} / 20000 字符
                  <span className="ml-2 text-surface-600">用于融合两份报告的仲裁阶段</span>
                </p>
              </div>
            )}

          </div>
          </div>

          {/* Test panel - fixed at bottom */}
          <div className="flex-shrink-0 border-t border-surface-700 bg-surface-900/80 backdrop-blur px-6 py-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-surface-200">
                  预览测试
                </h3>
                {/* Current config summary tags */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-surface-800 border border-surface-700 text-surface-300">
                    <Cpu className="w-3 h-3 text-primary-400" />
                    {models.find((m) => m.id === editForm.model)?.name || editForm.model || "未选择"}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-surface-800 border border-surface-700 text-surface-300">
                    Token: {editForm.token_budget || 8192}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-surface-800 border border-surface-700 text-surface-300">
                    Prompt: {(editForm.system_prompt || "").length} 字符
                  </span>
                </div>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTest()}
                  placeholder="输入测试消息，验证 Prompt 效果..."
                  className="flex-1 px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
                />
                <button
                  onClick={handleTest}
                  disabled={testing || !testMessage.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-surface-700 disabled:text-surface-500 text-white text-sm font-medium rounded-lg transition-all"
                >
                  {testing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  发送
                </button>
              </div>

              {testError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                  {testError}
                </div>
              )}

              {testResult && (
                <div className="space-y-3 mt-2">
                  {/* Tool calls section */}
                  {testResult.tool_calls && testResult.tool_calls.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-surface-400">
                        工具调用 ({testResult.tool_calls.length} 次)
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {testResult.tool_calls.map((tc, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-2 px-3 py-2 rounded text-xs border ${
                              tc.status === "success"
                                ? "bg-green-500/5 border-green-500/20"
                                : "bg-red-500/5 border-red-500/20"
                            }`}
                          >
                            <span className={`flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                              tc.status === "success" ? "bg-green-400" : "bg-red-400"
                            }`} />
                            <div className="min-w-0 flex-1">
                              <span className="font-mono font-medium text-surface-200">{tc.tool}</span>
                              <span className="text-surface-500 ml-2 break-all">{tc.input}</span>
                              {tc.output_summary && (
                                <div className="text-surface-400 mt-0.5 truncate">→ {tc.output_summary}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No tools called notice */}
                  {testResult.tool_calls && testResult.tool_calls.length === 0 && (
                    <div className="text-xs text-yellow-400/80 px-3 py-2 rounded bg-yellow-500/5 border border-yellow-500/20">
                      本次测试未触发任何工具调用（模型直接回答，未使用工具）
                    </div>
                  )}

                  {/* Response */}
                  <div>
                    <div className="text-xs font-medium text-surface-400 mb-1">模型响应</div>
                    <div className="p-3 rounded-lg bg-surface-800 border border-surface-700 text-sm text-surface-200 whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {testResult.response}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 flex-wrap text-xs text-surface-500">
                    <span className={`px-1.5 py-0.5 rounded ${
                      testResult.status === "completed" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {testResult.status === "completed" ? "✓ 完成" : "✗ " + testResult.status}
                    </span>
                    <span>模型: {testResult.model}</span>
                    <span>迭代: {testResult.iterations} 轮</span>
                    <span>Tokens: {testResult.input_tokens}↓ + {testResult.output_tokens}↑ = {testResult.tokens_used}</span>
                    <span>耗时: {(testResult.duration_ms / 1000).toFixed(1)}s</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
