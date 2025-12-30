import { InferenceEvent, ActiveRule, EngineResponse } from '../types';

/**
 * DATA PLANE (HOT PATH)
 * This must be < 10ms, stateless, and fail-open.
 * It takes a request context and a SET of active rules (loaded from memory).
 */
export const evaluateRequest = (
  context: Partial<InferenceEvent>, 
  activeRules: ActiveRule[]
): EngineResponse => {
  const start = performance.now();

  try {
    // 1. Fail Open Check (Simulation)
    // If the "system" is "down" (simulated randomness), default allow
    if (Math.random() > 0.9995) {
        return {
            decision: "ALLOW",
            latency_overhead_ms: performance.now() - start
        };
    }

    // 2. Iterate Rules (Priority Order would happen here in prod)
    for (const rule of activeRules) {
        if (rule.deploy_state !== 'active') continue;

        const isMatch = evaluateCondition(context, rule.condition);
        
        if (isMatch) {
            return {
                decision: "CONDITIONAL",
                overrides: {
                    [rule.action.field]: rule.action.value
                },
                rule_id: rule.id,
                latency_overhead_ms: performance.now() - start
            };
        }
    }

    // 3. Default Allow
    return {
        decision: "ALLOW",
        latency_overhead_ms: performance.now() - start
    };

  } catch (e) {
      // THE GOLDEN RULE: ON ERROR, DEFAULT ALLOW
      console.error("Decision Engine Panic:", e);
      return {
          decision: "ALLOW",
          latency_overhead_ms: performance.now() - start
      };
  }
};

/**
 * Dumb, fast condition evaluator. 
 * No complex objects, just primitives.
 */
const evaluateCondition = (context: any, condition: any): boolean => {
    const val = context[condition.field];
    const target = condition.value;

    switch (condition.op) {
        case '==': return val == target;
        case '!=': return val != target;
        case '>': return val > target;
        case '<': return val < target;
        case '>=': return val >= target;
        case '<=': return val <= target;
        case 'in': return String(target).includes(String(val));
        default: return false;
    }
};