"use client";

import { Bot, Github, BookOpen, Play, Settings, FileText, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-surface-700/60 bg-surface-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-surface-100 tracking-tight">
            CompetitorAI
          </span>
        </Link>
        <span className="hidden sm:inline text-xs text-surface-500 px-2 py-0.5 bg-surface-800 rounded-full border border-surface-700">
          v0.1.0
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {!isHome && (
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded-lg transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">首页</span>
          </Link>
        )}
        {!isHome && (
          <Link
            href="/?action=create"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-300 hover:text-primary-200 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 rounded-lg transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">生成报告</span>
          </Link>
        )}
        <Link
          href="/agents"
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors ${
            pathname === "/agents"
              ? "text-primary-300 bg-primary-500/10"
              : "text-surface-400 hover:text-surface-200 hover:bg-surface-800"
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Agent 工坊</span>
        </Link>
        <Link
          href="/?action=demo"
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded-lg transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">演示</span>
        </Link>
        <a
          href="#docs"
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded-lg transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">文档</span>
        </a>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded-lg transition-colors"
        >
          <Github className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </nav>
    </header>
  );
}
