/** Deep Research runtime - orchestrates multi-agent research workflow */
import { create, describe, respond, retry, ENGINE_ID, parseAnswer } from './model.mjs';
import { provision, ask, cancel } from './agents.mjs';
import { validateAndNormalize, buildFormatErrorMessage } from './schema.mjs';

export { create, describe, respond, retry, cancel };

/**
 * Main research workflow execution
 */
export async function run(state, originalContext) {
  // Create checkpoint chain for serialized state updates
  let chain = Promise.resolve();
  const ctx = {
    ...originalContext,
    checkpoint: value => {
      chain = chain.then(() => originalContext.checkpoint(clone(value)));
      return chain;
    }
  };

  ctx.signal.throwIfAborted();

  // Terminal state
  if (state.phase === 'complete') {
    return {
      status: 'completed',
      state,
      artifacts: state.artifacts || []
    };
  }

  // Waiting states
  if (state.phase === 'planning' && state.plan && !state.planApproved) {
    return { status: 'waiting', state };
  }

  if (state.phase === 'synthesis' && state.synthesis && !state.synthesisApproved) {
    return { status: 'waiting', state };
  }

  // Phase: Initialization
  if (state.phase === 'init') {
    await provision(state, ctx);
    state.phase = 'planning';
    await ctx.checkpoint(state);
  }

  // Phase: Planning
  if (state.phase === 'planning') {
    if (!state.plan) {
      const plan = await ask(
        state,
        ctx,
        'research-plan',
        'coordinator',
        'plan',
        {
          topic: state.input.topic,
          scope: state.input.scope,
          materials: state.input.materials,
          maxSources: state.input.maxSources,
          languages: state.input.languages
        },
        validatePlan
      );

      console.log('[DEBUG runtime] Plan returned from validatePlan:');
      console.log('[DEBUG runtime]   dimensions count:', plan.dimensions?.length);
      if (plan.dimensions && plan.dimensions.length > 0) {
        console.log('[DEBUG runtime]   First dimension:', JSON.stringify(plan.dimensions[0], null, 2));
      }

      state.plan = plan;
      state.dimensions = plan.dimensions || [];

      console.log('[DEBUG runtime] After assigning to state:');
      console.log('[DEBUG runtime]   state.dimensions count:', state.dimensions.length);
      if (state.dimensions.length > 0) {
        console.log('[DEBUG runtime]   First state.dimension:', JSON.stringify(state.dimensions[0], null, 2));
      }

      // Add to visualization timeline
      state.visualization.timeline.push({
        timestamp: Date.now(),
        type: 'plan',
        agent: 'coordinator',
        description: '研究计划已生成',
        data: { dimensionCount: state.dimensions.length }
      });

      await ctx.checkpoint(state);
    }

    // Auto-approve for non-interactive mode, otherwise wait
    if (state.input.autoApprove) {
      state.planApproved = true;
      state.phase = 'research';
      await ctx.checkpoint(state);
    } else {
      return { status: 'waiting', state };
    }
  }

  // Phase: Research (parallel multi-dimensional investigation)
  if (state.phase === 'research') {
    const researchTasks = [];

    // Launch parallel research for each dimension
    for (const dimension of state.dimensions) {
      if (dimension.status === 'completed') continue;

      const taskKey = 'research-' + dimension.id;

      researchTasks.push(
        ask(
          state,
          ctx,
          taskKey,
          'researcher',
          'search',
          {
            dimension: dimension.query,
            topic: state.input.topic,
            existingSources: state.sources.map(s => s.id),
            maxSources: Math.ceil(state.input.maxSources / state.dimensions.length),
            languages: state.input.languages
          },
          validateResearchResult
        ).then(result => {
          // Add discovered sources
          for (const source of result.sources) {
            if (!state.sources.find(s => s.id === source.id)) {
              state.sources.push({
                ...source,
                dimensionId: dimension.id,
                verified: false,
                credibilityScore: null,
                addedAt: Date.now()
              });
            }
          }

          // Update dimension status
          dimension.status = 'completed';
          dimension.sourcesFound = result.sources.length;

          // Timeline event
          state.visualization.timeline.push({
            timestamp: Date.now(),
            type: 'research',
            agent: 'researcher',
            description: `完成维度: ${dimension.query}`,
            data: { sourcesFound: result.sources.length }
          });

          return result;
        })
      );
    }

    // Wait for all research tasks
    await Promise.all(researchTasks);
    await ctx.checkpoint(state);

    // Move to verification phase
    state.phase = 'verification';
    await ctx.checkpoint(state);
  }

  // Phase: Verification (verify each source and extract claims)
  if (state.phase === 'verification') {
    const unverifiedSources = state.sources.filter(s => !s.verified);

    if (unverifiedSources.length > 0) {
      // Verify sources in batches
      const batchSize = 5;
      for (let i = 0; i < unverifiedSources.length; i += batchSize) {
        ctx.signal.throwIfAborted();

        const batch = unverifiedSources.slice(i, i + batchSize);
        const verificationTasks = batch.map(source =>
          ask(
            state,
            ctx,
            'verify-' + source.id,
            'verifier',
            'verify',
            {
              source,
              topic: state.input.topic,
              existingFindings: state.findings.map(f => f.claim)
            },
            validateVerificationResult
          ).then(result => {
            // Update source with verification result
            const sourceIndex = state.sources.findIndex(s => s.id === source.id);
            if (sourceIndex >= 0) {
              state.sources[sourceIndex] = {
                ...state.sources[sourceIndex],
                verified: true,
                credibilityScore: result.credibilityScore,
                verificationNotes: result.notes,
                extractedClaims: result.claims
              };

              // Add findings from this source
              for (const claim of result.claims) {
                state.findings.push({
                  id: 'finding-' + state.findings.length,
                  claim: claim.text,
                  sourceIds: [source.id],
                  confidence: claim.confidence,
                  evidenceChain: [source.id],
                  addedAt: Date.now()
                });
              }

              // Check for contradictions
              if (result.contradictions && result.contradictions.length > 0) {
                for (const contradiction of result.contradictions) {
                  state.contradictions.push({
                    id: 'contradiction-' + state.contradictions.length,
                    sources: contradiction.sourceIds,
                    description: contradiction.description,
                    severity: contradiction.severity,
                    detectedAt: Date.now()
                  });
                }
              }
            }

            // Timeline event
            state.visualization.timeline.push({
              timestamp: Date.now(),
              type: 'verification',
              agent: 'verifier',
              description: `验证来源: ${source.title.slice(0, 40)}`,
              data: {
                credibility: result.credibilityScore,
                claimsExtracted: result.claims.length
              }
            });

            return result;
          })
        );

        await Promise.all(verificationTasks);
        await ctx.checkpoint(state);
      }
    }

    // Build source network
    state.sourceNetwork = buildSourceNetwork(state.sources);

    // Move to synthesis phase
    state.phase = 'synthesis';
    await ctx.checkpoint(state);
  }

  // Phase: Synthesis (build knowledge graph and insights)
  if (state.phase === 'synthesis') {
    if (!state.synthesis) {
      const synthesis = await ask(
        state,
        ctx,
        'knowledge-synthesis',
        'synthesizer',
        'synthesize',
        {
          topic: state.input.topic,
          findings: state.findings,
          sources: state.sources.filter(s => s.verified),
          contradictions: state.contradictions
        },
        validateSynthesisResult
      );

      state.synthesis = synthesis;

      // Build knowledge graph
      state.knowledgeGraph = {
        entities: synthesis.entities || [],
        relationships: synthesis.relationships || []
      };

      // Update progress tree
      state.visualization.progressTree = buildProgressTree(state);

      // Timeline event
      state.visualization.timeline.push({
        timestamp: Date.now(),
        type: 'synthesis',
        agent: 'synthesizer',
        description: '知识整合完成',
        data: {
          entities: synthesis.entities.length,
          relationships: synthesis.relationships.length,
          insights: synthesis.insights.length
        }
      });

      await ctx.checkpoint(state);
    }

    // Auto-approve or wait
    if (state.input.autoApprove) {
      state.synthesisApproved = true;
      state.phase = 'writing';
      await ctx.checkpoint(state);
    } else {
      return { status: 'waiting', state };
    }
  }

  // Phase: Writing (generate structured report)
  if (state.phase === 'writing') {
    if (!state.report) {
      const report = await ask(
        state,
        ctx,
        'report-writing',
        'writer',
        'write',
        {
          topic: state.input.topic,
          synthesis: state.synthesis,
          findings: state.findings,
          sources: state.sources.filter(s => s.verified),
          knowledgeGraph: state.knowledgeGraph,
          contradictions: state.contradictions
        },
        validateReportResult
      );

      state.report = report;

      // Build evidence chains for visualization
      state.visualization.evidenceChain = buildEvidenceChains(state);

      // Timeline event
      state.visualization.timeline.push({
        timestamp: Date.now(),
        type: 'writing',
        agent: 'writer',
        description: '报告撰写完成',
        data: {
          sections: report.sections.length,
          citations: report.citations.length,
          wordCount: estimateWordCount(report)
        }
      });

      await ctx.checkpoint(state);
    }

    // Move to review phase
    state.phase = 'review';
    await ctx.checkpoint(state);
  }

  // Phase: Review (quality check)
  if (state.phase === 'review') {
    if (!state.review) {
      const review = await ask(
        state,
        ctx,
        'quality-review',
        'coordinator',
        'review',
        {
          report: state.report,
          sources: state.sources,
          findings: state.findings,
          contradictions: state.contradictions
        },
        validateReviewResult
      );

      state.review = review;

      // Timeline event
      state.visualization.timeline.push({
        timestamp: Date.now(),
        type: 'review',
        agent: 'coordinator',
        description: review.verdict === 'pass' ? '质量审查通过' : '需要修订',
        data: {
          verdict: review.verdict,
          issues: review.issues.length
        }
      });

      await ctx.checkpoint(state);

      if (review.verdict === 'revise' && review.issues.length > 0) {
        // Auto-fix minor issues or return for user review
        if (review.issues.every(i => i.severity === 'minor')) {
          // Attempt auto-fix
          state.phase = 'writing';
          state.report = null;
          await ctx.checkpoint(state);
          // Will loop back to writing phase
        } else {
          return { status: 'waiting', state };
        }
      }
    }

    // If passed review, complete
    if (state.review.verdict === 'pass') {
      state.phase = 'complete';
      state.finishedAt = Date.now();

      // Generate artifacts
      state.artifacts = await generateArtifacts(state, ctx);

      await ctx.checkpoint(state);
      return {
        status: 'completed',
        state,
        artifacts: state.artifacts
      };
    }
  }

  throw Error('未知研究阶段: ' + state.phase);
}

