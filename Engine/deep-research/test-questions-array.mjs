import { normalizePlanResponse } from './schema.mjs';

// Test with actual format from Agent transcript
const actualResponse = {
  "taskId": "test-task",
  "kind": "plan",
  "topic": "Test topic",
  "scope": "quick",
  "languages": ["zh-CN", "en"],
  "objective": "Test objective",
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
        "更深电路的执行能力分别依赖哪些硬件改进和软件误差缓解？",
        "基准结果支持什么结论，是否足以证明实际计算优势？"
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
};

console.log('Testing with actual Agent response format...\n');

try {
  const result = normalizePlanResponse(actualResponse);
  console.log('✅ Normalization succeeded!');
  console.log('\nNormalized dimensions:');
  result.dimensions.forEach((dim, i) => {
    console.log(`\nDimension ${i}:`);
    console.log(`  ID: ${dim.id}`);
    console.log(`  Query type: ${typeof dim.query}`);
    console.log(`  Query value: "${dim.query}"`);
    console.log(`  Query length: ${dim.query.length}`);
    console.log(`  Rationale: "${dim.rationale}"`);
  });
} catch (error) {
  console.error('❌ Error:', error.message);
}
