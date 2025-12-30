import { GoogleGenAI } from "@google/genai";
import { SimulationDecision } from "../types";

// Initialize Gemini Client
const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
};

export const analyzeCostAnomalies = async (
    recentDecisions: SimulationDecision[], 
    currentSpend: number
): Promise<string> => {
    const client = getClient();
    if (!client) return "API Key missing. Unable to generate analysis.";

    const deniedCount = recentDecisions.filter(d => d.decision === 'DENY').length;
    const downgradeCount = recentDecisions.filter(d => d.decision === 'DOWNGRADE').length;
    const totalSaved = recentDecisions.reduce((acc, curr) => acc + curr.savedAmount, 0);

    const prompt = `
        You are an AI FinOps Controller Analysis Engine.
        Analyze the following real-time traffic window.
        
        Metrics:
        - Total Spend in window: $${currentSpend.toFixed(2)}
        - Total Denied Requests: ${deniedCount}
        - Total Downgraded Requests: ${downgradeCount}
        - Estimated Cost Avoidance (Savings): $${totalSaved.toFixed(2)}
        - Recent Decisions Sample (Last 5): ${JSON.stringify(recentDecisions.slice(-5))}

        Provide a brief, professional, bulleted executive summary (max 3 bullets) on the intervention effectiveness. 
        Focus on "Effective Margin Delta" and runway protection.
    `;

    try {
        const response = await client.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return response.text || "Analysis unavailable.";
    } catch (error) {
        console.error("Gemini Analysis Failed", error);
        return "System error during AI analysis.";
    }
};