"""
竞品知识 Schema - 基于 Pydantic v2 的结构化数据模型

参考：
- Anthropic "Building Effective AI Agents" - 结构化输出模式
- TradingAgents - 多层分析数据模型
- 行业标准竞品报告结构（Crayon/Klue/Kompyte）
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class AgentRole(str, Enum):
    ORCHESTRATOR = "orchestrator"
    COLLECTOR = "collector"
    ANALYST = "analyst"
    WRITER = "writer"
    REVIEWER = "reviewer"
    CITATION = "citation"


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    REVIEWING = "reviewing"
    REVISION_NEEDED = "revision_needed"


class ReportDepth(str, Enum):
    BRIEF = "brief"
    STANDARD = "standard"


class CompetitiveAdvantage(str, Enum):
    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"
    UNKNOWN = "unknown"


class SourceCitation(BaseModel):
    """溯源引用 - 确保每条结论有据可查"""
    citation_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    url: str
    title: str
    snippet: str = Field(description="引用的原文片段")
    accessed_at: datetime = Field(default_factory=datetime.now)
    reliability_score: float = Field(default=0.5, ge=0.0, le=1.0)
    agent_id: str = Field(description="采集该信息的 Agent ID")


class CompetitorProfile(BaseModel):
    """竞品企业画像"""
    name: str
    website: str = ""
    description: str = ""
    founded: Optional[str] = None
    headquarters: Optional[str] = None
    funding: Optional[str] = None
    employee_count: Optional[str] = None
    key_products: list[str] = Field(default_factory=list)
    citations: list[SourceCitation] = Field(default_factory=list)


class ProductFeature(BaseModel):
    """产品功能对比项"""
    feature_name: str
    category: str = ""
    description: str = ""
    competitive_advantage: CompetitiveAdvantage = CompetitiveAdvantage.UNKNOWN
    competitor_scores: dict[str, str] = Field(
        default_factory=dict,
        description="各竞品在该功能上的评分/描述",
    )
    evidence: list[SourceCitation] = Field(default_factory=list)


class SWOTItem(BaseModel):
    """SWOT 分析单项"""
    content: str
    evidence: list[SourceCitation] = Field(default_factory=list)


class SWOTAnalysis(BaseModel):
    """SWOT 分析"""
    strengths: list[SWOTItem] = Field(default_factory=list)
    weaknesses: list[SWOTItem] = Field(default_factory=list)
    opportunities: list[SWOTItem] = Field(default_factory=list)
    threats: list[SWOTItem] = Field(default_factory=list)


class MarketPosition(BaseModel):
    """市场定位分析"""
    market_share: Optional[str] = None
    target_audience: str = ""
    pricing_model: str = ""
    key_differentiators: list[str] = Field(default_factory=list)
    market_trends: list[str] = Field(default_factory=list)
    citations: list[SourceCitation] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Structured analysis schemas
# ---------------------------------------------------------------------------


class EvidenceItem(BaseModel):
    """Evidence linking a claim to its source"""
    claim: str
    source_url: str


class IndustryTrends(BaseModel):
    """看行业/趋势"""
    market_size: str = ""
    growth_rate: str = ""
    tech_trends: list[str] = Field(default_factory=list)
    policy_environment: list[str] = Field(default_factory=list)
    lifecycle_stage: str = Field(default="", description="成长期|成熟期|衰退期")
    evidence: list[EvidenceItem] = Field(default_factory=list)


class CustomerSegment(BaseModel):
    """Customer segment detail"""
    segment: str
    needs: list[str] = Field(default_factory=list)
    pain_points: list[str] = Field(default_factory=list)


class MarketCustomers(BaseModel):
    """看市场/客户"""
    customer_segments: list[CustomerSegment] = Field(default_factory=list)
    decision_factors: list[str] = Field(default_factory=list, description="按优先级排序")
    unmet_needs: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)


class CapabilityScore(BaseModel):
    """Capability matrix row"""
    dimension: str
    scores: dict[str, str] = Field(default_factory=dict, description="竞品名 → 强/中/弱")


class StrategicMove(BaseModel):
    """Competitor strategic move"""
    competitor: str
    move: str
    implication: str = ""


class CompetitionLandscape(BaseModel):
    """看竞争"""
    leaders: list[str] = Field(default_factory=list)
    challengers: list[str] = Field(default_factory=list)
    followers: list[str] = Field(default_factory=list)
    niche: list[str] = Field(default_factory=list)
    capability_matrix: list[CapabilityScore] = Field(default_factory=list)
    strategic_moves: list[StrategicMove] = Field(default_factory=list)
    intensity: str = Field(default="中", description="高|中|低")
    evidence: list[EvidenceItem] = Field(default_factory=list)


class SelfAssessment(BaseModel):
    """看自己"""
    strengths_vs_competitors: list[str] = Field(default_factory=list)
    weaknesses_vs_competitors: list[str] = Field(default_factory=list)
    capability_gaps: list[str] = Field(default_factory=list)
    resource_status: str = ""


class OpportunityItem(BaseModel):
    """Single opportunity"""
    opportunity: str
    attractiveness: str = Field(default="中", description="高/中/低")
    feasibility: str = Field(default="中", description="高/中/低")


class Opportunities(BaseModel):
    """看机会"""
    identified: list[OpportunityItem] = Field(default_factory=list)
    priority_ranking: list[str] = Field(default_factory=list)
    reasoning: str = ""
    is_inference: bool = True


class FiveLooksAnalysis(BaseModel):
    """五看结构化分析结果"""
    industry_trends: IndustryTrends = Field(default_factory=IndustryTrends)
    market_customers: MarketCustomers = Field(default_factory=MarketCustomers)
    competition: CompetitionLandscape = Field(default_factory=CompetitionLandscape)
    self_assessment: SelfAssessment = Field(default_factory=SelfAssessment)
    opportunities: Opportunities = Field(default_factory=Opportunities)


class ObjectiveItem(BaseModel):
    """Single strategic objective"""
    objective: str
    metric: str = ""
    timeline: str = ""


class ControlPoints(BaseModel):
    """定控制点"""
    recommended: list[str] = Field(default_factory=list)
    feasibility_analysis: str = ""
    is_inference: bool = True


class Objectives(BaseModel):
    """定目标"""
    short_term: list[ObjectiveItem] = Field(default_factory=list)
    mid_term: list[ObjectiveItem] = Field(default_factory=list)
    is_inference: bool = True


class Strategies(BaseModel):
    """定策略"""
    product_strategy: str = ""
    competition_strategy: str = ""
    key_actions: list[str] = Field(default_factory=list)
    is_inference: bool = True


class ThreeDefinesAnalysis(BaseModel):
    """三定结构化分析结果"""
    control_points: ControlPoints = Field(default_factory=ControlPoints)
    objectives: Objectives = Field(default_factory=Objectives)
    strategies: Strategies = Field(default_factory=Strategies)


class AgentDecisionLog(BaseModel):
    """Agent 决策日志 - 可观测性核心"""
    log_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    agent_id: str
    agent_role: AgentRole
    timestamp: datetime = Field(default_factory=datetime.now)
    action: str = Field(description="Agent 执行的动作")
    reasoning: str = Field(description="Agent 的推理过程")
    tool_calls: list[dict] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0
    result_summary: str = ""
    error: Optional[str] = None


class ReviewFeedback(BaseModel):
    """审查反馈 - 交叉审查闭环"""
    reviewer_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    overall_score: float = Field(ge=0.0, le=10.0)
    accuracy_score: float = Field(ge=0.0, le=10.0)
    completeness_score: float = Field(ge=0.0, le=10.0)
    citation_score: float = Field(ge=0.0, le=10.0)
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    approved: bool = False


class CompetitiveReport(BaseModel):
    """最终结构化竞品报告"""
    report_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    created_at: datetime = Field(default_factory=datetime.now)
    query: str = Field(description="用户原始分析需求")

    # Legacy fields (kept for backward compatibility with demo fallback)
    executive_summary: str = ""
    competitors: list[CompetitorProfile] = Field(default_factory=list)
    feature_comparison: list[ProductFeature] = Field(default_factory=list)
    market_analysis: MarketPosition = Field(default_factory=MarketPosition)
    swot_analyses: dict[str, SWOTAnalysis] = Field(
        default_factory=dict,
        description="每个竞品的 SWOT 分析",
    )
    recommendations: list[str] = Field(default_factory=list)

    # Five Looks Three Defines structured analysis
    five_looks: Optional[FiveLooksAnalysis] = None
    three_defines: Optional[ThreeDefinesAnalysis] = None

    all_citations: list[SourceCitation] = Field(default_factory=list)
    agent_traces: list[AgentDecisionLog] = Field(default_factory=list)
    review_history: list[ReviewFeedback] = Field(default_factory=list)

    markdown_report: str = Field(default="", description="Markdown 格式的完整报告正文")
    total_tokens_used: int = 0
    total_duration_ms: int = 0


class DAGNode(BaseModel):
    """DAG 节点"""
    node_id: str
    agent_role: AgentRole
    task_description: str
    status: TaskStatus = TaskStatus.PENDING
    dependencies: list[str] = Field(default_factory=list)
    output: Optional[dict] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class DAGPlan(BaseModel):
    """DAG 执行计划"""
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    query: str
    nodes: list[DAGNode] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)


class AnalysisTask(BaseModel):
    """分析任务"""
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    query: str
    self_description: str = Field(default="", description="用户自身核心能力、资源、市场定位描述")
    competitors: list[str] = Field(default_factory=list)
    industry: str = ""
    focus_areas: list[str] = Field(default_factory=list)
    report_depth: ReportDepth = Field(default=ReportDepth.STANDARD, description="报告篇幅：brief/standard")
    status: TaskStatus = TaskStatus.PENDING
    error_message: str = ""
    dag_plan: Optional[DAGPlan] = None
    report: Optional[CompetitiveReport] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
