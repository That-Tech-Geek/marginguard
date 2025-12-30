import { SimulationDecision, AnalysisResult } from "../types";

export const analyzeCostAnomalies = async (
    recentDecisions: SimulationDecision[], 
    currentSpend: number,
    hourlySpendMA: number
): Promise<AnalysisResult> => {
    
    const deniedCount = recentDecisions.filter(d => d.decision === 'DENY').length;
    const downgradeCount = recentDecisions.filter(d => d.decision === 'DOWNGRADE').length;
    const totalSaved = recentDecisions.reduce((acc, curr) => acc + curr.savedAmount, 0);
    const projected24h = hourlySpendMA * 24;

    const prompt = `<|im_start|>system
You are MarginGuard AI, an expert FinOps Optimization Engine. Your goal is to protect runway and maximize Effective Margin Delta (EMD).
<|im_end|>
<|im_start|>user
Analyze the following inference data. Return ONLY valid JSON.

**Financial State:**
- Hourly Burn Rate: $${hourlySpendMA.toFixed(2)}/hr
- Projected 24h Spend: $${projected24h.toFixed(2)}
- Downgrades: ${downgradeCount}
- Savings: $${totalSaved.toFixed(2)}

**Traffic Sample:**
${JSON.stringify(recentDecisions.slice(-5).map(d => ({
    model: d.originalModel,
    action: d.decision,
    cost: d.costIncurred
})))}

**JSON Schema:**
{
  "summary": "One sentence executive summary of financial health.",
  "recommendations": [
    {
      "trigger": "Condition observed (e.g. 'High GPT-4 usage')",
      "action": "Specific recommendation (e.g. 'Route to Haiku')",
      "impact": "Est. savings (e.g. 'Save 30%')",
      "confidence": "High" | "Medium" | "Low"
    }
  ]
}
<|im_end|>
<|im_start|>assistant
`;

    try {
        const response = await fetch(
            "https://api-inference.huggingface.co/models/Qwen/Qwen3-235B-A22B-Thinking-2507-FP8", 
            {
                headers: { 
                    Authorization: `Bearer ${process.env.API_KEY}`,
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify({ 
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 512,
                        return_full_text: false,
                        temperature: 0.1, // Lower temperature for consistent JSON
                        do_sample: false
                    }
                }),
            }
        );
        
        if (!response.ok) {
            throw new Error(`HF API Error: ${response.status}`);
        }

        const result = await response.json();
        const text = Array.isArray(result) ? result[0].generated_text : result.generated_text;
        
        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
        
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Analysis Failed", error);
        return {
            summary: "Automated analysis unavailable. Manual review required.",
            recommendations: []
        };
    }
};