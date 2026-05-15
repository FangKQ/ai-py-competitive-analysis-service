"use client";

import { Bot, Github, BookOpen, Play } from "lucide-react";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-surface-700/60 bg-surface-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <span className="font-semibold text-surface-100 tracking-tight">
          CompetitorAI
        </span>
        <span className="hidden sm:inline text-xs text-surface-500 px-2 py-0.5 bg-surface-800 rounded-full border border-surface-700">
          v0.1.0
        </span>
      </div>

      <nav className="flex items-center gap-1">
        <a
          href="#demo"
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded-lg transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">演示</span>
        </a>
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
