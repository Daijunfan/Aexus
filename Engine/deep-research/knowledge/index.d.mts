/** Stable read-only knowledge contracts; no duplicate persistent store. */
export type KnowledgeProof = {
  excerpt: string;
  locator?: string;
  sha256: string;
  finalUrl: string;
  accessedAt: number;
};
export type KnowledgeSource = {
  id: string;
  verified?: boolean;
  dimensionId?: string | null;
  dimensionIds?: string[];
  acquisition?: {
    status?: string;
    method?: string;
    excerpts?: KnowledgeProof[];
  };
};
export type KnowledgeEvidence = { sourceId: string; excerpt: string; locator?: string; sha256?: string; finalUrl?: string; accessedAt?: number };
export type KnowledgeFinding = {
  id: string;
  claim: string;
  sourceIds?: string[];
  evidence?: KnowledgeEvidence[];
  topicIds?: string[];
  dimensionIds?: string[];
};
export type KnowledgeEvidenceIssue = {
  sourceId: string;
  kind: 'undeclared-source' | 'source-not-verified' | 'missing-excerpt' | 'proof-not-found' | 'ambiguous-proof';
};
export type LinkedFinding = {
  id: string;
  claim: string;
  sourceIds: string[];
  evidence: KnowledgeEvidence[];
  issues: KnowledgeEvidenceIssue[];
  status: 'linked' | 'unlinked';
  topicIds: string[];
};
export type SynthesisEntity = {
  id: string;
  name: string;
  type: string;
  description?: string;
  findingIds?: string[];
};
export type SynthesisRelationship = {
  from: string;
  to: string;
  type: string;
  findingIds?: string[];
};
export type SynthesisResult = {
  entities?: SynthesisEntity[];
  relationships?: SynthesisRelationship[];
  insights?: string[];
};
export type KnowledgeNode = {
  id: string;
  kind: string;
  active?: boolean;
  status?: string;
  label?: string;
  objective?: string;
  payload?: { query?: string };
  dimensionId?: string | null;
  sourceIds?: string[];
  result?: SynthesisResult & { gaps?: string[] };
  taskKey?: string;
};
export type KnowledgeState = {
  sources?: KnowledgeSource[];
  findings?: KnowledgeFinding[];
  contradictions?: { id: string; description: string; sources?: string[]; sourceIds?: string[] }[];
  dimensions?: { id: string; query: string }[];
  graph?: { nodes?: KnowledgeNode[] };
  scouting?: { gaps?: string[] };
  tasks?: Record<string, {status?: string; result?: {gaps?: string[]}}>;
  taskAttempts?: Record<string, number>;
  report?: KnowledgeReport | null;
};
export type DomainEntity = {
  id: string;
  name: string;
  type: string;
  description: string;
  originNodeIds: string[];
  findingIds: string[];
  evidenceStatus: 'linked' | 'unlinked';
};
export type DomainRelationship = {
  id: string;
  from: string;
  to: string;
  type: string;
  originNodeIds: string[];
  findingIds: string[];
  evidenceStatus: 'linked' | 'unlinked';
};
export type DomainIssue = {
  kind: 'invalid-entity' | 'invalid-relationship' | 'unverified-finding';
  nodeId: string;
  ref: string;
};
export type KnowledgeGraph = {
  entities: DomainEntity[];
  relationships: DomainRelationship[];
  issues: DomainIssue[];
};
export type KnowledgeTopic = {
  id: string;
  title: string;
  nodeIds: string[];
  status: 'linked-findings' | 'verified-material' | 'read-pending-verification' | 'candidates-only' | 'unassessed';
  candidateSourceIds: string[];
  readSourceIds: string[];
  verifiedSourceIds: string[];
  findingIds: string[];
};
export type KnowledgeTopics = {
  topics: KnowledgeTopic[];
  gaps: { id: string; text: string; origin: 'scouting' | 'search' | 'reported'; originNodeIds: string[] }[];
  limitations: string[];
};
export type KnowledgeReport = {
  limitations?: string[];
  sections?: { id?: string; heading: string; evidence?: (KnowledgeEvidence & {claim: string})[] }[];
};
export type KnowledgeDispute = {
  id: string;
  description: string;
  sourceIds: string[];
  availableSourceIds: string[];
  status: 'sources-ready' | 'needs-sources';
};
export type KnowledgeSectionLink = {
  id: string;
  heading: string;
  findingIds: string[];
  sourceIds: string[];
};
export type ResearchDifference = {
  id?: string;
  kind: 'new' | 'wording-changed' | 'evidence-changed' | 'provenance-unresolved' | 'not-observed';
  text: string;
  previous?: string;
  previousSourceIds?: string[];
  sourceIds?: string[];
  evidenceChanged?: boolean;
  provenanceUnresolved?: boolean;
};
export type KnowledgePublicSummary = Pick<KnowledgeState, 'sources' | 'dimensions' | 'graph' | 'contradictions'> & {
  findingsDetails?: KnowledgeFinding[];
  deliverable?: KnowledgeReport | null;
  researchGaps?: (string | { text: string; origin?: 'scouting' | 'search'; originNodeIds?: string[] })[];
};
export type KnowledgeDiagnostics = {
  attributedFindingIds: string[];
  unattributedFindingIds: string[];
  partiallyLinkedFindingIds: string[];
  invalidTopicRefs: {findingId: string; topicId: string}[];
  ambiguousEvidenceFindingIds: string[];
  unlinkedRelationIds: string[];
};
export type KnowledgeProjection = KnowledgeTopics & KnowledgeGraph & {
  version: 1;
  findings: LinkedFinding[];
  diagnostics: KnowledgeDiagnostics;
  disputes: KnowledgeDispute[];
  sectionLinks: KnowledgeSectionLink[];
};

