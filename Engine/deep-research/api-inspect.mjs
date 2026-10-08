#!/usr/bin/env node

// Use Infra API to deeply inspect workflow state

import { spawn } from 'child_process';

const workflowId = process.argv[2];
if (!workflowId) {
  console.error('Usage: node api-inspect.mjs <workflow-id>');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  API-based Workflow State Inspection');
console.log('═══════════════════════════════════════════════════════════\n');

// Get workflow data via Infra CLI
const proc = spawn('node', ['Infra/src/cli/agents', 'workflow', 'get', '--id', workflowId, '--json'], {
  stdio: ['inherit', 'pipe', 'inherit']
});

let output = '';
proc.stdout.on('data', (data) => {
  output += data.toString();
});

proc.on('close', (code) => {
  if (code !== 0) {
    console.error('Failed to get workflow data');
    process.exit(1);
  }

  try {
    const response = JSON.parse(output);
    const workflow = response.data;

    console.log(`Workflow ID: ${workflow.id}`);
    console.log(`Status: ${workflow.status}`);
    console.log(`Phase: ${workflow.summary.phase}`);
    console.log();

    // Inspect dimensions in summary
    if (workflow.summary.dimensions) {
      console.log('Summary.dimensions:');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`  Type: ${typeof workflow.summary.dimensions}`);
      console.log(`  Is Array: ${Array.isArray(workflow.summary.dimensions)}`);
      console.log(`  Length: ${workflow.summary.dimensions.length}`);

      if (workflow.summary.dimensions.length > 0) {
        console.log(`\n  First dimension (raw JSON):`);
        console.log(JSON.stringify(workflow.summary.dimensions[0], null, 4));

        const dim = workflow.summary.dimensions[0];
        console.log(`\n  First dimension detailed analysis:`);
        console.log(`    Keys: ${Object.keys(dim).join(', ')}`);
        console.log(`    id: ${dim.id}`);
        console.log(`    query type: ${typeof dim.query}`);
        console.log(`    query value: "${dim.query}"`);
        console.log(`    query === "[object Object]": ${dim.query === '[object Object]'}`);
        console.log(`    rationale: "${dim.rationale}"`);
        console.log(`    status: ${dim.status}`);
      }
      console.log();
    }

    // Inspect plan
    if (workflow.summary.plan) {
      console.log('Summary.plan:');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`  Keys: ${Object.keys(workflow.summary.plan).join(', ')}`);

      if (workflow.summary.plan.dimensions) {
        console.log(`  Plan.dimensions count: ${workflow.summary.plan.dimensions.length}`);
        if (workflow.summary.plan.dimensions.length > 0) {
          console.log(`  First plan dimension:`);
          console.log(JSON.stringify(workflow.summary.plan.dimensions[0], null, 4));
        }
      }
      console.log();
    }

    // Inspect tasks
    if (workflow.summary.tasks && workflow.summary.tasks.length > 0) {
      console.log('Tasks:');
      console.log('─────────────────────────────────────────────────────────────');
      for (const task of workflow.summary.tasks) {
        if (task.id.includes('plan')) {
          console.log(`\nTask: ${task.id}`);
          console.log(`  Label: ${task.label}`);
          console.log(`  Status: ${task.status}`);
          console.log(`  Duration: ${task.duration || 'N/A'}`);
          if (task.error) {
            console.log(`  Error: ${task.error}`);
          }
        }
      }
      console.log();
    }

    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('Error parsing workflow data:', error.message);
    console.error('Raw output:', output);
    process.exit(1);
  }
});
