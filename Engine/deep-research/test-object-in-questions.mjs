import { normalizePlanResponse } from './schema.mjs';

// Test what happens when dimensions is an array of objects (not simple objects)
const problematicResponse = {
  "taskId": "test-task",
  "dimensions": [
    { questions: ["Question 1"] },  // Object with questions array
    { questions: ["Question 2"] },
    { questions: ["Question 3"] }
  ]
};

console.log('Testing dimensions as array of objects with questions...\n');

try {
  const normalized = normalizePlanResponse(problematicResponse);
  console.log('✅ Normalization succeeded!');
  console.log('\nNormalized dimensions:');
  normalized.dimensions.forEach((dim, i) => {
    console.log(`\nDimension ${i}:`);
    console.log(`  ID: ${dim.id}`);
    console.log(`  Query type: ${typeof dim.query}`);
    console.log(`  Query value: "${dim.query}"`);
  });
} catch (error) {
  console.error('❌ Error:', error.message);
}

// Now test what happens if questions[0] is somehow an object
console.log('\n\n=== Testing if questions[0] is an object ===\n');

const objectInArray = {
  "taskId": "test-task",
  "dimensions": [
    {
      "id": "D1",
      "questions": [
        { text: "Question 1", priority: "high" }  // Object instead of string!
      ]
    }
  ]
};

try {
  const normalized = normalizePlanResponse(objectInArray);
  console.log('✅ Normalization succeeded!');
  console.log('First dimension query:', normalized.dimensions[0].query);
  console.log('Query type:', typeof normalized.dimensions[0].query);
  console.log('Query value:', JSON.stringify(normalized.dimensions[0].query));

  // Simulate String() conversion
  console.log('\nString() result:', String(normalized.dimensions[0].query));
} catch (error) {
  console.error('❌ Error:', error.message);
}
