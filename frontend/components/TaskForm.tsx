"use client";

import { useState, KeyboardEvent } from "react";
import { Send, X, Plus } from "lucide-react";

interface TaskFormProps {
  onSubmit: (data: {
    query: string;
    selfDescription: string;
    competitors: string[];
    industry: string;
    focusAreas: string[];
    reportDepth: "brief" | "standard";
  }) => void;
}

const INDUSTRIES = [
  "互联网/软件",
  "人工智能",
  "金融科技",
  "电子商务",
  "企业服务/SaaS",
  "教育科技",
  "医疗健康",
  "智能硬件",
  "游戏/娱乐",
  "新能源/汽车",
];

const FOCUS_AREAS = [
  { id: "product", label: "产品功能" },
  { id: "pricing", label: "定价策略" },
  { id: "technology", label: "技术架构" },
  { id: "market", label: "市场策略" },
  { id: "user_experience", label: "用户体验" },
  { id: "ecosystem", label: "生态系统" },
  { id: "team", label: "团队背景" },
  { id: "funding", label: "融资情况" },
];

export default function TaskForm({ onSubmit }: TaskFormProps) {
  const [query, setQuery] = useState("");
  const [selfDescription, setSelfDescription] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [competitorInput, setCompetitorInput] = useState("");
  const [industry, setIndustry] = useState("");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [reportDepth, setReportDepth] = useState<"brief" | "standard">("standard");

  const handleAddCompetitor = () => {
    const trimmed = competitorInput.trim();
    if (trimmed && !competitors.includes(trimmed)) {
      setCompetitors([...competitors, trimmed]);
      setCompetitorInput("");
    }
  };

  const handleCompetitorKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCompetitor();
    }
  };

  const handleRemoveCompetitor = (name: string) => {
    setCompetitors(competitors.filter((c) => c !== name));
  };

  const toggleFocusArea = (id: string) => {
    setFocusAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !selfDescription.trim()) return;
    onSubmit({ query, selfDescription, competitors, industry, focusAreas, reportDepth });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-surface-200 mb-2">
          分析目标 *
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="描述您想分析的产品或行业赛道，例如：分析 AI 编程助手市场的主要竞品 / 分析飞书相对于钉钉、企微的竞争态势..."
          rows={3}
          className="w-full px-4 py-3 bg-surface-800 border border-surface-700 rounded-xl text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 resize-none transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-200 mb-2">
          自身情况描述 *
        </label>
        <textarea
          value={selfDescription}
          onChange={(e) => setSelfDescription(e.target.value)}
          placeholder="描述您的核心能力、资源、市场定位，例如：我们是云平台算法部门，核心能力是大模型应用和数据分析，目前服务企业客户 200+，年收入 5000 万..."
          rows={4}
          className="w-full px-4 py-3 bg-surface-800 border border-surface-700 rounded-xl text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 resize-none transition-all"
        />
        <p className="mt-1.5 text-xs text-surface-500">
          用于生成"看自己"和战略建议章节的定制化内容
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-200 mb-2">
          竞品名称
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={competitorInput}
            onChange={(e) => setCompetitorInput(e.target.value)}
            onKeyDown={handleCompetitorKeyDown}
            placeholder="输入竞品名称后按 Enter 添加（可选）"
            className="flex-1 px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
          />
          <button
            type="button"
            onClick={handleAddCompetitor}
            className="px-3 py-2.5 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {competitors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {competitors.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-lg text-sm text-primary-300"
              >
                {name}
                <button
                  type="button"
                  onClick={() => handleRemoveCompetitor(name)}
                  className="hover:text-primary-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-200 mb-2">
          行业领域
        </label>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="w-full px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all appearance-none"
        >
          <option value="">选择行业（可选）</option>
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-200 mb-2">
          关注维度
        </label>
        <p className="text-xs text-surface-500 mb-3">
          选中的维度将作为报告重点分析方向，不选则全面覆盖
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FOCUS_AREAS.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => toggleFocusArea(area.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                focusAreas.includes(area.id)
                  ? "bg-primary-500/15 border-primary-500/30 text-primary-300"
                  : "bg-surface-800 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-300"
              }`}
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-200 mb-3">
          报告篇幅
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setReportDepth("brief")}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
              reportDepth === "brief"
                ? "bg-primary-500/15 border-primary-500/30 text-primary-300"
                : "bg-surface-800 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-300"
            }`}
          >
            <div className="font-semibold">精炼版</div>
            <div className="text-xs mt-1 opacity-70">2000-3000 字，重点结论</div>
          </button>
          <button
            type="button"
            onClick={() => setReportDepth("standard")}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
              reportDepth === "standard"
                ? "bg-primary-500/15 border-primary-500/30 text-primary-300"
                : "bg-surface-800 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-300"
            }`}
          >
            <div className="font-semibold">标准版</div>
            <div className="text-xs mt-1 opacity-70">5000-8000 字，数据详尽</div>
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={!query.trim() || !selfDescription.trim()}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-primary-600 hover:bg-primary-700 disabled:bg-surface-700 disabled:text-surface-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-primary-600/20 disabled:shadow-none"
      >
        <Send className="w-4 h-4" />
        生成竞品分析报告
      </button>
    </form>
  );
}
