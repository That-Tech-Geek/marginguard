export const MODELS = {
  'gpt-4-turbo': { costPer1k: 0.03, tier: 'high' },
  'gpt-4o': { costPer1k: 0.015, tier: 'high' },
  'gpt-3.5-turbo': { costPer1k: 0.0015, tier: 'low' },
  'claude-3-opus': { costPer1k: 0.075, tier: 'high' },
  'claude-3-haiku': { costPer1k: 0.00125, tier: 'low' },
  'gemini-1.5-pro': { costPer1k: 0.007, tier: 'medium' },
  'gemini-1.5-flash': { costPer1k: 0.0007, tier: 'low' },
};

export const CUSTOMERS = ['acme_corp', 'start_up_inc', 'mega_dyne', 'quant_ai', 'user_1293'];

export const INITIAL_RUNWAY_DAYS = 180;
export const DAILY_BUDGET = 500; // $500/day demo budget
export const VARIANCE_THRESHOLD = 0.15; // 15% variance triggers controls
export const HOURLY_BUDGET_CAP = DAILY_BUDGET / 24;