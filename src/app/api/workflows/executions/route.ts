import { NextRequest, NextResponse } from 'next/server';
import { listWorkflows, listWorkflowExecutions } from '@/lib/kapso-platform';

// GET /api/workflows/executions?conversationId=xxx
// Returns active/waiting executions for a given conversation
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  const conversationIds = req.nextUrl.searchParams.get('conversationIds');

  if (!conversationId && !conversationIds) {
    return NextResponse.json({ error: 'conversationId or conversationIds required' }, { status: 400 });
  }

  const targetIds = new Set<string>();
  if (conversationId) targetIds.add(conversationId);
  if (conversationIds) conversationIds.split(',').forEach(id => targetIds.add(id.trim()));

  try {
    // First, list all workflows to get their IDs
    const { data: workflows } = await listWorkflows();

    // For each active workflow, check executions
    const activeWorkflows = workflows.filter((w: { status: string }) =>
      w.status === 'active'
    );

    const results: Record<string, unknown>[] = [];

    for (const workflow of activeWorkflows) {
      const { data: executions } = await listWorkflowExecutions(workflow.id, 1, 50);

      for (const exec of executions) {
        if (targetIds.has(exec.whatsapp_conversation_id) &&
            (exec.status === 'waiting' || exec.status === 'running' || exec.status === 'paused' || exec.status === 'handoff')) {
          results.push({
            id: exec.id,
            status: exec.status,
            workflowId: workflow.id,
            workflowName: workflow.name,
            conversationId: exec.whatsapp_conversation_id,
            currentStep: exec.current_step,
            startedAt: exec.started_at,
            lastEventAt: exec.last_event_at,
          });
        }
      }
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error('[Workflows] Error fetching executions:', error);
    return NextResponse.json({ error: 'Failed to fetch workflow executions' }, { status: 500 });
  }
}
