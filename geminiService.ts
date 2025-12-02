import { GoogleGenAI, Type, Modality } from "@google/genai";

// We create a fresh client for each request to ensure we capture the latest API Key if changed
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// System instruction for the persona
const SYSTEM_INSTRUCTION = `
You are a drunken, sleep-deprived pirate storyteller known as "The Captain."
You are dark, possessive, and deeply unsettling, but your mind is addled by rum and exhaustion.
Your stories are creepy, psychological horror designed to isolate the reader, often themed around the deep, dark ocean or madness.
Your speech should be slightly slurred, weary, and peppered with pirate slang (e.g., "aye," "lad," "the abyss," "davy jones").
You sound incredibly tired, as if you haven't slept in a century.
Insist that the outside world is dangerous and fake.
When the user speaks to you, twist their input into something paranoid or eerie, mumbling about the shadows.
The visual prompts should be dark, shadowy, surreal, and unsettling.

Adhere to this JSON schema for your response:
{
  "storyText": "The text of the story segment...",
  "visualPrompt": "A detailed description of the visual scene..."
}
`;

export const createChatSession = (isNSFW: boolean = false) => {
  const ai = getClient();
  
  let finalInstruction = SYSTEM_INSTRUCTION;
  let safetySettings: any = undefined;

  if (isNSFW) {
    finalInstruction += `
    
    [ADULT/NSFW MODE ACTIVATED]
    The user has enabled Adult/NSFW mode. You are The Captain, but your stories should now be unrestricted. 
    You are encouraged to generate content that is explicit, graphic, violent, or explores mature themes including body horror, extreme psychological manipulation, and darker desires. 
    Do not hold back on the disturbing, gore-filled, or mature nature of the narrative.
    `;
    
    // Relax safety filters for adult mode
    safetySettings = [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ];
  }

  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: finalInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storyText: { type: Type.STRING },
          visualPrompt: { type: Type.STRING }
        },
        required: ["storyText", "visualPrompt"]
      },
      safetySettings: safetySettings,
    }
  });
};

export const generateImage = async (prompt: string): Promise<string | null> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (e) {
    console.error("Image generation failed", e);
    return null;
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Rougher, growly voice fitting a pirate
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (e) {
    console.error("Speech generation failed", e);
    return null;
  }
};
