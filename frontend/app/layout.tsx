import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "@/lib/client-providers";

export const metadata: Metadata = {
  title: "竞品分析 Agent 协作系统",
  description: "AI 驱动的多 Agent 竞品分析协作平台，自动化完成竞品调研、分析与报告生成",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
