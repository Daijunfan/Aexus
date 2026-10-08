import { normalizePlanResponse } from './schema.mjs';

const edgeCases = [
  {
    name: 'Empty questions array',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: [],
          name: 'Fallback Name'
        }
      ]
    },
    shouldError: false,
    expectedQuery: 'Fallback Name'
  },
  {
    name: 'Questions with null element',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: [null, 'Valid Question']
        }
      ]
    },
    shouldError: false,
    expectedQuery: 'null'  // String(null) = 'null'
  },
  {
    name: 'Questions with undefined element',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: [undefined, 'Valid Question']
        }
      ]
    },
    shouldError: false,
    expectedQuery: 'undefined'  // String(undefined) = 'undefined'
  },
  {
    name: 'Questions with empty string',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: ['', 'Valid Question']
        }
      ]
    },
    shouldError: true,  // Empty string should fail validation
    expectedError: '必须是非空字符串'
  },
  {
    name: 'Questions with object without recognized fields',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: [
            { foo: 'bar', baz: 'qux' }
          ]
        }
      ]
    },
    shouldError: false,
    expectedQuery: '[object Object]'  // Falls back to String()
  },
  {
    name: 'Questions with nested object in text field',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: [
            { text: { nested: 'value' } }
          ]
        }
      ]
    },
    shouldError: false,
    expectedQuery: '[object Object]'  // text field contains object
  },
  {
    name: 'Questions with number',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: [42]
        }
      ]
    },
    shouldError: true,  // "42" is only 2 chars, too short
    expectedError: 'query 太短'
  },
  {
    name: 'No query source at all',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          priority: 'high'
        }
      ]
    },
    shouldError: true,
    expectedError: '缺少有效的查询字符串'
  },
  {
    name: 'Very short query (2 chars)',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          query: 'AB'
        }
      ]
    },
    shouldError: true,
    expectedError: 'query 太短'
  },
  {
    name: 'Query exactly 3 chars (minimum)',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          query: 'ABC'
        }
      ]
    },
    shouldError: false,
    expectedQuery: 'ABC'
  }
];

console.log('Testing edge cases...\n');

let passed = 0;
let failed = 0;

for (const testCase of edgeCases) {
  try {
    const result = normalizePlanResponse(testCase.input);

    if (testCase.shouldError) {
      console.log(`❌ ${testCase.name}`);
      console.log(`   Expected error but got success`);
      console.log(`   Result query: "${result.dimensions[0].query}"`);
      failed++;
    } else {
      const actualQuery = result.dimensions[0].query;
      if (actualQuery === testCase.expectedQuery) {
        console.log(`✅ ${testCase.name}`);
        console.log(`   Query: "${actualQuery}"`);
        passed++;
      } else {
        console.log(`❌ ${testCase.name}`);
        console.log(`   Expected: "${testCase.expectedQuery}"`);
        console.log(`   Got: "${actualQuery}"`);
        failed++;
      }
    }
  } catch (error) {
    if (testCase.shouldError) {
      if (error.message.includes(testCase.expectedError)) {
        console.log(`✅ ${testCase.name}`);
        console.log(`   Correctly threw error: ${error.message.substring(0, 60)}...`);
        passed++;
      } else {
        console.log(`❌ ${testCase.name}`);
        console.log(`   Expected error containing: "${testCase.expectedError}"`);
        console.log(`   Got: ${error.message}`);
        failed++;
      }
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   Unexpected error: ${error.message}`);
      failed++;
    }
  }
  console.log('');
}

console.log('═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════');

if (failed > 0) {
  console.log(`\n⚠️  ${failed} edge case(s) need attention`);
  process.exit(1);
}
