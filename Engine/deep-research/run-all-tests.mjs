#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tests = [
  'test-all-question-formats.mjs',
  'test-questions-array.mjs',
  'test-end-to-end-flow.mjs',
  'test-snake-case.mjs',
  'test-edge-cases.mjs',
  'test-validate.mjs'
];

let totalPassed = 0;
let totalFailed = 0;

console.log('🧪 Running Deep Research Test Suite\n');
console.log('═'.repeat(60));

async function runTest(testFile) {
  return new Promise((resolve) => {
    const testPath = join(__dirname, testFile);
    const proc = spawn('node', [testPath], {
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let output = '';
    let errors = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errors += data.toString();
    });

    proc.on('close', (code) => {
      const success = code === 0;
      resolve({ success, output, errors, testFile });
    });
  });
}

for (const test of tests) {
  const startTime = Date.now();
  console.log(`\n📝 Running: ${test}`);

  const result = await runTest(test);
  const duration = Date.now() - startTime;

  if (result.success) {
    console.log(`✅ PASSED (${duration}ms)`);
    totalPassed++;
  } else {
    console.log(`❌ FAILED (${duration}ms)`);
    console.log('\nOutput:');
    console.log(result.output);
    if (result.errors) {
      console.log('\nErrors:');
      console.log(result.errors);
    }
    totalFailed++;
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`\n📊 Test Summary:`);
console.log(`   ✅ Passed: ${totalPassed}`);
console.log(`   ❌ Failed: ${totalFailed}`);
console.log(`   📦 Total:  ${tests.length}`);

if (totalFailed === 0) {
  console.log('\n🎉 All tests passed!\n');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${totalFailed} test suite(s) failed\n`);
  process.exit(1);
}
