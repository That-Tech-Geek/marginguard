import { MODELS, HOURLY_BUDGET_CAP } from '../constants';
import { SimulationRequest, DecisionType, SimulationDecision, FinancialState } from '../types';

// Simple implementation of Exponential Weighted Moving Average (EWMA)
// In a real app, this would be more complex and stateful across sessions.
export const calculateEWMA = (currentValue: number, previousMA: number, alpha: number = 0.2): number => {
  return alpha * currentValue + (1 - alpha) * previousMA;
};

export const makeDecision = (
  req: SimulationRequest,
  currentState: FinancialState
): SimulationDecision => {
  const modelInfo = MODELS[req.modelRequested as keyof typeof MODELS] || MODELS['gpt-3.5-turbo'];
  const estimatedCost = (req.estimatedTokens / 1000) * modelInfo.costPer1k;

  // 1. Forecast Check
  // If current hourly spending rate > budget cap * 1.2 (20% buffer), take action
  const isOverBudget = currentState.hourlySpendMA > (HOURLY_BUDGET_CAP * 1.2);
  const isCritical = currentState.hourlySpendMA > (HOURLY_BUDGET_CAP * 2.0);

  let decision = DecisionType.ALLOW;
  let assignedModel = req.modelRequested;
  let finalCost = estimatedCost;
  let saved = 0;

  if (isCritical) {
    // Critical Overspend: Deny expensive requests or drastically downgrade
    if (modelInfo.tier === 'high') {
       decision = DecisionType.DENY;
       assignedModel = 'BLOCKED';
       finalCost = 0;
       saved = estimatedCost;
    } else {
       // Even low tier is risky, but we allow business critical low cost
       decision = DecisionType.ALLOW; 
    }
  } else if (isOverBudget) {
    // Moderate Overspend: Force Downgrade
    if (modelInfo.tier === 'high') {
      decision = DecisionType.DOWNGRADE;
      // Find a cheaper model
      assignedModel = 'gpt-3.5-turbo'; // Default fallback
      const fallbackCost = (req.estimatedTokens / 1000) * MODELS['gpt-3.5-turbo'].costPer1k;
      finalCost = fallbackCost;
      saved = estimatedCost - fallbackCost;
    }
  }

  return {
    requestId: req.id,
    decision,
    originalModel: req.modelRequested,
    assignedModel,
    costIncurred: finalCost,
    tokensUsed: req.estimatedTokens,
    savedAmount: saved,
    timestamp: req.timestamp
  };
};