#!/usr/bin/env node

// Test with actual Agent response format

import { normalizePlanResponse } from './schema.mjs';

console.log('Testing actual Agent response format...\n');

const actualResponse = {
  "taskId": "wf_test/research-plan",
  "kind": "plan",
  "topic": "Neural network optimization breakthroughs 2024",
  "scope": "quick",
  "languages": ["zh-CN", "en"],
  "maxSources": 50,
  "objective": "调查2024年神经网络优化的代表性进展",
  "researchDimensions": [
    {
      "id": "D1",
      "name": "优化器与预条件方法",
      "priority": "high",
      "keyQuestions": [
        "相较AdamW、SGD及已有预条件方法，新增贡献是什么？",
        "更少训练步数是否转化为更短的端到端训练时间？"
      ],
      "seedSourceIds": ["S1"]
    },
    {
      "id": "D2",
      "name": "学习率策略与调参效率",
      "priority": "high",
      "keyQuestions": [
        "无需预先指定训练终止步数的方法，能否达到充分调优的调度基线？"
      ],
      "seedSourceIds": ["S2"]
    }
  ],
  "verifiedSeedSources": [
    {
      "id": "S1",
      "title": "SOAP: Improving and Stabilizing Shampoo using Adam",
      "identifier": "arXiv:2409.11321"
    }
  ]
};

try {
  console.log('Input response:');
  console.log('  Has researchDimensions:', !!actualResponse.researchDimensions);
  console.log('  Dimensions count:', actualResponse.researchDimensions.length);
  console.log('  First dimension has keyQuestions:', !!actualResponse.researchDimensions[0].keyQuestions);
  console.log();

  const normalized = normalizePlanResponse(actualResponse);

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
  console.log();
  console.log('Stack:', error.stack);
}
