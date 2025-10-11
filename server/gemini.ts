// Reference: blueprint:javascript_gemini
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface EmotionFrameData {
  time: number;
  Angry: number;
  Disgust: number;
  Fear: number;
  Happy: number;
  Sad: number;
  Surprise: number;
  Neutral: number;
  dominant: string;
  dominantValue: number;
}

export interface EmotionReport {
  summary: string;
  suggestions: string[];
}

export async function generateEmotionReport(frames: EmotionFrameData[]): Promise<EmotionReport> {
  try {
    const systemPrompt = `You are an expert emotion analysis AI that provides insightful summaries and actionable suggestions for public speakers and presenters.

Analyze the emotion data from a speech or presentation and provide:
1. A concise summary paragraph (2-3 sentences) highlighting the emotional journey and key patterns
2. 3-5 specific, actionable suggestions for improvement

Focus on:
- Emotional consistency and authenticity
- Moments of strong emotional shifts
- Overall emotional tone appropriateness
- Audience engagement implications

Respond in JSON format:
{
  "summary": "string",
  "suggestions": ["string", "string", ...]
}`;

    const emotionSummary = frames.map(f => 
      `Time ${f.time}s: ${f.dominant} (${(f.dominantValue * 100).toFixed(1)}%)`
    ).join('\n');

    const stats = {
      totalFrames: frames.length,
      emotionCounts: frames.reduce((acc, f) => {
        acc[f.dominant] = (acc[f.dominant] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      avgEmotions: {
        Angry: frames.reduce((sum, f) => sum + f.Angry, 0) / frames.length,
        Disgust: frames.reduce((sum, f) => sum + f.Disgust, 0) / frames.length,
        Fear: frames.reduce((sum, f) => sum + f.Fear, 0) / frames.length,
        Happy: frames.reduce((sum, f) => sum + f.Happy, 0) / frames.length,
        Sad: frames.reduce((sum, f) => sum + f.Sad, 0) / frames.length,
        Surprise: frames.reduce((sum, f) => sum + f.Surprise, 0) / frames.length,
        Neutral: frames.reduce((sum, f) => sum + f.Neutral, 0) / frames.length,
      }
    };

    const prompt = `Analyze this emotion data from a ${frames.length}-second speech:

EMOTION TIMELINE:
${emotionSummary}

STATISTICS:
- Total duration: ${frames.length} seconds
- Emotion distribution: ${JSON.stringify(stats.emotionCounts)}
- Average emotion values: ${JSON.stringify(stats.avgEmotions, null, 2)}

Provide a Chess.com-style analysis with a summary and actionable suggestions.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            suggestions: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["summary", "suggestions"]
        }
      },
      contents: prompt
    });

    const rawJson = response.text;
    if (rawJson) {
      const report: EmotionReport = JSON.parse(rawJson);
      return report;
    } else {
      throw new Error("Empty response from Gemini");
    }
  } catch (error) {
    console.error("Error generating emotion report:", error);
    return {
      summary: "Unable to generate analysis at this time.",
      suggestions: ["Please try again later."]
    };
  }
}
