import { SimulationDecision } from "../types";

export const analyzeCostAnomalies = async (
    recentDecisions: SimulationDecision[], 
    currentSpend: number,
    hourlySpendMA: number
): Promise<string> => {
    
    const deniedCount = recentDecisions.filter(d => d.decision === 'DENY').length;
    const downgradeCount = recentDecisions.filter(d => d.decision === 'DOWNGRADE').length;
    const totalSaved = recentDecisions.reduce((acc, curr) => acc + curr.savedAmount, 0);
    const projected24h = hourlySpendMA * 24;

    const prompt = `<|im_start|>system
You are MarginGuard AI, an expert FinOps Optimization Engine. Your goal is to protect runway and maximize Effective Margin Delta (EMD).
<|im_end|>
<|im_start|>user
Analyze the following inference data and provide proactive recommendations.

**Current Financial State:**
- Real-time Spend: $${currentSpend.toFixed(2)}
- Hourly Burn Rate: $${hourlySpendMA.toFixed(2)}/hr
- Projected 24h Spend: $${projected24h.toFixed(2)}
- Total Requests Denied: ${deniedCount}
- Total Requests Downgraded: ${downgradeCount}
- Effective Margin Delta (Money Saved): $${totalSaved.toFixed(2)}

**Recent Traffic Sample (Last 5 Decisions):**
${JSON.stringify(recentDecisions.slice(-5).map(d => ({
    req: d.requestId.slice(-4),
    model_requested: d.originalModel,
    action: d.decision,
    model_assigned: d.assignedModel,
    cost: d.costIncurred
})))}

**Instructions:**
1. **Financial Outlook:** Briefly assess the spend velocity vs budget.
2. **Model Optimization Recommendations:** Suggest specific tier changes based on the traffic. Consider cost vs performance (e.g., "Shift creative writing from GPT-4 to Claude Haiku to save 90%").
3. **Runway Action:** Provide one immediate step to extend runway.

Format as a clean, actionable executive summary.
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
                        temperature: 0.7,
                        do_sample: true
                    }
                }),
            }
        );
        
        if (!response.ok) {
            throw new Error(`HF API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        // Handle standard HF inference API response structure
        if (Array.isArray(result) && result.length > 0 && result[0].generated_text) {
            return result[0].generated_text;
        } else if (typeof result === 'object' && result.error) {
             return `Analysis Error: ${result.error}`;
        }
        
        return "Analysis unavailable: Unexpected response format from AI provider.";
    } catch (error) {
        console.error("Analysis Failed", error);
        return "Unable to generate AI analysis. Please check your network or API configuration.";
    }
};