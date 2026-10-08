#!/usr/bin/env node

// Test schema validation with nested researchPlan structure

import { normalizePlanResponse } from './schema.mjs';

console.log('════════════════════════════════════════════════════════════════');
console.log('  Testing Nested Structure Support');
console.log('════════════════════════════════════════════════════════════════\n');

// Test 1: Nested in researchPlan
console.log('Test 1: Dimensions nested in researchPlan');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-1",
    kind: "plan",
    status: "completed",
    researchPlan: {
      objective: "Study quantum computing advances",
      dimensions: [
        {
          id: "D1",
          name: "Hardware improvements",
          keyQuestions: [
            "What gate fidelity was achieved?",
            "How did coherence times improve?"
          ]
        },
        {
          id: "D2",
          name: "Error correction",
          keyQuestions: ["What logical qubits were demonstrated?"]
        }
      ]
    }
  });
  console.log('✓ PASS');
  console.log('Normalized dimensions:');
  result.dimensions.forEach((d, i) => {
    console.log(`  ${i + 1}. [${d.id}] ${d.query}`);
  });
  console.log(`Strategy: ${result.strategy}`);
  console.log();
} catch (error) {
  console.log('✗ FAIL:', error.message);
  console.log();
}

// Test 2: Nested with complex structure
console.log('Test 2: Complex nested structure with priorities and targets');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-2",
    researchPlan: {
      objective: "AI safety alignment techniques",
      boundaries: {
        startDate: "2024-01-01"
      },
      dimensions: [
        {
          id: "D1",
          name: "偏好学习与后训练",
          priority: "核心",
          targets: ["RLHF", "DPO", "KTO"],
          keyQuestions: [
            "不同方法需要何种反馈？",
            "偏好胜率提高是否伴随安全改善？"
          ],
          sourceIds: ["S1", "S2"]
        }
      ]
    }
  });
  console.log('✓ PASS');
  console.log('Normalized dimensions:');
  result.dimensions.forEach((d, i) => {
    console.log(`  ${i + 1}. [${d.id}] ${d.query}`);
    console.log(`     Rationale: ${d.rationale}`);
  });
  console.log();
} catch (error) {
  console.log('✗ FAIL:', error.message);
  console.log();
}

// Test 3: Top-level dimensions (should still work)
console.log('Test 3: Top-level dimensions (backwards compatibility)');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-3",
    dimensions: [
      { query: "Research question 1", rationale: "Important" },
      { query: "Research question 2" }
    ],
    strategy: "Direct approach"
  });
  console.log('✓ PASS');
  console.log('Dimensions:', result.dimensions.map(d => d.query));
  console.log();
} catch (error) {
  console.log('✗ FAIL:', error.message);
  console.log();
}

console.log('════════════════════════════════════════════════════════════════');
