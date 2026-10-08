#!/usr/bin/env node

// Deep inspection of workflow state to find where [object Object] comes from

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const workflowId = process.argv[2];
if (!workflowId) {
  console.error('Usage: node deep-inspect.mjs <workflow-id>');
  process.exit(1);
}

// Find workflow checkpoint files
const aexusDir = join(homedir(), '.claude-vscode', '.aexus-workflows');
try {
  const files = readdirSync(aexusDir);
  const checkpointFiles = files.filter(f => f.startsWith(workflowId));

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Deep Workflow State Inspection');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`Workflow ID: ${workflowId}`);
  console.log(`Found ${checkpointFiles.length} checkpoint files\n`);

  if (checkpointFiles.length === 0) {
    console.log('No checkpoint files found.');
    process.exit(0);
  }

  // Read the latest checkpoint
  const latestFile = checkpointFiles.sort().reverse()[0];
  console.log(`Reading latest checkpoint: ${latestFile}\n`);

  const content = readFileSync(join(aexusDir, latestFile), 'utf-8');
  const state = JSON.parse(content);

  console.log('State keys:', Object.keys(state).join(', '));
  console.log();

  // Inspect tasks
  if (state.tasks) {
    console.log('Tasks:');
    console.log('─────────────────────────────────────────────────────────────');
    for (const [taskId, task] of Object.entries(state.tasks)) {
      console.log(`\nTask: ${taskId}`);
      console.log(`  Status: ${task.status}`);
      console.log(`  Kind: ${task.kind || 'N/A'}`);

      if (task.result) {
        console.log(`  Result keys: ${Object.keys(task.result).join(', ')}`);

        if (task.result.dimensions) {
          console.log(`  Result dimensions count: ${task.result.dimensions.length}`);
          if (task.result.dimensions.length > 0) {
            console.log(`  First result dimension:`);
            console.log(JSON.stringify(task.result.dimensions[0], null, 4));
          }
        }
      }
    }
    console.log();
  }

  // Inspect state.plan
  if (state.plan) {
    console.log('State.plan:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`  Keys: ${Object.keys(state.plan).join(', ')}`);
    if (state.plan.dimensions) {
      console.log(`  Plan dimensions count: ${state.plan.dimensions.length}`);
      if (state.plan.dimensions.length > 0) {
        console.log(`  First plan dimension:`);
        console.log(JSON.stringify(state.plan.dimensions[0], null, 4));
      }
    }
    console.log();
  }

  // Inspect state.dimensions
  if (state.dimensions) {
    console.log('State.dimensions:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`  Type: ${typeof state.dimensions}`);
    console.log(`  Is Array: ${Array.isArray(state.dimensions)}`);
    console.log(`  Length: ${state.dimensions.length}`);

    if (state.dimensions.length > 0) {
      console.log(`\n  First dimension (raw):`);
      console.log(JSON.stringify(state.dimensions[0], null, 4));

      const dim = state.dimensions[0];
      console.log(`\n  First dimension analysis:`);
      console.log(`    query type: ${typeof dim.query}`);
      console.log(`    query value: ${dim.query}`);
      console.log(`    query length: ${dim.query ? dim.query.length : 'N/A'}`);

      // Check if it's actually [object Object] string
      if (dim.query === '[object Object]') {
        console.log(`    ⚠️  query IS the literal string "[object Object]"`);
      }
    }
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════');

} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
