// --- DOMAIN MODEL ---

export interface InferenceEvent {
  ts: string; // ISOString
  org_id: string; // Now used for Blast Radius
  env: "prod" | "staging";
  model: string;
  endpoint: string;
  prompt_hash: string;
  prompt_class: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  retries: number;
  retry_reason: string | null; // New: For Root Cause Analysis
  success: boolean;
  cost_usd: number;
  // New: Engine Enrichment
  decision_id?: string;
  decision_applied?: "ALLOW" | "CONDITIONAL" | "BLOCK";
  rule_applied?: string;
}

// --- REAL-TIME ENGINE TYPES (HOT PATH) ---

export interface ActiveRule {
  id: string;
  rule_id: string; // e.g., 'cap_retries_1'
  created_at: any; // Firestore Timestamp
  deploy_state: "active" | "shadow" | "disabled";
  condition: RuleCondition;
  action: RuleAction;
  description: string;
  risk_score: number; // 0-1, used for blast radius checks
}

export interface EngineResponse {
  decision: "ALLOW" | "CONDITIONAL" | "BLOCK";
  overrides?: Record<string, any>;
  rule_id?: string;
  latency_overhead_ms: number;
}

// --- STATS ENGINE TYPES ---

export interface DistributionStats {
  count: number;
  mean: number;
  variance: number;
  std_dev: number;
  cv: number; // Coefficient of Variation
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  tail_mass: number;
  instability_index: number;
}

export interface VarianceDecomposition {
  [dimension: string]: number;
}

// --- COUNTERFACTUAL DSL ---

export type Op = ">" | "<" | "==" | ">=" | "<=" | "!=" | "in";
export type ActionOp = "set" | "cap" | "drop";

export interface RuleCondition {
  field: keyof InferenceEvent;
  op: Op;
  value: string | number | boolean;
}

export interface RuleAction {
  field: keyof InferenceEvent | "event";
  op: ActionOp;
  value: string | number | boolean;
}

export interface CounterfactualRule {
  id: string;
  description: string;
  condition: RuleCondition;
  action: RuleAction;
}

// --- DECISION OBJECT (OUTPUT) ---

export interface ConfidenceMetric {
  data_coverage_pct: number;
  effect_stability: number;
  sample_size: number;
  model_fit_r2: number;
  final_score: number;
  overfit_risk: "LOW" | "MEDIUM" | "HIGH"; // New: Flags low-N perfect fits
}

export interface ImpactPrediction {
  unit: "per_1k_requests";
  mean_savings_usd: number;
  p95_savings_usd: number;
  monthly_projection_usd: number;
  variance_reduction_pct: number;
  distribution_notes: string; // New: Explains why p95 might be 0 even if mean > 0
}

export interface Guardrail {
  action: string;
  only_if: string[];
}

export interface RootCauseAnalysis {
  top_causes: { cause: string; share: number }[];
}

export interface BlastRadius {
  affected_tenants_pct: number;
  affected_revenue_pct: number;
  top_3_tenants: { id: string; share: number }[];
}

export interface Reversibility {
  rollback_time_minutes: number;
  monitor_metric: string;
  abort_threshold: number;
}

export interface AlternativeAction {
  action: string;
  score: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
}

export interface InactionCost {
  expected_monthly_loss_usd: number;
  tail_event_probability: number;
  runway_impact_days: number;
}

export type DecisionState = "RECOMMENDED" | "CONDITIONAL" | "HOLD" | "INSUFFICIENT_EVIDENCE";

export interface Proof {
  variance_decomposition: VarianceDecomposition;
  noise_context?: string | null; // New: Explains suspicious lack of noise
  counterfactual_comparison: {
    baseline_cost: number;
    simulated_cost: number;
  };
}

export interface RiskAssessment {
  tail_risk_delta: number;
  latency_impact_ms: number;
}

export interface DecisionObject {
  id: string;
  timestamp: string;
  issue: string;
  decision_state: DecisionState;
  decision_state_rationale: string[]; // NEW: Explains WHY it is Conditional/Hold
  root_cause: string;
  confidence: ConfidenceMetric; // Rich object
  recommended_action: Guardrail; // Rich object
  alternative_actions_considered: AlternativeAction[]; // NEW: Granularity
  rule_generated: CounterfactualRule;
  expected_impact: ImpactPrediction; // Rich object
  inaction_cost: InactionCost; // NEW: Regret Math
  risk: RiskAssessment;
  proof: Proof;
  // New Audit Fields
  analysis_deep_dive: RootCauseAnalysis;
  blast_radius: BlastRadius;
  reversibility: Reversibility;
}

// --- APP STATE ---

export enum SimulationMode {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING'
}

export interface SystemState {
  events: InferenceEvent[];
  decisions: DecisionObject[];
  currentStats: DistributionStats;
  cfStats: DistributionStats | null; // Counterfactual stats
}

// --- LEGACY / V1 TYPES (Required for CostEngine and Components) ---

export enum DecisionType {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  DOWNGRADE = 'DOWNGRADE'
}

export interface SimulationRequest {
  id: string;
  timestamp: number;
  modelRequested: string;
  estimatedTokens: number;
}

export interface SimulationDecision {
  requestId: string;
  decision: DecisionType;
  originalModel: string;
  assignedModel: string;
  costIncurred: number;
  tokensUsed: number;
  savedAmount: number;
  timestamp: number;
}

export interface FinancialState {
  totalSpend: number;
  hourlySpendMA: number;
  budgetRemaining: number;
}

export interface ForecastPoint {
  time: string;
  actual: number;
  forecast: number;
}