import { NextRequest, NextResponse } from 'next/server';
import { updateWorkflowExecution, resumeWorkflowExecution } from '@/lib/kapso-platform';

// PATCH /api/workflow-executions?id=xxx — update execution status (handoff/end)
// POST /api/workflow-executions?id=xxx — resume execution
export async function PATCH(req: NextRequest) {
  const executionId = req.nextUrl.searchParams.get('id');
  if (!executionId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const status = body.status as string;
    if (!status) {
      return NextResponse.json({ error: 'status required' }, { status: 400 });
    }

    const result = await updateWorkflowExecution(executionId, status);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Workflow] Error updating execution:', error);
    return NextResponse.json({ error: 'Failed to update execution' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const executionId = req.nextUrl.searchParams.get('id');
  if (!executionId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const currentStatus = body.currentStatus as string | undefined;
    const result = await resumeWorkflowExecution(executionId, currentStatus);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Workflow] Error resuming execution:', error);
    return NextResponse.json({ error: 'Failed to resume execution' }, { status: 500 });
  }
}
