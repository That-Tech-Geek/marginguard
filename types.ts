export enum DecisionType {
  ALLOW = 'ALLOW',
  DOWNGRADE = 'DOWNGRADE',
  DENY = 'DENY'
}

export interface SimulationRequest {
  id: string;
  timestamp: number;
  customerId: string;
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
  savedAmount: number; // Cost avoided
  timestamp: number;
}

export interface FinancialState {
  totalSpend: number;
  totalSaved: number;
  currentRunwayDays: number;
  dailyBudget: number;
  hourlySpendMA: number; // Moving average
  variance: number;
}

export interface ForecastPoint {
  time: string;
  actual: number | null;
  forecast: number;
  upperBand: number;
  lowerBand: number;
}

export enum SimulationMode {
  IDLE = 'IDLE',
  NORMAL = 'NORMAL',
  SPIKE = 'SPIKE'
}