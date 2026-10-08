import { parseAnswer } from './model.mjs';
import { validateAndNormalize } from './schema.mjs';

// Simulate the actual Agent response text from the transcript
const agentResponseText = `{
  "taskId": "test/research-plan-format-fix",
  "kind": "plan",
  "topic": "Quantum computing hardware advances 2024",
  "scope": "quick",
  "languages": ["zh-CN", "en"],
  "objective": "梳理2024年量子计算硬件的代表性进展",
  "boundaries": {
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
  },
  "dimensions": [
    {
      "id": "D1",
      "name": "超导处理器与系统性能",
      "priority": "high",
      "questions": [
        "2024年的改进主要来自比特数量、门质量、连接结构还是控制系统？",
        "更深电路的执行能力分别依赖哪些硬件改进和软件误差缓解？"
      ],
      "source_ids": ["S1", "S2"]
    },
    {
      "id": "D2",
      "name": "逻辑比特与纠错证据",
      "priority": "high",
      "questions": [
        "成果展示的是逻辑存储、逻辑门还是完整计算？",
        "是否包含重复纠错、实时解码和中途测量反馈？"
      ],
      "source_ids": ["S1", "S3", "S4"]
    }
  ]
}`;

console.log('=== Step 1: parseAnswer ===');
const parsed = parseAnswer(agentResponseText, 'test/research-plan-format-fix');
console.log('Parsed dimensions count:', parsed.dimensions.length);
console.log('First dimension structure:', JSON.stringify(parsed.dimensions[0], null, 2));

console.log('\n=== Step 2: validateAndNormalize ===');
const normalized = validateAndNormalize('plan', parsed);
console.log('Normalized dimensions count:', normalized.dimensions.length);
console.log('First normalized dimension:', JSON.stringify(normalized.dimensions[0], null, 2));
console.log('First query type:', typeof normalized.dimensions[0].query);
console.log('First query value:', normalized.dimensions[0].query);

console.log('\n=== Step 3: Simulate clone (JSON round-trip) ===');
const cloned = JSON.parse(JSON.stringify(normalized));
console.log('Cloned dimensions count:', cloned.dimensions.length);
console.log('First cloned dimension:', JSON.stringify(cloned.dimensions[0], null, 2));
console.log('First cloned query type:', typeof cloned.dimensions[0].query);
console.log('First cloned query value:', cloned.dimensions[0].query);

console.log('\n=== Step 4: Simulate state.dimensions assignment ===');
const state = {
  dimensions: normalized.dimensions
};
console.log('State dimensions count:', state.dimensions.length);
console.log('First state dimension query:', state.dimensions[0].query);

console.log('\n=== Step 5: Simulate checkpoint (clone state) ===');
const checkpointed = JSON.parse(JSON.stringify(state));
console.log('Checkpointed dimensions count:', checkpointed.dimensions.length);
console.log('First checkpointed dimension query:', checkpointed.dimensions[0].query);

console.log('\n✅ All steps completed successfully!');
