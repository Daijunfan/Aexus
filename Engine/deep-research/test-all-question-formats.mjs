import { normalizePlanResponse } from './schema.mjs';

const testCases = [
  {
    name: 'questions array with strings',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: ['Question 1', 'Question 2']
        }
      ]
    },
    expected: 'Question 1'
  },
  {
    name: 'questions array with objects (text field)',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: [
            { text: 'Question 1', priority: 'high' },
            { text: 'Question 2' }
          ]
        }
      ]
    },
    expected: 'Question 1'
  },
  {
    name: 'questions array with objects (question field)',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          questions: [
            { question: 'Question 1', importance: 'high' }
          ]
        }
      ]
    },
    expected: 'Question 1'
  },
  {
    name: 'keyQuestions array with strings',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          keyQuestions: ['Question 1', 'Question 2']
        }
      ]
    },
    expected: 'Question 1'
  },
  {
    name: 'keyQuestions array with objects',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          keyQuestions: [
            { text: 'Question 1' }
          ]
        }
      ]
    },
    expected: 'Question 1'
  },
  {
    name: 'key_questions array with strings (snake_case)',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          key_questions: ['Question 1']
        }
      ]
    },
    expected: 'Question 1'
  },
  {
    name: 'key_questions array with objects (snake_case)',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          key_questions: [
            { text: 'Question 1' }
          ]
        }
      ]
    },
    expected: 'Question 1'
  },
  {
    name: 'query string (direct)',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          query: 'Question 1'
        }
      ]
    },
    expected: 'Question 1'
  },
  {
    name: 'name as fallback',
    input: {
      taskId: 'test',
      dimensions: [
        {
          id: 'D1',
          name: 'Question 1'
        }
      ]
    },
    expected: 'Question 1'
  }
];

console.log('Testing all question format variants...\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  try {
    const result = normalizePlanResponse(testCase.input);
    const actualQuery = result.dimensions[0].query;

    if (actualQuery === testCase.expected) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   Query: "${actualQuery}"`);
      passed++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   Expected: "${testCase.expected}"`);
      console.log(`   Got: "${actualQuery}"`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${testCase.name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
  console.log('');
}

console.log('═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════');

if (failed === 0) {
  console.log('\n🎉 All tests passed!');
} else {
  console.log(`\n⚠️  ${failed} test(s) failed`);
  process.exit(1);
}
