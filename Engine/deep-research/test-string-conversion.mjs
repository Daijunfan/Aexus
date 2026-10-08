#!/usr/bin/env node

// Debug what happens when we convert objects to strings

console.log('Testing String() conversion on various types:\n');

const testCases = [
  { name: 'Simple string', value: 'Hello world' },
  { name: 'Array with string', value: ['Question 1', 'Question 2'] },
  { name: 'Array first element', value: ['Question 1', 'Question 2'][0] },
  { name: 'Object', value: { text: 'Question' } },
  { name: 'Nested object in array', value: [{ text: 'Question' }] },
  { name: 'First element of object array', value: [{ text: 'Question' }][0] }
];

for (const test of testCases) {
  console.log(`${test.name}:`);
  console.log(`  Input type: ${typeof test.value}`);
  console.log(`  Is array: ${Array.isArray(test.value)}`);
  console.log(`  String() result: "${String(test.value)}"`);
  console.log();
}

console.log('Conclusion:');
console.log('If key_questions contains objects instead of strings,');
console.log('String(dim.key_questions[0]) will produce "[object Object]"');
