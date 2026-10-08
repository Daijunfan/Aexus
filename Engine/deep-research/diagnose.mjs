#!/usr/bin/env node
/**
 * Deep Research diagnostic tool
 * Helps troubleshoot research workflows and worker agents
 */

import { createNodeClient } from '../../Contract/node-client.mjs';
import { ENGINE_ID } from './model.mjs';

const client = createNodeClient();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

async function diagnose(workflowId) {
  console.log(colors.bright + '\n🔍 Deep Research Diagnostic Tool\n' + colors.reset);

  try {
    // Get workflow data
    console.log(colors.cyan + '📊 Fetching workflow data...' + colors.reset);
    const workflow = await client.invoke('workflow.get', { id: workflowId });

    console.log('\n' + colors.bright + 'Workflow ID:' + colors.reset, workflow.id);
    console.log(colors.bright + 'Status:' + colors.reset, getStatusColor(workflow.status) + workflow.status + colors.reset);
    console.log(colors.bright + 'Phase:' + colors.reset, workflow.summary.phaseLabel);
    console.log(colors.bright + 'Duration:' + colors.reset, formatDuration(workflow.summary.duration));
    console.log(colors.bright + 'Revision:' + colors.reset, workflow.revision);
    console.log();

    // Check workers
    console.log(colors.cyan + '👥 Workers Status:\n' + colors.reset);
    for (const worker of workflow.summary.workers) {
      const statusColor = getStatusColor(worker.status);
      console.log(`  ${statusColor}${getStatusIcon(worker.status)}${colors.reset} ${worker.label}`);
      console.log(`     Engine: ${worker.engine}`);
      console.log(`     Status: ${statusColor}${worker.status}${colors.reset}`);

      // Get detailed worker status
      try {
        const sessions = await client.invoke('session.status', { employee: worker.id });
        const session = sessions?.[0];

        if (session) {
          console.log(`     Busy: ${session.busy ? colors.yellow + 'Yes' + colors.reset : 'No'}`);
          console.log(`     Waiting Approval: ${session.waitingApproval ? colors.yellow + 'Yes' + colors.reset : 'No'}`);

          if (session.currentTask) {
            console.log(`     Current Task: Started ${formatDuration(Date.now() - session.currentTask.startedAt)} ago`);
          }

          if (session.activityPreview) {
            console.log(`     Activity: ${session.activityPreview.tool}`);
            if (session.activityPreview.running) {
              console.log(colors.yellow + '     ⚠️  Still running...' + colors.reset);
            }
          }

          if (session.initialization?.status === 'failed') {
            console.log(colors.red + `     ❌ Init Failed: ${session.initialization.error}` + colors.reset);
          }
        }
      } catch (error) {
        console.log(colors.red + `     ❌ Failed to get session status: ${error.message}` + colors.reset);
      }

      console.log();
    }

    // Check tasks
    console.log(colors.cyan + '📋 Tasks:\n' + colors.reset);
    for (const task of workflow.summary.tasks) {
      const statusColor = getStatusColor(task.status);
      console.log(`  ${statusColor}${getStatusIcon(task.status)}${colors.reset} ${task.label}`);
      console.log(`     ID: ${task.id}`);
      console.log(`     Status: ${statusColor}${task.status}${colors.reset}`);

      if (task.startedAt) {
        const duration = task.finishedAt
          ? task.finishedAt - task.startedAt
          : Date.now() - task.startedAt;
        console.log(`     Duration: ${formatDuration(duration)}`);
      }

      if (task.error) {
        console.log(colors.red + `     ❌ Error: ${task.error}` + colors.reset);
      }

      console.log();
    }

    // Check plan
    if (workflow.summary.plan) {
      console.log(colors.cyan + '📝 Research Plan:\n' + colors.reset);
      console.log(`  Strategy: ${workflow.summary.plan.strategy}`);
      console.log(`  Dimensions: ${workflow.summary.plan.dimensions.length}`);
      console.log();
    }

    // Check dimensions
    if (workflow.summary.dimensions?.length > 0) {
      console.log(colors.cyan + '🎯 Research Dimensions:\n' + colors.reset);
      for (const dim of workflow.summary.dimensions) {
        const statusColor = getStatusColor(dim.status);
        console.log(`  ${statusColor}${getStatusIcon(dim.status)}${colors.reset} ${dim.query}`);
      }
      console.log();
    }

    // Progress
    console.log(colors.cyan + '📈 Progress:\n' + colors.reset);
    console.log(`  Sources: ${workflow.summary.progress.sources.collected}/${workflow.summary.progress.sources.max}`);
    console.log(`  Findings: ${workflow.summary.progress.findings}`);
    console.log(`  Entities: ${workflow.summary.progress.entities}`);
    console.log(`  Contradictions: ${workflow.summary.progress.contradictions}`);
    console.log();

    // Recommendations
    console.log(colors.cyan + '💡 Recommendations:\n' + colors.reset);

    const failedWorkers = workflow.summary.workers.filter(w => w.status === 'failed');
    if (failedWorkers.length > 0) {
      console.log(colors.yellow + '  ⚠️  Some workers have failed. Check their transcripts:' + colors.reset);
      for (const worker of failedWorkers) {
        console.log(`     node Infra/src/cli/agents session transcript ${worker.id}`);
      }
      console.log();
    }

    const failedTasks = workflow.summary.tasks.filter(t => t.status === 'failed');
    if (failedTasks.length > 0) {
      console.log(colors.yellow + '  ⚠️  Some tasks have failed. Consider retrying:' + colors.reset);
      console.log(`     Engine/deep-research/cli.mjs resume --id ${workflowId} --revision ${workflow.revision} --request-id retry-${Date.now()}`);
      console.log();
    }

    const runningTasks = workflow.summary.tasks.filter(t => t.status === 'running');
    if (runningTasks.length > 0) {
      const oldestTask = runningTasks.reduce((oldest, task) =>
        !oldest || task.startedAt < oldest.startedAt ? task : oldest
      , null);

      const taskAge = Date.now() - oldestTask.startedAt;
      if (taskAge > 5 * 60 * 1000) { // 5 minutes
        console.log(colors.yellow + `  ⚠️  Task "${oldestTask.label}" has been running for ${formatDuration(taskAge)}` + colors.reset);
        console.log('     This might indicate a stuck worker. Consider canceling and retrying.');
        console.log();
      }
    }

    if (workflow.status === 'failed') {
      console.log(colors.red + '  ❌ Workflow has failed.' + colors.reset);
      console.log('     Review error messages above and retry with fixes.');
      console.log();
    }

    if (workflow.status === 'running' && workflow.summary.phase === 'planning') {
      console.log(colors.cyan + '  ℹ️  Still in planning phase.' + colors.reset);
      console.log('     The coordinator is generating the research plan.');
      console.log('     This typically takes 1-3 minutes.');
      console.log();
    }

  } catch (error) {
    console.error(colors.red + '\n❌ Diagnostic failed: ' + error.message + colors.reset);
    console.error(error.stack);
    process.exit(1);
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'completed': return colors.green;
    case 'failed': return colors.red;
    case 'running':
    case 'working': return colors.yellow;
    default: return colors.reset;
  }
}

function getStatusIcon(status) {
  switch (status) {
    case 'completed': return '✓';
    case 'failed': return '✗';
    case 'running':
    case 'working': return '⚙';
    default: return '○';
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// CLI
const workflowId = process.argv[2];
if (!workflowId) {
  console.error('Usage: diagnose.mjs <workflow-id>');
  process.exit(1);
}

diagnose(workflowId).catch(error => {
  console.error(colors.red + 'Fatal error:' + colors.reset, error);
  process.exit(1);
});
