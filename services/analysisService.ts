import { GoogleGenAI } from "@google/genai";
import { DecisionObject } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const narrateDecision = async (decision: DecisionObject): Promise<string> => {
  try {
    // We strictly feed the Deterministic Decision Object.
    // The LLM is NOT deciding anything, only converting JSON to natural language.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Updated to valid model for basic text tasks
      contents: `
      You are a FinOps System Log Narrator.
      Convert this JSON Decision Object into a single, professional, 2-sentence executive summary.
      
      Rules:
      1. Do not add advice not present in the JSON.
      2. State the Root Cause clearly.
      3. State the Mathematical Proof (Variance % or Savings).
      
      Decision Object:
      ${JSON.stringify(decision)}
      `,
    });

    return response.text || "Analysis complete.";
  } catch (error) {
    console.error("Narration failed", error);
    return "Automated narration unavailable.";
  }
};