export function independentlyRead(source: KnowledgeSource | null | undefined): boolean;
export function independentlyVerified(source: KnowledgeSource | null | undefined): boolean;
export function projectFindings(sources?: KnowledgeSource[], findings?: KnowledgeFinding[]): LinkedFinding[];
export function mergeSynthesis(
  analyses?: ({ nodeId?: string; result?: SynthesisResult } & SynthesisResult)[],
  findings?: LinkedFinding[],
): KnowledgeGraph;
export function projectTopics(state: KnowledgeState, verifiedFindings?: LinkedFinding[]): KnowledgeTopics;
export function projectGaps(state: KnowledgeState | null | undefined): KnowledgeTopics['gaps'];
export function projectDisputes(sources?: KnowledgeSource[], contradictions?: KnowledgeState['contradictions']): KnowledgeDispute[];
export function projectReportLinks(report?: KnowledgeReport | null, findings?: LinkedFinding[], sources?: KnowledgeSource[]): KnowledgeSectionLink[];
export function compareResearch(previous?: LinkedFinding[], current?: LinkedFinding[]): {
  retained: number;
  changes: ResearchDifference[];
};
export function projectKnowledge(state: KnowledgeState): KnowledgeProjection;
export function projectPublicKnowledge(summary: KnowledgePublicSummary | null | undefined): KnowledgeProjection;

/** Extension of the existing presentation matrix, without changing its storage. */
export type KnowledgeMatrix = {
  id: string;
  title: string;
  columns: string[];
  rows: { label: string; values: string[] }[];
};
/** Immutable original-page reference, suitable for later audit of an applied cell. */
export type KnowledgeMatrixProofRef = KnowledgeEvidence & {
  findingId: string;
  locator: string;
  sha256: string;
  finalUrl: string;
  accessedAt: number;
};
export type KnowledgeMatrixProposal = {
  matrixId: string;
  rowLabel: string;
  columnLabel: string;
  expectedRaw: string;
  proposedRaw: string;
  findingIds: string[];
  /** Matrix owner research, NOT the follow-up child research. Requires matching context. */
  researchId?: string;
  /** Copy from ready-for-review.proofRefs at review time to guard stale approval. */
  reviewedProofRefs?: KnowledgeMatrixProofRef[];
};
export type MatrixProposalAssessment =
  | {status: 'invalid' | 'cell-not-unique' | 'needs-evidence' | 'needs-value-support' | 'stale-evidence' | 'wrong-research'; reason: string}
  | {status: 'conflict'; reason: string; expectedRaw: string; actualRaw: string}
  | {status: 'unchanged'}
  | {
      status: 'ready-for-review';
      matrixId: string;
      rowIndex: number;
      columnIndex: number;
      rowLabel: string;
      columnLabel: string;
      expectedRaw: string;
      proposedRaw: string;
      findingIds: string[];
      sourceIds: string[];
      proofRefs: KnowledgeMatrixProofRef[];
      researchId?: string;
    };
export type MatrixAccepted = {
  status: 'applied';
  matrix: KnowledgeMatrix;
  provenance: {
    matrixId: string;
    rowLabel: string;
    columnLabel: string;
    previousRaw: string;
    proposedRaw: string;
    findingIds: string[];
    sourceIds: string[];
    proofRefs: KnowledgeMatrixProofRef[];
    researchId?: string;
  };
};
export type KnowledgeMatrixContext = {researchId: string};
export function assessMatrixProposal(
  matrix: KnowledgeMatrix | null | undefined,
  candidate: KnowledgeMatrixProposal,
  linkedFindings?: LinkedFinding[],
  context?: KnowledgeMatrixContext,
): MatrixProposalAssessment;
export function acceptMatrixProposal(
  matrix: KnowledgeMatrix,
  candidate: KnowledgeMatrixProposal,
  linkedFindings?: LinkedFinding[],
  approved?: boolean,
  context?: KnowledgeMatrixContext,
): MatrixAccepted | {status: 'not-approved' | MatrixProposalAssessment['status']; matrix: KnowledgeMatrix;
  assessment: MatrixProposalAssessment};