// Helper functions

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Validate plan response using schema normalization
 */
function validatePlan(result) {
  console.log('[DEBUG validatePlan] Input result keys:', Object.keys(result));
  console.log('[DEBUG validatePlan] Input dimensions type:', typeof result.dimensions);
  console.log('[DEBUG validatePlan] Input dimensions is array:', Array.isArray(result.dimensions));

  if (result.dimensions && result.dimensions.length > 0) {
    console.log('[DEBUG validatePlan] First dimension:', JSON.stringify(result.dimensions[0], null, 2));
  }

  try {
    const normalized = validateAndNormalize('plan', result);

    console.log('[DEBUG validatePlan] Normalized dimensions count:', normalized.dimensions.length);
    if (normalized.dimensions.length > 0) {
      console.log('[DEBUG validatePlan] First normalized dimension:', JSON.stringify(normalized.dimensions[0], null, 2));
      console.log('[DEBUG validatePlan] First query type:', typeof normalized.dimensions[0].query);
      console.log('[DEBUG validatePlan] First query value:', normalized.dimensions[0].query);
    }

    return normalized;
  } catch (error) {
    console.log('[DEBUG validatePlan] Validation error:', error.message);
    const detailedError = new Error(buildFormatErrorMessage('plan', result, error));
    detailedError.originalError = error;
    throw detailedError;
  }
}

