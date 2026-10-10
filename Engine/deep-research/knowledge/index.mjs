/** Public read-only knowledge projections. Keep the public entry point stable. */
import {array, object, text, key, idFor, strings, union} from './shared.mjs';
import {independentlyRead, independentlyVerified, projectFindings, projectDisputes, projectReportLinks} from './evidence.mjs';
import {mergeSynthesis} from './relations.mjs';
import {projectTopics, projectGaps} from './topics.mjs';
import {compareResearch} from './history.mjs';
import {assessMatrixProposal, acceptMatrixProposal} from './matrix-proposals.mjs';

export {
  independentlyRead, independentlyVerified, projectFindings, projectDisputes,
  projectReportLinks, mergeSynthesis, projectTopics, projectGaps, compareResearch,
  assessMatrixProposal, acceptMatrixProposal,
};

/** One lightweight adapter for Workflow/Graph/Workspace/Deliverables owners. */
export function projectKnowledge(state) {
  const findings = projectFindings(state?.sources, state?.findings);
  const { topics, gaps, limitations } = projectTopics(state, findings);
  const analyses = array(state?.graph?.nodes)
    .filter(node => node?.kind === 'synthesize' && node.active !== false &&
      (!node.status || node.status === 'completed') && object(node.result))
    .map(node => ({ nodeId: node.id, result: node.result }));
  const graph = mergeSynthesis(analyses, findings);
  const disputes = projectDisputes(state?.sources, state?.contradictions);
  const sectionLinks = projectReportLinks(state?.report, findings, state?.sources);
  const knownTopics = new Set(topics.map(topic => topic.id));
  const attributedFindingIds = [], unattributedFindingIds = [], invalidTopicRefs = [];
  const partiallyLinkedFindingIds = [];
  for (const finding of findings) {
    if (finding.status !== 'linked') continue;
    if (finding.issues.length) {
      partiallyLinkedFindingIds.push(finding.id);
      continue;
    }
    const linkedTopicIds = finding.topicIds.filter(id => knownTopics.has(id));
    if (linkedTopicIds.length) attributedFindingIds.push(finding.id);
    else unattributedFindingIds.push(finding.id);
    for (const topicId of finding.topicIds) if (!knownTopics.has(topicId)) {
      invalidTopicRefs.push({ findingId: finding.id, topicId });
    }
  }
  const diagnostics = {
    attributedFindingIds, unattributedFindingIds, invalidTopicRefs, partiallyLinkedFindingIds,
    ambiguousEvidenceFindingIds: findings.filter(finding =>
      finding.issues.some(issue => issue.kind === 'ambiguous-proof')).map(finding => finding.id),
    unlinkedRelationIds: graph.relationships.filter(edge =>
      edge.evidenceStatus === 'unlinked').map(edge => edge.id),
  };
  return { version: 1, topics, gaps, limitations, findings, disputes, sectionLinks, diagnostics, ...graph };
}

/** Use the existing public WorkflowView.summary without copying private checkpoints. */
export function projectPublicKnowledge(summary) {
  const projection = projectKnowledge({
    sources: summary?.sources, findings: summary?.findingsDetails,
    contradictions: summary?.contradictions, dimensions: summary?.dimensions,
    graph: summary?.graph, report: summary?.deliverable,
  });
  if (!Array.isArray(summary?.researchGaps)) return projection;
  const completedSearchIds = new Set(array(summary?.graph?.nodes)
    .filter(node => node?.kind === 'search' && node.active !== false && node.status === 'completed' && typeof node.id === 'string')
    .map(node => node.id));
  const unique = new Map();
  for (const item of summary.researchGaps) {
    const value = text(typeof item === 'string' ? item : item?.text);
    if (!value) continue;
    const canonical = key(value);
    const nodeIds = strings(item?.originNodeIds).filter(id => completedSearchIds.has(id));
    const origin = item?.origin === 'scouting' ? 'scouting' :
      item?.origin === 'search' && nodeIds.length ? 'search' : 'reported';
    if (!unique.has(canonical)) unique.set(canonical, {
      id: idFor('gap', canonical), text: value, origin, originNodeIds: [],
    });
    const current = unique.get(canonical);
    union(current.originNodeIds, nodeIds);
    if (current.origin === 'reported' && origin !== 'reported') current.origin = origin;
  }
  return {...projection, gaps: [...unique.values()]};
}
