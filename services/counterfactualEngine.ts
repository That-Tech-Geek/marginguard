import { InferenceEvent, CounterfactualRule, RuleCondition, RuleAction, Op } from '../types';

/**
 * Evaluates a condition against an event.
 * Deterministic boolean output.
 */
const evaluateCondition = (event: InferenceEvent, condition: RuleCondition): boolean => {
  const eventValue = event[condition.field];
  
  // Strict type handling for safety
  const val = condition.value;

  switch (condition.op) {
    case '>': return eventValue > val;
    case '<': return eventValue < val;
    case '==': return eventValue == val; // Loose equality for number/string mix
    case '>=': return eventValue >= val;
    case '<=': return eventValue <= val;
    case 'in': // Simple inclusion check for strings/reasoning
        return String(val).includes(String(eventValue));
    default: return false;
  }
};

/**
 * Applies an action to an event, returning a NEW immutable event (or null if dropped).
 */
const applyAction = (event: InferenceEvent, action: RuleAction): InferenceEvent | null => {
  if (action.op === 'drop') return null;

  const newEvent = { ...event };
  
  // Strict mutation logic
  if (action.field !== 'event') {
    // We are simulating: if we change usage, we change cost.
    // In a real engine, we'd have a cost model. Here we approximate cost impact.
    
    if (action.field === 'retries' && action.op === 'cap') {
      const cap = Number(action.value);
      if (newEvent.retries > cap) {
        // Counterfactual: If we capped retries, tokens and cost would be reduced proportionally
        // Assumption: Each retry adds ~1x tokens. 
        // Example: 2 retries = 3 executions total. Reducing to 0 retries = 1 execution.
        const originalExecutions = 1 + newEvent.retries;
        const newExecutions = 1 + cap;
        const ratio = newExecutions / originalExecutions;
        
        newEvent.retries = cap;
        newEvent.cost_usd = newEvent.cost_usd * ratio;
        newEvent.tokens_in = Math.floor(newEvent.tokens_in * ratio);
        newEvent.tokens_out = Math.floor(newEvent.tokens_out * ratio);
      }
    }
    
    if (action.field === 'model' && action.op === 'set') {
        const targetModel = String(action.value);
        if (targetModel !== newEvent.model) {
            // Rudimentary cost switching logic for demo
            const costMap: Record<string, number> = {
                'gpt-4': 0.03,
                'gpt-3.5-turbo': 0.0015,
                'claude-3-opus': 0.075,
                'claude-3-haiku': 0.00125
            };
            const currentRate = costMap[newEvent.model] || 0.01;
            const newRate = costMap[targetModel] || 0.01;
            const ratio = newRate / currentRate;
            
            newEvent.model = targetModel;
            newEvent.cost_usd = newEvent.cost_usd * ratio;
        }
    }
  }

  return newEvent;
};

/**
 * Replays a history of events under a specific rule.
 * Returns the Counterfactual History.
 */
export const replayHistory = (events: InferenceEvent[], rule: CounterfactualRule): InferenceEvent[] => {
  const result: InferenceEvent[] = [];

  for (const event of events) {
    if (evaluateCondition(event, rule.condition)) {
      const mutated = applyAction(event, rule.action);
      if (mutated) {
        result.push(mutated);
      }
    } else {
      result.push(event);
    }
  }

  return result;
};

export const AVAILABLE_RULES: CounterfactualRule[] = [
    {
        id: 'cap_retries_1',
        description: 'Cap Retries at 1',
        condition: { field: 'retries', op: '>', value: 1 },
        action: { field: 'retries', op: 'cap', value: 1 }
    },
    // New granular rule: Only retry on timeouts (mocked implementation logic)
    // In a real engine, 'condition' would be more complex (OR logic). 
    // Here we simulate "If retry > 0 AND reason is NOT timeout, cap at 0".
    {
        id: 'retry_only_timeout',
        description: 'Retry only on Timeout',
        condition: { field: 'retry_reason', op: '!=', value: 'timeout' }, 
        // This is a simplification: logic implies if it wasn't a timeout, we shouldn't have retried
        action: { field: 'retries', op: 'cap', value: 0 } 
    },
    {
        id: 'downgrade_reporting',
        description: 'Route "Reporting" to Haiku',
        condition: { field: 'prompt_class', op: '==', value: 'reporting' },
        action: { field: 'model', op: 'set', value: 'claude-3-haiku' }
    },
     {
        id: 'downgrade_reporting_gpt35',
        description: 'Route "Reporting" to GPT-3.5',
        condition: { field: 'prompt_class', op: '==', value: 'reporting' },
        action: { field: 'model', op: 'set', value: 'gpt-3.5-turbo' }
    }
];