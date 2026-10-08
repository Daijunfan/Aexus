#!/usr/bin/env node

import { createNodeClient } from '../../Contract/node-client.mjs';

const workflowId = process.argv[2] || 'wf_645a12c1-878c-4360-8b8a-c645f395a1f4';

const client = createNodeClient();

try {
  const result = await client.invoke('workflow.get', { id: workflowId });

  console.log('Workflow Status:', result.status);
  console.log('Phase:', result.summary?.phase);
  console.log('\nDimensions in summary:');

  if (result.summary?.dimensions) {
    console.log('Type:', typeof result.summary.dimensions);
    console.log('Is Array:', Array.isArray(result.summary.dimensions));
    console.log('Length:', result.summary.dimensions.length);
    console.log('\nFirst dimension:');
    console.log(JSON.stringify(result.summary.dimensions[0], null, 2));

    console.log('\nAll dimensions:');
    result.summary.dimensions.forEach((dim, i) => {
      console.log(`\n${i + 1}. ID: ${dim.id}`);
      console.log(`   Query type: ${typeof dim.query}`);
      console.log(`   Query value: ${JSON.stringify(dim.query)}`);
      console.log(`   Status: ${dim.status}`);
    });
  } else {
    console.log('No dimensions found');
  }

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
