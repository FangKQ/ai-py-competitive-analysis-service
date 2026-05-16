"""
预置 Demo 场景数据 - 确保 Demo 稳定可靠

三个场景直接关联字节业务：
1. AI 对话助手竞品分析（豆包 vs 竞品）
2. 短视频平台竞品分析（抖音 vs 竞品）
3. AI 编程工具竞品分析（TRAE vs 竞品，比赛赞助商关联）
"""

DEMO_SCENARIOS = [
    {
        "id": "ai-assistant",
        "name": "AI 对话助手竞品分析",
        "query": "分析中国市场主要 AI 对话助手产品的竞争格局，包括功能对比、市场份额、用户体验和技术架构差异",
        "competitors": ["豆包 (Doubao)", "Kimi", "DeepSeek", "通义千问"],
        "industry": "AI 对话助手",
        "focus_areas": ["功能对比", "用户体验", "市场份额", "技术架构", "定价策略"],
        "description": "直接关联字节核心 AI 产品线，分析豆包在 AI 对话助手赛道的竞争地位",
        "cached_report": {
            "executive_summary": (
                "在中国 AI 对话助手市场，豆包（Doubao）凭借字节跳动的生态优势，"
                "截至 2025 年 Q4 月活用户达 2.27 亿，稳居市场第一。Kimi 以长文本处理能力见长，"
                "DeepSeek 以开源策略快速崛起，通义千问依托阿里云企业生态。"
                "各产品在多模态能力、上下文窗口、生态整合等维度存在差异化竞争。"
            ),
            "competitors": [
                {
                    "name": "豆包 (Doubao)",
                    "description": "字节跳动旗下 AI 对话助手，基于豆包大模型",
                    "website": "https://www.doubao.com",
                    "key_features": [
                        "日活超 1 亿",
                        "多模态理解与生成",
                        "与抖音/飞书深度集成",
                        "AI 伴侣/智能体生态",
                        "语音对话能力",
                    ],
                    "market_position": "市场领导者",
                },
                {
                    "name": "Kimi",
                    "description": "月之暗面出品的 AI 助手，以超长上下文窗口著称",
                    "website": "https://kimi.moonshot.cn",
                    "key_features": [
                        "200 万字超长上下文",
                        "深度阅读与总结",
                        "学术论文分析",
                        "网页浏览能力",
                    ],
                    "market_position": "强势挑战者",
                },
                {
                    "name": "DeepSeek",
                    "description": "深度求索开源大模型 AI 助手",
                    "website": "https://chat.deepseek.com",
                    "key_features": [
                        "开源模型策略",
                        "强代码能力",
                        "深度推理 (R1 模型)",
                        "高性价比 API",
                    ],
                    "market_position": "快速崛起者",
                },
                {
                    "name": "通义千问",
                    "description": "阿里云旗下大模型 AI 助手",
                    "website": "https://tongyi.aliyun.com",
                    "key_features": [
                        "阿里云企业生态",
                        "多模态能力",
                        "开源 Qwen 系列",
                        "电商场景整合",
                    ],
                    "market_position": "生态依托者",
                },
            ],
            "feature_comparison": [
                {
                    "feature": "月活用户",
                    "豆包": "2.27 亿 (领先)",
                    "Kimi": "约 3600 万",
                    "DeepSeek": "约 2000 万",
                    "通义千问": "约 1500 万",
                },
                {
                    "feature": "上下文窗口",
                    "豆包": "128K tokens",
                    "Kimi": "200 万字 (领先)",
                    "DeepSeek": "128K tokens",
                    "通义千问": "128K tokens",
                },
                {
                    "feature": "多模态",
                    "豆包": "文本+图片+语音",
                    "Kimi": "文本+图片",
                    "DeepSeek": "文本+图片+代码",
                    "通义千问": "文本+图片+语音+视频",
                },
                {
                    "feature": "生态整合",
                    "豆包": "抖音+飞书+即梦 (领先)",
                    "Kimi": "独立应用",
                    "DeepSeek": "开源社区",
                    "通义千问": "阿里云+淘宝",
                },
            ],
        },
    },
    {
        "id": "short-video",
        "name": "短视频平台竞品分析",
        "query": "分析中国短视频平台的竞争格局，重点关注内容生态、商业化模式、AI 技术应用差异",
        "competitors": ["抖音", "快手", "小红书", "B站"],
        "industry": "短视频/社交媒体",
        "focus_areas": ["内容生态", "商业化模式", "AI 技术应用", "用户画像", "增长策略"],
        "description": "分析字节抖音在短视频赛道的竞争优势与挑战",
    },
    {
        "id": "ai-coding",
        "name": "AI 编程工具竞品分析",
        "query": "对比分析主流 AI 编程辅助工具的功能、技术架构和市场表现",
        "competitors": ["Cursor", "GitHub Copilot", "TRAE", "Windsurf"],
        "industry": "AI 开发工具",
        "focus_areas": ["代码补全能力", "多文件编辑", "Agent 模式", "定价", "生态整合"],
        "description": "关联比赛独家技术支持方 TRAE，分析 AI 编程工具赛道",
    },
]
