#!/usr/bin/env node
/**
 * Real-time Deep Research progress monitor with animations
 */

import { createNodeClient } from '../../Contract/node-client.mjs';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Animation frames
const spinners = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['|', '/', '-', '\\'],
  arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  box: ['◰', '◳', '◲', '◱'],
  circle: ['◐', '◓', '◑', '◒'],
  pulse: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷']
};

let frameIndex = 0;
let lastStatus = null;

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function getSpinnerFrame(type = 'dots') {
  const frames = spinners[type] || spinners.dots;
  frameIndex = (frameIndex + 1) % frames.length;
  return frames[frameIndex];
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

function renderProgressBar(current, max, width = 40) {
  const filled = Math.floor((current / max) * width);
  const empty = width - filled;
  const percentage = Math.floor((current / max) * 100);

  const bar = colors.green + '█'.repeat(filled) +
              colors.dim + '░'.repeat(empty) + colors.reset;

  return `${bar} ${percentage}%`;
}

function renderWorkerStatus(worker) {
  let statusIcon = '';
  let statusColor = colors.reset;

  switch (worker.status) {
    case 'working':
      statusIcon = getSpinnerFrame('pulse');
      statusColor = colors.yellow;
      break;
    case 'completed':
      statusIcon = '✓';
      statusColor = colors.green;
      break;
    case 'failed':
      statusIcon = '✗';
      statusColor = colors.red;
      break;
    default:
      statusIcon = '○';
      statusColor = colors.dim;
  }

  return `${statusColor}${statusIcon}${colors.reset} ${worker.label} ${colors.dim}(${worker.engine})${colors.reset}`;
}

function renderTask(task) {
  let statusIcon = '';
  let statusColor = colors.reset;

  switch (task.status) {
    case 'running':
      statusIcon = getSpinnerFrame('dots');
      statusColor = colors.cyan;
      break;
    case 'completed':
      statusIcon = '✓';
      statusColor = colors.green;
      break;
    case 'failed':
      statusIcon = '✗';
      statusColor = colors.red;
      break;
    default:
      statusIcon = '○';
      statusColor = colors.dim;
  }

  const duration = task.finishedAt
    ? formatDuration(task.finishedAt - task.startedAt)
    : formatDuration(Date.now() - task.startedAt);

  return `  ${statusColor}${statusIcon}${colors.reset} ${task.label} ${colors.dim}(${duration})${colors.reset}`;
}

function renderHeader(summary) {
  const lines = [];

  lines.push('');
  lines.push(colors.bright + colors.cyan + '═'.repeat(80) + colors.reset);
  lines.push(colors.bright + '  Deep Research Monitor' + colors.reset);
  lines.push(colors.cyan + '═'.repeat(80) + colors.reset);
  lines.push('');

  // Topic
  lines.push(colors.bright + 'Topic: ' + colors.reset + summary.topic);
  lines.push('');

  // Phase
  const phaseColor = summary.phase === 'complete' ? colors.green : colors.yellow;
  lines.push(colors.bright + 'Phase: ' + colors.reset +
             phaseColor + summary.phaseLabel + colors.reset +
             colors.dim + ` (${summary.phase})` + colors.reset);
  lines.push('');

  // Duration
  lines.push(colors.bright + 'Duration: ' + colors.reset + formatDuration(summary.duration));
  lines.push('');

  return lines.join('\n');
}

function renderProgress(summary) {
  const lines = [];

  lines.push(colors.bright + 'Progress:' + colors.reset);
  lines.push('');

  // Sources
  const sourcesProgress = renderProgressBar(
    summary.progress.sources.collected,
    summary.progress.sources.max,
    30
  );
  lines.push(`  Sources: ${summary.progress.sources.collected}/${summary.progress.sources.max}`);
  lines.push(`  ${sourcesProgress}`);
  lines.push('');

  // Findings
  lines.push(`  Findings: ${colors.green}${summary.progress.findings}${colors.reset}`);

  // Contradictions
  if (summary.progress.contradictions > 0) {
    lines.push(`  Contradictions: ${colors.red}${summary.progress.contradictions}${colors.reset}`);
  }

  // Entities
  if (summary.progress.entities > 0) {
    lines.push(`  Entities: ${colors.cyan}${summary.progress.entities}${colors.reset}`);
  }

  lines.push('');

  return lines.join('\n');
}

function renderWorkers(workers) {
  const lines = [];

  lines.push(colors.bright + 'Workers:' + colors.reset);
  lines.push('');

  for (const worker of workers) {
    lines.push('  ' + renderWorkerStatus(worker));
  }

  lines.push('');

  return lines.join('\n');
}

function renderTasks(tasks) {
  const lines = [];

  if (tasks.length === 0) {
    return '';
  }

  lines.push(colors.bright + 'Tasks:' + colors.reset);
  lines.push('');

  for (const task of tasks) {
    lines.push(renderTask(task));
  }

  lines.push('');

  return lines.join('\n');
}

function renderDimensions(dimensions) {
  const lines = [];

  if (!dimensions || dimensions.length === 0) {
    return '';
  }

  lines.push(colors.bright + 'Research Dimensions:' + colors.reset);
  lines.push('');

  for (const dim of dimensions) {
    let statusIcon = '';
    let statusColor = colors.reset;

    switch (dim.status) {
      case 'completed':
        statusIcon = '✓';
        statusColor = colors.green;
        break;
      case 'running':
        statusIcon = getSpinnerFrame('arrow');
        statusColor = colors.yellow;
        break;
      default:
        statusIcon = '○';
        statusColor = colors.dim;
    }

    lines.push(`  ${statusColor}${statusIcon}${colors.reset} ${dim.query}`);
  }

  lines.push('');

  return lines.join('\n');
}

function renderFooter(data) {
  const lines = [];

  lines.push(colors.cyan + '─'.repeat(80) + colors.reset);
  lines.push(colors.dim + `Status: ${data.status} | Revision: ${data.revision} | Press Ctrl+C to exit` + colors.reset);
  lines.push('');

  return lines.join('\n');
}

async function monitor(jobId, refreshInterval = 2000) {
  console.log(colors.bright + `\nMonitoring research job: ${jobId}\n` + colors.reset);

  const client = createNodeClient();
  let running = true;

  process.on('SIGINT', () => {
    running = false;
    clearScreen();
    console.log(colors.bright + '\n✓ Monitor stopped\n' + colors.reset);
    process.exit(0);
  });

  while (running) {
    try {
      const data = await client.invoke('workflow.get', { id: jobId });

      if (!data) {
        console.error(colors.red + 'Error: Workflow not found' + colors.reset);
        break;
      }

      const summary = data.summary;

      // Clear and redraw
      clearScreen();

      // Render all sections
      console.log(renderHeader(summary));
      console.log(renderProgress(summary));
      console.log(renderWorkers(summary.workers));
      console.log(renderTasks(summary.tasks));
      console.log(renderDimensions(summary.dimensions));
      console.log(renderFooter(data));

      // Check if complete
      if (data.status === 'completed' || data.status === 'failed') {
        console.log(colors.bright + colors.green + '\n✓ Research completed!\n' + colors.reset);
        break;
      }

      lastStatus = data;

      // Wait before next refresh
      await new Promise(resolve => setTimeout(resolve, refreshInterval));

    } catch (error) {
      console.error(colors.red + 'Monitor error: ' + error.message + colors.reset);
      break;
    }
  }
}

// CLI interface
const args = process.argv.slice(2);
const jobId = args[0];

if (!jobId) {
  console.error('Usage: monitor.mjs <job-id>');
  process.exit(1);
}

monitor(jobId).catch(error => {
  console.error(colors.red + 'Fatal error: ' + error.message + colors.reset);
  process.exit(1);
});
