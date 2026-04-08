// Kapso Platform API client (v1)
// Used for workflow management — separate from the WhatsApp SDK

const PLATFORM_BASE = 'https://api.kapso.ai/platform/v1';

function getApiKey(): string {
  const key = process.env.KAPSO_API_KEY;
  if (!key) throw new Error('KAPSO_API_KEY not set');
  return key;
}

async function platformFetch(path: string, options: RequestInit = {}) {
  const url = `${PLATFORM_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kapso Platform API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function listWorkflows() {
  return platformFetch('/workflows');
}

export async function listWorkflowExecutions(workflowId: string, page = 1, perPage = 20) {
  return platformFetch(`/workflows/${workflowId}/executions?page=${page}&per_page=${perPage}`);
}

export async function updateWorkflowExecution(executionId: string, status: string) {
  return platformFetch(`/workflow_executions/${executionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ workflow_execution: { status } }),
  });
}

export async function resumeWorkflowExecution(executionId: string) {
  return platformFetch(`/workflow_executions/${executionId}/resume`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
