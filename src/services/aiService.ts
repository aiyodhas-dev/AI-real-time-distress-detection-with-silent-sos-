import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set. AI features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error).toLowerCase();
      const isRateLimit = 
        error?.message?.toLowerCase().includes("429") || 
        error?.message?.toLowerCase().includes("quota") ||
        error?.status === 429 || 
        error?.code === 429 || 
        errorStr.includes("429") ||
        errorStr.includes("quota") ||
        errorStr.includes("exceeded quota");
      
      if (isRateLimit && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.warn(`Rate limit hit, retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const analyzeDistress = async (imageData: string, audioData?: string) => {
  if (!apiKey) return null;

  const model = "gemini-3-flash-preview";
  
  const parts: any[] = [
    {
      text: `Analyze the following input for signs of distress (emotional, physical, or panic). 
      Return a JSON object with:
      - distressDetected: boolean
      - type: "emotional" | "physical" | "panic" | "none"
      - severity: "low" | "medium" | "high" | "critical"
      - summary: a short description of what is happening
      - confidence: 0-1 score`
    },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: imageData.split(",")[1]
      }
    }
  ];

  if (audioData) {
    parts.push({
      inlineData: {
        mimeType: "audio/wav",
        data: audioData.split(",")[1]
      }
    });
  }

  try {
    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              distressDetected: { type: Type.BOOLEAN },
              type: { type: Type.STRING },
              severity: { type: Type.STRING },
              summary: { type: Type.STRING },
              confidence: { type: Type.NUMBER }
            },
            required: ["distressDetected", "type", "severity", "summary", "confidence"]
          }
        }
      });
    });

    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toLowerCase();
    const isRateLimit = 
      error?.message?.toLowerCase().includes("429") || 
      error?.message?.toLowerCase().includes("quota") ||
      error?.status === 429 || 
      errorStr.includes("429") ||
      errorStr.includes("quota") ||
      errorStr.includes("exceeded quota");

    if (isRateLimit) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
    console.error("AI Analysis Error:", error);
    return null;
  }
};

export const generateSOSVoice = async (distressInfo: any, location: string, userName: string) => {
  if (!apiKey) return null;

  const prompt = `Generate an emergency SOS message for an AI Voice Agent to speak over a phone call.
  User Name: ${userName}
  Distress Type: ${distressInfo.type}
  Severity: ${distressInfo.severity}
  Summary: ${distressInfo.summary}
  Location: ${location}
  
  The message should be clear, urgent, and provide all necessary details for emergency responders.`;

  try {
    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO" as any],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" }
            }
          }
        }
      });
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};
