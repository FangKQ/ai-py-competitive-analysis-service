const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Task {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  query: string;
  competitors: string[];
  industry: string;
  focus_areas: string[];
  created_at: string;
}

export interface Report {
  id: string;
  task_id: string;
  content: string;
  citations: Citation[];
  created_at: string;
}

export interface Citation {
  id: string;
  ref_id: string;
  title: string;
  url: string;
  source: string;
}

export interface TraceEntry {
  id: string;
  task_id: string;
  agent: string;
  action: string;
  reasoning: string;
  tool_calls: string[];
  tokens: number;
  duration: number;
  timestamp: string;
}

export async function createTask(data: {
  query: string;
  selfDescription: string;
  competitors: string[];
  industry: string;
  focusAreas: string[];
  reportDepth: "brief" | "standard";
}): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: data.query,
      self_description: data.selfDescription,
      competitors: data.competitors,
      industry: data.industry,
      focus_areas: data.focusAreas,
      report_depth: data.reportDepth,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create task: ${res.status}`);
  }

  const data_resp = await res.json();
  // Backend returns task_id, map to id for frontend
  return {
    ...data_resp,
    id: data_resp.task_id || data_resp.id,
  } as Task;
}

export async function getTask(taskId: string): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`);
  if (!res.ok) {
    throw new Error(`Failed to get task: ${res.status}`);
  }
  return res.json();
}

export async function getReport(taskId: string): Promise<Report> {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/report`);
  if (!res.ok) {
    throw new Error(`Failed to get report: ${res.status}`);
  }
  return res.json();
}

export async function getTraces(taskId: string): Promise<TraceEntry[]> {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/traces`);
  if (!res.ok) {
    throw new Error(`Failed to get traces: ${res.status}`);
  }
  return res.json();
}

export function streamEvents(taskId: string): EventSource {
  return new EventSource(`${API_BASE}/api/tasks/${taskId}/events`);
}
