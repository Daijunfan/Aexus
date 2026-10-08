#!/usr/bin/env node

// Test validatePlan function with real agent response

const testData = {
  "taskId": "test",
  "kind": "plan",
  "dimensions": [
    {
      "id": "alignment",
      "name": "训练阶段的对齐与安全规范学习",
      "priority": "high",
      "questions": [
        "2024年的方法如何利用人工反馈、AI反馈或明确的安全规范？",
        "安全收益是否同时考虑有害请求漏拒和正常请求误拒？",
        "收益能否迁移到未见任务、不同语言和分布外输入？"
      ],
      "seedSourceIds": ["S1"]
    },
    {
      "id": "instruction_security",
      "name": "指令层级、提示注入与越狱防护",
      "priority": "high",
      "questions": [
        "如何区分可信指令与用户、检索材料及工具输出中的不可信内容？",
        "哪些防护依赖模型训练，哪些依赖应用侧隔离与权限控制？",
        "评估是否覆盖未见攻击，以及对正常任务能力的影响？"
      ],
      "seedSourceIds": ["S2"]
    }
  ]
};

function validatePlan(result) {
  // Support both 'dimensions' and 'researchDimensions' field names
  const dimensionsArray = result.dimensions || result.researchDimensions;

  if (!dimensionsArray || !Array.isArray(dimensionsArray)) {
    throw Error('研究计划必须包含调查维度（dimensions 或 researchDimensions 数组）');
  }

  return {
    dimensions: dimensionsArray.map((d, i) => {
      // Handle both simple string queries and complex objects
      let query;
      let rationale = '';

      if (typeof d === 'string') {
        // Simple string format
        query = d;
      } else if (d.query) {
        // Standard format with explicit query field
        query = String(d.query);
        rationale = d.rationale || '';
      } else if (d.questions && Array.isArray(d.questions) && d.questions.length > 0) {
        // Complex format with questions array - use first question as query
        query = String(d.questions[0]);
        rationale = d.name || d.rationale || '';
      } else if (d.name) {
        // Fallback to name field if query is missing
        query = String(d.name);
        rationale = d.rationale || '';
      } else {
        // Last resort: stringify the whole object
        query = String(d);
      }

      // Additional rationale sources
      if (!rationale && d.keyQuestions && Array.isArray(d.keyQuestions)) {
        rationale = d.keyQuestions[0] || '';
      }
      if (!rationale && d.approach) {
        rationale = d.approach;
      }

      return {
        id: d.id || 'dim-' + i,
        query,
        rationale,
        status: 'pending'
      };
    }),
    strategy: result.strategy || result.objective || '',
    estimatedTime: result.estimatedTime || 0
  };
}

console.log('Testing validatePlan with real agent response...\n');
const result = validatePlan(testData);
console.log('Result:');
console.log(JSON.stringify(result, null, 2));
console.log('\nDimensions:');
result.dimensions.forEach((d, i) => {
  console.log(`\n${i + 1}. ID: ${d.id}`);
  console.log(`   Query: ${d.query}`);
  console.log(`   Rationale: ${d.rationale}`);
  console.log(`   Query type: ${typeof d.query}`);
});
