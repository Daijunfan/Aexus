#!/usr/bin/env node

// Test schema validation with various agent response formats

import { normalizePlanResponse, buildFormatErrorMessage } from './schema.mjs';

console.log('════════════════════════════════════════════════════════════════');
console.log('  Deep Research Schema Validation Tests');
console.log('════════════════════════════════════════════════════════════════\n');

// Test 1: Simple correct format
console.log('Test 1: Simple correct format');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-1",
    dimensions: [
      { query: "Quantum computing advances", rationale: "Key research area" },
      { query: "AI safety techniques", rationale: "Important for alignment" }
    ],
    strategy: "Focus on 2024 breakthroughs",
    estimatedTime: 20
  });
  console.log('✓ PASS');
  console.log('Normalized dimensions:', result.dimensions.map(d => d.query));
  console.log();
} catch (error) {
  console.log('✗ FAIL:', error.message);
  console.log();
}

// Test 2: Complex format with questions array (real agent response)
console.log('Test 2: Complex format with questions array');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-2",
    researchDimensions: [
      {
        id: "D1",
        name: "Physical hardware performance",
        priority: "high",
        questions: [
          "What improvements were made to gate fidelity in 2024?",
          "How did coherence times improve?",
          "What about circuit depth?"
        ],
        platforms: ["superconducting", "ion trap", "neutral atom"]
      },
      {
        id: "D2",
        name: "Error correction",
        questions: [
          "What logical qubit demonstrations were achieved?",
          "What are the error rates?"
        ]
      }
    ],
    objective: "Identify 2024 quantum computing breakthroughs",
    verifiedSeedSources: [
      { id: "S1", title: "Nature paper on quantum error correction" }
    ]
  });
  console.log('✓ PASS');
  console.log('Normalized dimensions:');
  result.dimensions.forEach((d, i) => {
    console.log(`  ${i + 1}. [${d.id}] ${d.query}`);
    console.log(`     Rationale: ${d.rationale || '(none)'}`);
  });
  console.log();
} catch (error) {
  console.log('✗ FAIL:', error.message);
  console.log();
}

// Test 3: Simple string array format
console.log('Test 3: Simple string array format');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-3",
    dimensions: [
      "Machine learning for drug discovery",
      "Protein folding predictions",
      "Clinical trial optimization"
    ],
    strategy: "Medical AI applications"
  });
  console.log('✓ PASS');
  console.log('Normalized dimensions:', result.dimensions.map(d => d.query));
  console.log();
} catch (error) {
  console.log('✗ FAIL:', error.message);
  console.log();
}

// Test 4: Missing dimensions field
console.log('Test 4: Missing dimensions field (should fail)');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-4",
    strategy: "Some strategy",
    verifiedSeeds: ["S1", "S2"]
  });
  console.log('✗ FAIL: Should have thrown error');
  console.log();
} catch (error) {
  console.log('✓ PASS (correctly rejected)');
  console.log('Error message preview:');
  const lines = error.message.split('\n');
  console.log('  ' + lines.slice(0, 3).join('\n  '));
  console.log();
}

// Test 5: Empty query string (should fail)
console.log('Test 5: Empty query string (should fail)');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-5",
    dimensions: [
      { query: "Valid query" },
      { query: "" }
    ]
  });
  console.log('✗ FAIL: Should have thrown error');
  console.log();
} catch (error) {
  console.log('✓ PASS (correctly rejected)');
  console.log('Error:', error.message);
  console.log();
}

// Test 6: Complex nested structure without clear query
console.log('Test 6: Dimension with no extractable query (should fail)');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-6",
    dimensions: [
      { id: "D1", priority: "high", platforms: ["A", "B"] }
    ]
  });
  console.log('✗ FAIL: Should have thrown error');
  console.log();
} catch (error) {
  console.log('✓ PASS (correctly rejected)');
  console.log('Error:', error.message);
  console.log();
}

// Test 7: Alternative field names
console.log('Test 7: Alternative field names (topic, reason, etc.)');
console.log('─────────────────────────────────────────────────────────────────');
try {
  const result = normalizePlanResponse({
    taskId: "test-7",
    dimensions: [
      { topic: "Climate modeling", reason: "Critical for policy" },
      { name: "Renewable energy storage", importance: "Grid stability" }
    ],
    approach: "Focus on practical applications"
  });
  console.log('✓ PASS');
  console.log('Normalized dimensions:');
  result.dimensions.forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.query}`);
    console.log(`     Rationale: ${d.rationale || '(none)'}`);
  });
  console.log();
} catch (error) {
  console.log('✗ FAIL:', error.message);
  console.log();
}

// Test 8: Build detailed error message
console.log('Test 8: Detailed error message formatting');
console.log('─────────────────────────────────────────────────────────────────');
const badResponse = {
  taskId: "test-8",
  researchDimensions: [
    { id: "D1", questions: ["Q1"], platforms: ["P1"] }
  ],
  verifiedSeeds: ["S1"]
};
const errorMsg = buildFormatErrorMessage('plan', badResponse, new Error('Test error'));
console.log(errorMsg);

console.log('════════════════════════════════════════════════════════════════');
console.log('  All tests completed');
console.log('════════════════════════════════════════════════════════════════');