function validateResearchResult(result) {
  try {
    if (!result || !Array.isArray(result.sources)) {
      throw new Error('研究结果必须包含 sources 数组');
    }

    return {
      sources: result.sources.map((s, i) => ({
        id: s.id || 'source-' + Date.now() + '-' + i,
        type: s.type || 'web',
        title: String(s.title || '未命名来源'),
        url: s.url || '',
        snippet: s.snippet || s.summary || s.abstract || '',
        author: s.author || '',
        publishedDate: s.publishedDate || s.date || '',
        addedBy: 'researcher',
        addedAt: Date.now()
      }))
    };
  } catch (error) {
    throw new Error(`搜索结果格式错误: ${error.message}`);
  }
}

function validateVerificationResult(result) {
  try {
    if (!result || typeof result.credibilityScore !== 'number') {
      throw new Error('验证结果必须包含 credibilityScore 数值');
    }

    return {
      credibilityScore: Math.max(0, Math.min(1, result.credibilityScore)),
      claims: (result.claims || []).map(c => ({
        text: String(c.text || c),
        confidence: typeof c.confidence === 'number' ? c.confidence : 0.5
      })),
      contradictions: result.contradictions || [],
      notes: result.notes || result.summary || ''
    };
  } catch (error) {
    throw new Error(`验证结果格式错误: ${error.message}`);
  }
}

