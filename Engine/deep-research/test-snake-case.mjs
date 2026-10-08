#!/usr/bin/env node

// Test with snake_case variants

import { normalizePlanResponse } from './schema.mjs';

console.log('Testing snake_case variants...\n');

const snakeCaseResponse = {
  "taskId": "wf_test/research-plan",
  "kind": "plan",
  "topic": "Renewable energy storage innovations 2024",
  "scope": "quick",
  "research_dimensions": [
    {
      "id": "D1",
      "name": "电化学储能创新",
      "priority": "high",
      "key_questions": [
        "2024年新增证据体现的是材料突破、电芯改进，还是系统集成创新？",
        "成本、效率、寿命或安全性改善是否有明确基准和测试条件？"
      ]
    },
    {
      "id": "D2",
      "name": "长时及非电化学储能",
      "priority": "high",
      "key_questions": [
        "哪些候选路线在2024年出现可验证的工程或性能进展？"
      ]
    }
  ]
};

try {
  console.log('Input:');
  console.log('  Field: research_dimensions');
  console.log('  Count:', snakeCaseResponse.research_dimensions.length);
  console.log('  First dimension has key_questions:', !!snakeCaseResponse.research_dimensions[0].key_questions);
  console.log();

  const normalized = normalizePlanResponse(snakeCaseResponse);

  console.log('✓ Normalization succeeded!');
  console.log();
  console.log('Normalized output:');
  console.log('  Dimensions count:', normalized.dimensions.length);
  console.log();

  normalized.dimensions.forEach((d, i) => {
    console.log(`${i + 1}. [${d.id}] ${d.query}`);
    if (d.rationale) {
      console.log(`   Rationale: ${d.rationale}`);
    }
  });
  console.log();
  console.log('Strategy:', normalized.strategy);

} catch (error) {
  console.log('✗ Normalization failed!');
  console.log('Error:', error.message);
}
