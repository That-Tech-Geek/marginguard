import { InferenceEvent, DistributionStats, VarianceDecomposition, RootCauseAnalysis, BlastRadius } from '../types';

/**
 * Streaming Statistics Calculator
 * Uses Welford's Algorithm for numerical stability in one pass.
 */
export class StreamingStats {
  private count = 0;
  private mean = 0;
  private M2 = 0; // Sum of squares of differences from the current mean
  private min = Infinity;
  private max = -Infinity;
  private reservoir: number[] = []; // Fixed size buffer for quantile estimation
  private reservoirSize = 1000;

  update(value: number) {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.M2 += delta * delta2;

    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;

    // Reservoir sampling for quantiles
    if (this.reservoir.length < this.reservoirSize) {
      this.reservoir.push(value);
    } else {
      const j = Math.floor(Math.random() * this.count);
      if (j < this.reservoirSize) {
        this.reservoir[j] = value;
      }
    }
  }

  getVariance(): number {
    return this.count < 2 ? 0 : this.M2 / (this.count - 1);
  }

  getStdDev(): number {
    return Math.sqrt(this.getVariance());
  }

  getQuantile(q: number): number {
    if (this.reservoir.length === 0) return 0;
    const sorted = [...this.reservoir].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  }

  getStats(events: InferenceEvent[]): DistributionStats {
    const variance = this.getVariance();
    const stdDev = this.getStdDev();
    const mean = this.mean;
    
    // Tail mass: Probability mass > Mean + 2 Sigma
    const threshold = mean + (2 * stdDev);
    const tailCount = events.filter(e => e.cost_usd > threshold).length;
    const tailMass = events.length > 0 ? tailCount / events.length : 0;

    const retryRate = events.length > 0 
      ? events.filter(e => e.retries > 0).length / events.length 
      : 0;

    return {
      count: this.count,
      mean,
      variance,
      std_dev: stdDev,
      cv: mean > 0 ? stdDev / mean : 0,
      min: this.min === Infinity ? 0 : this.min,
      max: this.max === -Infinity ? 0 : this.max,
      p50: this.getQuantile(0.50),
      p90: this.getQuantile(0.90),
      p95: this.getQuantile(0.95),
      p99: this.getQuantile(0.99),
      tail_mass: tailMass,
      instability_index: (mean > 0 ? stdDev / mean : 0) * tailMass * (1 + retryRate)
    };
  }
}

/**
 * ANOVA-style Variance Decomposition
 * Calculates how much variance is explained by specific categorical dimensions.
 */
export const decomposeVariance = (events: InferenceEvent[]): VarianceDecomposition => {
  if (events.length < 5) return {};

  const totalCost = events.map(e => e.cost_usd);
  const globalStats = new StreamingStats();
  totalCost.forEach(c => globalStats.update(c));
  const totalVariance = globalStats.getVariance();

  if (totalVariance === 0) return {};

  const dimensions: (keyof InferenceEvent)[] = ['model', 'prompt_class', 'retries'];
  const result: VarianceDecomposition = {};
  let explainedVarianceSum = 0;

  dimensions.forEach(dim => {
    // Group events by dimension value
    const groups: Record<string, number[]> = {};
    events.forEach(e => {
      const key = String(e[dim]);
      if (!groups[key]) groups[key] = [];
      groups[key].push(e.cost_usd);
    });

    // Calculate Weighted Variance of Group Means (Between-Group Variance)
    let weightedMeanVariance = 0;
    Object.values(groups).forEach(groupCosts => {
      const groupStats = new StreamingStats();
      groupCosts.forEach(c => groupStats.update(c));
      
      const meanDiff = groupStats.getStats([]).mean - globalStats.getStats([]).mean;
      weightedMeanVariance += groupCosts.length * (meanDiff * meanDiff);
    });

    // Variance explained by this dimension
    const varianceExplained = (weightedMeanVariance / (events.length - 1));
    const contribution = Math.min(varianceExplained / totalVariance, 1.0);
    
    result[dim] = parseFloat(contribution.toFixed(4));
    explainedVarianceSum += result[dim];
  });

  // Remainder is noise/unexplained
  result['noise'] = Math.max(0, parseFloat((1 - explainedVarianceSum).toFixed(4)));

  return result;
};

// --- NEW DEEP DIVE ANALYTICS ---

export const analyzeRetryCauses = (events: InferenceEvent[]): RootCauseAnalysis => {
    const retriedEvents = events.filter(e => e.retries > 0 && e.retry_reason);
    if (retriedEvents.length === 0) return { top_causes: [] };

    const counts: Record<string, number> = {};
    retriedEvents.forEach(e => {
        const reason = e.retry_reason || 'unknown';
        counts[reason] = (counts[reason] || 0) + 1;
    });

    const total = retriedEvents.length;
    const causes = Object.entries(counts)
        .map(([cause, count]) => ({ cause, share: count / total }))
        .sort((a, b) => b.share - a.share);

    return { top_causes: causes };
};

export const analyzeBlastRadius = (events: InferenceEvent[], problematicEvents: InferenceEvent[]): BlastRadius => {
    const totalRevenue = events.reduce((acc, e) => acc + e.cost_usd, 0);
    const affectedRevenue = problematicEvents.reduce((acc, e) => acc + e.cost_usd, 0);
    
    const uniqueTenants = new Set(events.map(e => e.org_id));
    const affectedTenants = new Set(problematicEvents.map(e => e.org_id));

    // Calculate top affected tenants
    const tenantImpact: Record<string, number> = {};
    problematicEvents.forEach(e => {
        tenantImpact[e.org_id] = (tenantImpact[e.org_id] || 0) + e.cost_usd;
    });

    const topTenants = Object.entries(tenantImpact)
        .map(([id, cost]) => ({ id, share: cost / (affectedRevenue || 1) }))
        .sort((a, b) => b.share - a.share)
        .slice(0, 3);

    return {
        affected_tenants_pct: uniqueTenants.size > 0 ? affectedTenants.size / uniqueTenants.size : 0,
        affected_revenue_pct: totalRevenue > 0 ? affectedRevenue / totalRevenue : 0,
        top_3_tenants: topTenants
    };
};
