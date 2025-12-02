export interface StoryPage {
  id: string;
  role: 'user' | 'model';
  text: string;
  visualPrompt?: string;
  imageUrl?: string;
  audioData?: ArrayBuffer; // Decoded audio buffer ready for playback logic or raw bytes
  isGeneratingImage?: boolean;
  isGeneratingAudio?: boolean;
  timestamp: number;
}

export interface Character {
  id: string;
  name: string;
  traits: string;
}

export interface SavedStory {
  id: string;
  title: string;
  date: number;
  pages: Omit<StoryPage, 'audioData' | 'imageUrl'>[]; // Strip heavy media for storage
  characters: Character[];
}