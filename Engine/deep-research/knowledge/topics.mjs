/** Efficient, evidence-aware research topic and gap projections. */
import {array, object, text, key, idFor, strings, union} from './shared.mjs';
import {independentlyRead, independentlyVerified, projectFindings} from './evidence.mjs';

function topicsFromState(state) {
  const topics = new Map(), byNode = new Map(), dimensions = new Set();
  for (const dimension of array(state?.dimensions)) {
    const id = dimension?.id, title = text(dimension?.query);
    if (typeof id !== 'string' || !id || !title || topics.has(id)) continue;
    topics.set(id, {id, title, nodeIds: []});
    dimensions.add(id);
  }
  for (const node of array(state?.graph?.nodes)) {
    if (node?.kind !== 'search' || node.active === false || node.status === 'superseded' || !text(node.id)) continue;
    let id = dimensions.has(node.dimensionId) ? node.dimensionId : 'node:' + node.id;
    // A real dimension may itself be named "node:<id>"; keep identities distinct.
    if (!dimensions.has(node.dimensionId) && topics.has(id)) {
      id = 'search:' + node.id;
      while (topics.has(id)) id = 'search:' + id;
    }
    if (!topics.has(id)) topics.set(id, {
      id, title: text(node.objective) || text(node.label) || text(node.payload?.query),
      nodeIds: [],
    });
    if (!byNode.has(node.id)) {
      byNode.set(node.id, id);
      topics.get(id).nodeIds.push(node.id);
    }
  }
  return {topics: [...topics.values()], byNode, dimensions};
}

/** Index sources, nodes and explicit finding-topic references only once per snapshot. */
export function projectTopics(state, verifiedFindings = projectFindings(state?.sources, state?.findings)) {
  const {topics, byNode, dimensions} = topicsFromState(state ?? {});
  const sourceList = array(state?.sources).filter(source => typeof source?.id === 'string' && source.id);
  const bySource = new Map(sourceList.map(source => [source.id, source]));
  const sourceOrder = new Map(sourceList.map((source, index) => [source.id, index]));
  const byTopic = new Map(topics.map(topic => [topic.id, new Set()]));
  const record = (topicId, sourceId) => {
    if (byTopic.has(topicId) && bySource.has(sourceId)) byTopic.get(topicId).add(sourceId);
  };
  for (const source of sourceList) {
    for (const id of strings([source.dimensionId, ...array(source.dimensionIds)])) {
      if (dimensions.has(id)) record(id, source.id);
    }
  }
  for (const node of array(state?.graph?.nodes)) {
    if (!byNode.has(node?.id) || node?.kind !== 'search' || node.active === false || node.status === 'superseded') continue;
    for (const sourceId of strings(node.sourceIds)) record(byNode.get(node.id), sourceId);
  }
  const findingIdsByTopic = new Map();
  for (const finding of array(verifiedFindings)) {
    if (finding?.status !== 'linked' || array(finding.issues).length) continue;
    for (const id of strings(finding.topicIds)) {
      if (!byTopic.has(id)) continue;
      if (!findingIdsByTopic.has(id)) findingIdsByTopic.set(id, []);
      union(findingIdsByTopic.get(id), [finding.id]);
      // An explicit, grounded topic claim also establishes where its evidence
      // can be opened, even when the source discovery node used no dimension ID.
      for (const sourceId of strings(finding.sourceIds)) record(id, sourceId);
    }
  }
  const projected = topics.map(topic => {
    const candidateSourceIds = [...byTopic.get(topic.id)].sort((a, b) => sourceOrder.get(a) - sourceOrder.get(b));
    const readSourceIds = candidateSourceIds.filter(id => independentlyRead(bySource.get(id)));
    const verifiedSourceIds = readSourceIds.filter(id => independentlyVerified(bySource.get(id)));
    const findingIds = findingIdsByTopic.get(topic.id) || [];
    const status = findingIds.length ? 'linked-findings' :
      verifiedSourceIds.length ? 'verified-material' :
      readSourceIds.length ? 'read-pending-verification' :
      candidateSourceIds.length ? 'candidates-only' : 'unassessed';
    return {...topic, status, candidateSourceIds, readSourceIds, verifiedSourceIds, findingIds};
  });
  const gaps = projectGaps(state);
  const limitations = [...new Set(array(state?.report?.limitations).filter(item => typeof item === 'string' && text(item)).map(text))];
  return {topics: projected, gaps, limitations};
}

/** Read real search-task gaps; omit superseded and unfinished attempts. */
export function projectGaps(state) {
  const byText = new Map();
  const add = (statement, origin, nodeId = '') => {
    const value = text(statement), normalized = key(value);
    if (!normalized) return;
    if (!byText.has(normalized)) byText.set(normalized, {
      id: idFor('gap', normalized), text: value, origin, originNodeIds: [],
    });
    if (nodeId) union(byText.get(normalized).originNodeIds, [nodeId]);
  };
  for (const gap of array(state?.scouting?.gaps)) add(gap, 'scouting');
  for (const node of array(state?.graph?.nodes)) {
    if (node?.kind !== 'search' || node.active === false || node.status !== 'completed') continue;
    const key = node.taskKey || node.id;
    if (typeof key !== 'string' || !key) continue;
    const attempts = state?.taskAttempts?.[key];
    const taskKey = key + (Number.isInteger(attempts) && attempts > 0 ? '-retry-' + attempts : '');
    const recovered = state?.tasks?.[taskKey + '-format-fix'];
    const saved = recovered?.status === 'completed' ? recovered : state?.tasks?.[taskKey];
    const result = object(node.result) ? node.result : saved?.status === 'completed' ? saved.result : null;
    for (const gap of array(result?.gaps)) add(gap, 'search', node.id);
  }
  return [...byText.values()];
}