function validateSynthesisResult(result) {
  try {
    if (!result || !Array.isArray(result.entities)) {
      throw new Error('综合结果必须包含 entities 数组');
    }

    return {
      entities: result.entities.map((e, i) => ({
        id: e.id || 'entity-' + i,
        name: String(e.name || '未命名实体'),
        type: e.type || 'concept',
        description: e.description || ''
      })),
      relationships: (result.relationships || []).map((r, i) => ({
        id: r.id || 'rel-' + i,
        from: String(r.from || r.source),
        to: String(r.to || r.target),
        type: r.type || r.relationship || 'related'
      })),
      insights: (result.insights || []).map(ins => String(ins))
    };
  } catch (error) {
    throw new Error(`综合结果格式错误: ${error.message}`);
  }
}
function validateReportResult(result) {
  try {
    if (!result || !result.report) {
      throw new Error('响应必须包含 report 对象');
    }

    const report = result.report;

    if (!Array.isArray(report.sections)) {
      throw new Error('report 必须包含 sections 数组');
    }

    return {
      title: String(report.title || '研究报告'),
      abstract: report.abstract || report.summary || '',
      sections: report.sections.map((s, i) => ({
        id: s.id || `section-${i}`,
        heading: String(s.heading || s.title || `章节 ${i + 1}`),
        content: String(s.content || ''),
        citations: s.citations || []
      })),
      citations: report.citations || [],
      conclusion: report.conclusion || ''
    };
  } catch (error) {
    throw new Error(`报告格式错误: ${error.message}`);
  }
}

function validateReviewResult(result) {
  try {
    if (!result || !result.verdict) {
      throw new Error('审查结果必须包含 verdict 字段');
    }

    const verdict = result.verdict.toLowerCase();
    if (!['pass', 'revise'].includes(verdict)) {
      throw new Error(`verdict 必须是 'pass' 或 'revise'，收到: ${result.verdict}`);
    }

    return {
      verdict,
      issues: (result.issues || []).map((issue, i) => ({
        id: issue.id || `issue-${i}`,
        severity: issue.severity || 'note',
        description: String(issue.description || ''),
        suggestion: issue.suggestion || issue.recommendation || ''
      })),
      summary: result.summary || '',
      approved: verdict === 'pass'
    };
  } catch (error) {
    throw new Error(`审查结果格式错误: ${error.message}`);
  }
}

function validateReviewResult(result) {
  if (!result || !result.verdict) {
    throw Error('审查结果必须包含判定');
  }

  return {
    verdict: result.verdict === 'pass' ? 'pass' : 'revise',
    issues: (result.issues || []).map(i => ({
      severity: i.severity || 'minor',
      description: String(i.description),
      suggestion: i.suggestion || ''
    })),
    summary: result.summary || ''
  };
}

