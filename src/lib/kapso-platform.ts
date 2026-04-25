// Kapso Platform API client (v1)
// Used for workflow management — separate from the WhatsApp SDK

const PLATFORM_BASE = 'https://api.kapso.ai/platform/v1';

function resolveKey(apiKey?: string): string {
  if (apiKey) return apiKey;
  const key = process.env.KAPSO_API_KEY;
  if (!key) throw new Error('KAPSO_API_KEY not set');
  return key;
}

async function platformFetch(path: string, apiKey?: string, options: RequestInit = {}) {
  const url = `${PLATFORM_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'X-API-Key': resolveKey(apiKey),
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

export async function listWorkflows(apiKey?: string) {
  return platformFetch('/workflows', apiKey);
}

export async function listWorkflowExecutions(workflowId: string, page = 1, perPage = 20, apiKey?: string) {
  return platformFetch(`/workflows/${workflowId}/executions?page=${page}&per_page=${perPage}`, apiKey);
}

export async function updateWorkflowExecution(executionId: string, status: string, apiKey?: string) {
  return platformFetch(`/workflow_executions/${executionId}`, apiKey, {
    method: 'PATCH',
    body: JSON.stringify({ workflow_execution: { status } }),
  });
}

export async function resumeWorkflowExecution(executionId: string, currentStatus?: string, apiKey?: string) {
  // Must be in 'waiting' state to resume — set it first if in handoff
  if (currentStatus && currentStatus !== 'waiting') {
    try {
      await updateWorkflowExecution(executionId, 'waiting', apiKey);
    } catch {
      // If can't set to waiting, end the execution instead
      return updateWorkflowExecution(executionId, 'ended', apiKey);
    }
  }
  try {
    return await platformFetch(`/workflow_executions/${executionId}/resume`, apiKey, {
      method: 'POST',
      body: JSON.stringify({
        message: { data: '', kind: 'payload' },
      }),
    });
  } catch {
    // If resume fails, end the execution as fallback
    return updateWorkflowExecution(executionId, 'ended', apiKey);
  }
}
