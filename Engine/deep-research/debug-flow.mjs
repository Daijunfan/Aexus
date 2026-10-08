#!/usr/bin/env node

// Debug: trace the exact flow from agent response to stored dimensions

import { normalizePlanResponse } from './schema.mjs';

// Simulate the exact response from the agent
const agentResponse = {
  "taskId": "wf_test/research-plan-format-fix",
  "topic": "Advances in renewable energy storage 2024",
  "scope": "quick",
  "dimensions": [
    {
      "id": "D1",
      "name": "电池技术与系统性能",
      "priority": "high",
      "questions": [
        "磷酸铁锂、钠离子和液流电池在2024年有哪些可核实的储能应用进展？",
        "各项进展属于实验室研究、示范、首次投运还是规模化商业运行？"
      ],
      "seedSourceIds": ["S1", "S5"]
    },
    {
      "id": "D2",
      "name": "长时储能与替代技术",
      "priority": "high",
      "questions": [
        "液流、压缩空气、抽水蓄能、热储能和氢储能中，哪些路线在2024年出现实质进展？",
        "各路线适用于何种放电时长、使用频率和地理条件？"
      ],
      "seedSourceIds": ["S2", "S4"]
    }
  ],
  "objective": "识别2024年可再生能源储能进展"
};

console.log('═══════════════════════════════════════════════════════════');
console.log('  Debugging Dimension Extraction Flow');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('Step 1: Original Agent Response');
console.log('─────────────────────────────────────────────────────────────');
console.log('First dimension:');
console.log(JSON.stringify(agentResponse.dimensions[0], null, 2));
console.log();

console.log('Step 2: Extract questions array');
console.log('─────────────────────────────────────────────────────────────');
const dim = agentResponse.dimensions[0];
console.log('dim.questions:', dim.questions);
console.log('Type:', typeof dim.questions);
console.log('Is Array:', Array.isArray(dim.questions));
console.log('Length:', dim.questions.length);
console.log();

console.log('Step 3: Extract first question');
console.log('─────────────────────────────────────────────────────────────');
const firstQuestion = dim.questions[0];
console.log('firstQuestion:', firstQuestion);
console.log('Type:', typeof firstQuestion);
console.log('String(firstQuestion):', String(firstQuestion));
console.log();

console.log('Step 4: Run normalizePlanResponse');
console.log('─────────────────────────────────────────────────────────────');
try {
  const normalized = normalizePlanResponse(agentResponse);
  console.log('✓ Success!');
  console.log();
  console.log('Normalized dimensions:');
  normalized.dimensions.forEach((d, i) => {
    console.log(`\n${i + 1}. ID: ${d.id}`);
    console.log(`   Query: ${d.query}`);
    console.log(`   Query type: ${typeof d.query}`);
    console.log(`   Rationale: ${d.rationale}`);
  });
  console.log();

  console.log('Step 5: Simulate JSON.stringify (checkpoint serialization)');
  console.log('─────────────────────────────────────────────────────────────');
  const serialized = JSON.stringify(normalized, null, 2);
  console.log(serialized);
  console.log();

  console.log('Step 6: Simulate JSON.parse (checkpoint deserialization)');
  console.log('─────────────────────────────────────────────────────────────');
  const deserialized = JSON.parse(serialized);
  console.log('First dimension after round-trip:');
  console.log(JSON.stringify(deserialized.dimensions[0], null, 2));
  console.log();
  console.log('Query value:', deserialized.dimensions[0].query);
  console.log('Query type:', typeof deserialized.dimensions[0].query);

} catch (error) {
  console.log('✗ Error:', error.message);
  console.log(error.stack);
}

console.log('\n═══════════════════════════════════════════════════════════');