function buildSourceNetwork(sources) {
  const nodes = sources.map(s => ({
    id: s.id,
    type: s.type,
    title: s.title,
    credibility: s.credibilityScore
  }));

  const edges = [];
  // Build citation links between sources
  for (const source of sources) {
    if (source.cites) {
      for (const citedId of source.cites) {
        edges.push({
          from: source.id,
          to: citedId,
          type: 'cites'
        });
      }
    }
  }

  return { nodes, edges };
}

function buildProgressTree(state) {
  return state.dimensions.map(dim => ({
    dimension: dim.query,
    status: dim.status,
    sourcesFound: dim.sourcesFound || 0,
    verified: state.sources.filter(s => s.dimensionId === dim.id && s.verified).length
  }));
}

function buildEvidenceChains(state) {
  const chains = [];

  for (const finding of state.findings) {
    const chain = {
      finding: finding.claim,
      sources: finding.sourceIds.map(id => {
        const source = state.sources.find(s => s.id === id);
        return {
          id,
          title: source?.title || 'Unknown',
          credibility: source?.credibilityScore || 0
        };
      })
    };
    chains.push(chain);
  }

  return chains;
}

function estimateWordCount(report) {
  let total = 0;
  for (const section of report.sections || []) {
    if (section.content) {
      total += section.content.split(/\s+/).length;
    }
  }
  return total;
}

async function generateArtifacts(state, ctx) {
  const artifacts = [];

  // Main HTML report
  const htmlReport = generateHTMLReport(state);
  artifacts.push({
    name: 'research-report.html',
    description: '完整研究报告（HTML 格式，包含交互式可视化）',
    mediaType: 'text/html',
    content: htmlReport
  });

  // Markdown report
  const mdReport = generateMarkdownReport(state);
  artifacts.push({
    name: 'research-report.md',
    description: '研究报告（Markdown 格式）',
    mediaType: 'text/markdown',
    content: mdReport
  });

  // Sources CSV
  const sourcesCSV = generateSourcesCSV(state);
  artifacts.push({
    name: 'sources.csv',
    description: '来源清单（CSV 格式）',
    mediaType: 'text/csv',
    content: sourcesCSV
  });

  return artifacts;
}

function generateHTMLReport(state) {
  // Simplified HTML generation - will be enhanced with full visualization
  const sections = (state.report?.sections || []).map(s =>
    `<section><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.content)}</p></section>`
  ).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(state.input.topic)} - Deep Research Report</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #1a1a1a; }
    h2 { color: #333; margin-top: 32px; }
    section { margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(state.input.topic)}</h1>
  <p><strong>研究范围:</strong> ${state.input.scope}</p>
  <p><strong>来源数量:</strong> ${state.sources.length} (${state.sources.filter(s => s.verified).length} 已验证)</p>
  <p><strong>发现数量:</strong> ${state.findings.length}</p>
  <hr>
  ${sections}
</body>
</html>`;
}

function generateMarkdownReport(state) {
  const sections = (state.report?.sections || []).map(s =>
    `## ${s.title}\n\n${s.content}\n`
  ).join('\n');

  return `# ${state.input.topic}

**研究范围:** ${state.input.scope}
**来源数量:** ${state.sources.length} (${state.sources.filter(s => s.verified).length} 已验证)
**发现数量:** ${state.findings.length}

---

${sections}

## 来源

${state.sources.filter(s => s.verified).map((s, i) =>
  `${i + 1}. ${s.title} - ${s.url || 'N/A'} (可信度: ${(s.credibilityScore * 100).toFixed(0)}%)`
).join('\n')}
`;
}

function generateSourcesCSV(state) {
  const header = 'ID,Type,Title,URL,Credibility,Verified,Added By\n';
  const rows = state.sources.map(s =>
    `${s.id},${s.type},"${s.title.replace(/"/g, '""')}",${s.url || ''},${s.credibilityScore || 'N/A'},${s.verified},${s.addedBy}`
  ).join('\n');
  return header + rows;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
