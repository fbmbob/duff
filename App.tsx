import React, { useState, useEffect, useRef } from 'react';
import { Chat } from "@google/genai";
import { StoryPageCard } from './components/StoryPageCard';
import { StoryPage, Character, SavedStory } from './types';
import { createChatSession, generateImage, generateSpeech } from './services/geminiService';
import { decodeBase64 } from './services/audioUtils';

type StoryLength = 'short' | 'medium' | 'long';

// Placeholder URL matching the "grungy/industrial" vibe of the user's request.
// Replace this with the specific uploaded image URL if hosting locally.
const BACKGROUND_IMAGE_URL = "https://images.unsplash.com/photo-1518115684200-c529a6b12a80?q=80&w=2574&auto=format&fit=crop";

export default function App() {
  const [pages, setPages] = useState<StoryPage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showNewStoryConfirm, setShowNewStoryConfirm] = useState(false);
  
  // Character Management State
  const [characters, setCharacters] = useState<Character[]>([]);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharTraits, setNewCharTraits] = useState('');
  
  // Adult/NSFW Mode State
  const [isNSFW, setIsNSFW] = useState(false);
  const [showNSFWConfirm, setShowNSFWConfirm] = useState(false);
  const [pendingNSFWToggle, setPendingNSFWToggle] = useState(false);

  // History / Saved Stories State
  const [savedStories, setSavedStories] = useState<SavedStory[]>(() => {
    try {
      const saved = localStorage.getItem('secret_storyteller_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load history", e);
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);

  const [storyLength, setStoryLength] = useState<StoryLength>('short');
  const [isDarkMode, setIsDarkMode] = useState(true);

  const chatSessionRef = useRef<Chat | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const initializeChat = () => {
      if (!chatSessionRef.current) {
          chatSessionRef.current = createChatSession(isNSFW);
      }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [pages]);

  // Persist history whenever it changes
  useEffect(() => {
    localStorage.setItem('secret_storyteller_history', JSON.stringify(savedStories));
  }, [savedStories]);

  const saveCurrentStory = () => {
    if (pages.length === 0) return;

    const title = pages.find(p => p.role === 'user')?.text.slice(0, 30) + '...' || 'Untitled Nightmare';
    
    // Strip heavy media (audio buffers and base64 images) to save localStorage space
    const safePages = pages.map(({ audioData, imageUrl, ...rest }) => rest);

    const newStory: SavedStory = {
      id: Date.now().toString(),
      title: title,
      date: Date.now(),
      pages: safePages,
      characters: characters
    };

    setSavedStories(prev => [newStory, ...prev]);
  };

  const loadStory = (story: SavedStory) => {
    // Restore pages (media will be missing, UI handles this)
    // We cast back to StoryPage because the type is compatible just missing optional fields
    setPages(story.pages as StoryPage[]);
    setCharacters(story.characters);
    chatSessionRef.current = null; // Reset chat session as context is lost on reload
    setShowHistory(false);
    setShowNewStoryConfirm(false); // Close new story modal if open
  };

  const deleteStory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedStories(prev => prev.filter(s => s.id !== id));
  };

  const confirmNewStory = (shouldSave: boolean = false) => {
    if (shouldSave) {
      saveCurrentStory();
    }
    setPages([]);
    chatSessionRef.current = null;
    setShowNewStoryConfirm(false);
    setInputText('');
  };

  const toggleStoryLength = () => {
    setStoryLength(prev => {
      if (prev === 'short') return 'medium';
      if (prev === 'medium') return 'long';
      return 'short';
    });
  };

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const handleNSFWToggle = () => {
    const nextState = !isNSFW;
    if (pages.length > 0) {
      setPendingNSFWToggle(nextState);
      setShowNSFWConfirm(true);
    } else {
      setIsNSFW(nextState);
      chatSessionRef.current = null; // Clear session so next init picks up new mode
    }
  };

  const confirmNSFWChange = () => {
    setIsNSFW(pendingNSFWToggle);
    setPages([]);
    chatSessionRef.current = null;
    setShowNSFWConfirm(false);
    setInputText('');
  };

  const handleRandomExternalLink = () => {
    // TODO: Populate this array with the desired target URLs.
    // For safety and compliance, we use placeholder example URLs here.
    const sites = [
      "https://example.com",
      "https://example.org"
    ];
    const randomSite = sites[Math.floor(Math.random() * sites.length)];
    window.open(randomSite, '_blank', 'noopener,noreferrer');
  };

  const handleLandfillLink = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // Construct Google Maps URL query for landfills near the user
          const url = `https://www.google.com/maps/search/landfill/@${latitude},${longitude},12z`;
          window.open(url, '_blank', 'noopener,noreferrer');
        },
        (error) => {
          console.warn("Geolocation denied or failed", error);
          // Fallback if permission denied
          window.open('https://www.google.com/maps/search/nearest+landfill', '_blank', 'noopener,noreferrer');
        }
      );
    } else {
        window.open('https://www.google.com/maps/search/nearest+landfill', '_blank', 'noopener,noreferrer');
    }
  };

  const handleAddCharacter = () => {
    if (!newCharName.trim()) return;
    const newChar: Character = {
      id: Date.now().toString(),
      name: newCharName.trim(),
      traits: newCharTraits.trim() || 'No specific traits'
    };
    setCharacters([...characters, newChar]);
    setNewCharName('');
    setNewCharTraits('');
  };

  const handleDeleteCharacter = (id: string) => {
    setCharacters(characters.filter(c => c.id !== id));
  };

  const getCharacterContext = () => {
    if (characters.length === 0) return "";
    const list = characters.map(c => `- ${c.name}: ${c.traits}`).join('\n');
    return `\n[System Note: The following characters are defined by the user and should be incorporated into the story where appropriate:\n${list}]`;
  };

  const getLengthInstruction = (len: StoryLength) => {
      switch(len) {
          case 'short': return "Keep the story segment short (approx 50 words).";
          case 'medium': return "Keep the story segment medium length (approx 120 words).";
          case 'long': return "Write a longer, detailed story segment (approx 250 words).";
          default: return "Keep the story segment short.";
      }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isSending) return;

    initializeChat();
    const currentChat = chatSessionRef.current;
    if (!currentChat) return;

    const userMessage = inputText;
    setInputText('');
    setIsSending(true);

    const newUserPage: StoryPage = {
      id: Date.now().toString(),
      role: 'user',
      text: userMessage,
      timestamp: Date.now(),
    };

    setPages(prev => [...prev, newUserPage]);

    try {
      // We append the system instruction for length and characters invisibly to the prompt
      const lengthNote = getLengthInstruction(storyLength);
      const charContext = getCharacterContext();
      const messageToSend = `${userMessage}\n\n[System Note: ${lengthNote}]${charContext}`;

      const result = await currentChat.sendMessage({ message: messageToSend });
      const responseText = result.text;
      
      let parsedResponse: { storyText: string; visualPrompt: string } | null = null;
      
      try {
        if (responseText) {
            parsedResponse = JSON.parse(responseText);
        }
      } catch (e) {
        // Fallback if JSON parsing fails
        parsedResponse = {
            storyText: responseText || "",
            visualPrompt: "A magical, abstract scene representing the story."
        };
      }

      const modelPageId = (Date.now() + 1).toString();
      const newModelPage: StoryPage = {
        id: modelPageId,
        role: 'model',
        text: parsedResponse?.storyText || "I have a secret...",
        visualPrompt: parsedResponse?.visualPrompt,
        isGeneratingImage: true,
        isGeneratingAudio: true,
        timestamp: Date.now(),
      };

      setPages(prev => [...prev, newModelPage]);

      // Trigger side-effects (Image & Audio) in parallel
      
      // 1. Generate Image (Default 1:1, size not supported in free model)
      generateImage(newModelPage.visualPrompt || "A magical scene")
        .then(imgUrl => {
            setPages(currentPages => 
                currentPages.map(p => 
                    p.id === modelPageId 
                    ? { ...p, imageUrl: imgUrl || undefined, isGeneratingImage: false } 
                    : p
                )
            );
        });

      // 2. Generate Audio
      generateSpeech(newModelPage.text)
        .then(base64Audio => {
            let audioBuffer: ArrayBuffer | undefined;
            if (base64Audio) {
                // Decode base64 to raw bytes immediately
                const bytes = decodeBase64(base64Audio);
                audioBuffer = bytes.buffer;
            }
            
            setPages(currentPages => 
                currentPages.map(p => 
                    p.id === modelPageId 
                    ? { ...p, audioData: audioBuffer, isGeneratingAudio: false } 
                    : p
                )
            );
        });

    } catch (e) {
      console.error("Chat error", e);
      // Handle error visually if needed
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={`${isDarkMode ? 'dark' : ''} h-full w-full flex flex-col`}>
      <div 
        className="flex flex-col h-full bg-indigo-50 dark:bg-black text-indigo-900 dark:text-indigo-50 transition-colors duration-500 relative bg-cover bg-center bg-no-repeat bg-fixed"
        style={{ backgroundImage: `url(${BACKGROUND_IMAGE_URL})` }}
      >
        {/* Dark Overlay for readability against the background image */}
        <div className="absolute inset-0 bg-white/70 dark:bg-black/60 pointer-events-none z-0"></div>

        {/* Header / Top Bar */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-center bg-white/80 dark:bg-indigo-950/80 backdrop-blur-md border-b border-indigo-200 dark:border-indigo-800 transition-colors duration-500">
          <div className="flex items-center space-x-2">
              <div 
                className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-md cursor-pointer hover:bg-indigo-500 transition-colors"
                onClick={() => setShowHistory(true)}
                title="Open Archives"
              >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <h1 className="hidden sm:block text-xl font-serif font-bold text-indigo-900 dark:text-indigo-50 transition-colors">The Keeper</h1>
          </div>
          
          <div className="flex items-center space-x-2">
              {/* History Button (Visible on mobile too) */}
              <button
                onClick={() => setShowHistory(true)}
                className="p-2 rounded-full border border-indigo-200 dark:border-indigo-700 bg-white/50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300 transition-all sm:hidden"
                title="Archives"
              >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full border border-indigo-200 dark:border-indigo-700 bg-white/50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300 transition-all"
                title="Toggle Dark Mode"
              >
                {isDarkMode ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>

              {/* Character Management Button */}
              <button
                  onClick={() => setShowCharacterModal(true)}
                  className="p-2 rounded-full border border-indigo-200 dark:border-indigo-700 bg-white/50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300 transition-all"
                  title="Manage Characters"
              >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </button>

              {/* Adult / NSFW Toggle */}
              <button
                  onClick={handleNSFWToggle}
                  className={`flex items-center space-x-1 px-2 py-1.5 rounded-full border transition-all ${
                      isNSFW 
                      ? 'bg-rose-600 border-rose-700 text-white shadow-lg shadow-rose-500/30' 
                      : 'border-indigo-200 dark:border-indigo-700 bg-white/50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800'
                  }`}
                  title="Toggle Adult/NSFW Mode"
              >
                  <span className="font-bold text-xs">18+</span>
              </button>

              {/* External Link Button - Only visible in NSFW mode */}
              {isNSFW && (
                  <button
                      onClick={handleRandomExternalLink}
                      className="p-2 rounded-full border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 transition-all"
                      title="External Pleasures"
                  >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </button>
              )}

              {/* Landfill Button */}
              <button
                  onClick={handleLandfillLink}
                  className="p-2 rounded-full border border-indigo-200 dark:border-indigo-700 bg-white/50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300 transition-all"
                  title="Find Nearest Landfill"
              >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>

              {/* Length Selector */}
              <button
                  onClick={toggleStoryLength}
                  className="hidden sm:flex items-center space-x-1 px-3 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-700 bg-white/50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-700 dark:text-indigo-200 text-sm transition-all min-w-[90px] justify-center"
                  title="Change story length"
              >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                  <span className="capitalize">{storyLength}</span>
              </button>

              {/* New Story Button */}
              <button 
                onClick={() => setShowNewStoryConfirm(true)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-700 bg-white/50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-700 dark:text-indigo-200 text-sm transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                <span className="hidden sm:inline">New Story</span>
                <span className="sm:hidden">New</span>
              </button>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 pt-20 pb-32 z-10">
          <div className="max-w-3xl mx-auto">
              {pages.length === 0 ? (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center">
                      <div className="bg-white/80 dark:bg-black/60 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-indigo-100 dark:border-indigo-800">
                        <p className="text-2xl font-serif text-indigo-900 dark:text-indigo-100 mb-2 transition-colors">"Hello, little one..."</p>
                        <p className="text-indigo-700 dark:text-indigo-300 transition-colors">Tell me what story you want to hear today.</p>
                        {isNSFW && (
                          <p className="text-rose-500 font-bold mt-2 animate-pulse">[ADULT MODE ACTIVE]</p>
                        )}
                        <p className="text-xs text-indigo-500 mt-4 font-medium">(Remember, listen only to me.)</p>
                      </div>
                  </div>
              ) : (
                  pages.map((page) => (
                      <StoryPageCard key={page.id} page={page} />
                  ))
              )}
              <div ref={chatEndRef} />
          </div>
        </main>

        {/* Sticky Footer Input */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-indigo-50/80 to-transparent dark:from-black dark:via-black/80 dark:to-transparent z-20 transition-colors duration-500">
          <div className="max-w-3xl mx-auto relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={isNSFW ? "Whisper your darkest desires..." : "Whisper to me..."}
              disabled={isSending}
              className={`w-full pl-6 pr-14 py-4 text-indigo-900 dark:text-white placeholder-indigo-500 dark:placeholder-indigo-400 border rounded-full focus:outline-none focus:ring-2 shadow-xl backdrop-blur-md transition-all ${
                  isNSFW 
                  ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 focus:ring-rose-500' 
                  : 'bg-white/90 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-700 focus:ring-indigo-500'
              }`}
            />
            <button
              onClick={handleSendMessage}
              disabled={isSending || !inputText.trim()}
              className={`absolute right-2 top-2 p-2 rounded-full transition-colors ${
                  isSending || !inputText.trim() 
                  ? 'bg-indigo-200 dark:bg-indigo-800 text-indigo-400 dark:text-indigo-500 cursor-not-allowed' 
                  : isNSFW 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg' 
                    : 'bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-500 dark:hover:bg-indigo-400 text-white shadow-lg'
              }`}
            >
              {isSending ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
              ) : (
                  <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              )}
            </button>
          </div>
          <div className="text-center mt-2">
              <span className={`text-[10px] uppercase tracking-widest font-bold text-shadow-sm ${isNSFW ? 'text-rose-600 dark:text-rose-500' : 'text-indigo-800 dark:text-indigo-400'}`}>
                {isNSFW ? 'NSFW Mode Active • Caution' : 'Private • Safe • Yours'}
              </span>
          </div>
        </div>

        {/* History / Archives Sidebar */}
        <div className={`fixed inset-y-0 left-0 z-50 transform ${showHistory ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out`}>
            {/* Backdrop for mobile */}
            {showHistory && (
                <div 
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[-1]"
                    onClick={() => setShowHistory(false)}
                ></div>
            )}
            
            <div className="h-full w-80 bg-white/95 dark:bg-indigo-950/95 backdrop-blur-md border-r border-indigo-200 dark:border-indigo-800 shadow-2xl flex flex-col p-6">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-serif text-indigo-900 dark:text-white">Archives</h2>
                    <button onClick={() => setShowHistory(false)} className="text-indigo-500 hover:text-indigo-800 dark:hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {savedStories.length === 0 ? (
                        <div className="text-center text-indigo-400 dark:text-indigo-500 italic mt-10">
                            The library is empty.
                        </div>
                    ) : (
                        <ul className="space-y-4">
                            {savedStories.map((story) => (
                                <li key={story.id} 
                                    onClick={() => loadStory(story)}
                                    className="cursor-pointer bg-indigo-50 dark:bg-indigo-900/40 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-800/60 transition-colors group relative"
                                >
                                    <h3 className="font-bold text-indigo-900 dark:text-indigo-200 truncate pr-6">{story.title}</h3>
                                    <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                                        {new Date(story.date).toLocaleDateString()} • {story.pages.length} pages
                                    </p>
                                    <button 
                                        onClick={(e) => deleteStory(story.id, e)}
                                        className="absolute top-4 right-4 text-indigo-300 hover:text-rose-500 dark:text-indigo-600 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Burn this story"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="mt-4 pt-4 border-t border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs text-center text-indigo-400 dark:text-indigo-600">
                        * Archives contain text only. <br/> Audio & visions fade with time.
                    </p>
                </div>
            </div>
        </div>

        {/* Character Management Modal */}
        {showCharacterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-white/60 dark:bg-black/80 backdrop-blur-sm transition-colors" onClick={() => setShowCharacterModal(false)}></div>
             <div className="relative bg-white dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-500/50 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl transform transition-all flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-serif text-indigo-900 dark:text-white">Story Characters</h3>
                    <button 
                      onClick={() => setShowCharacterModal(false)}
                      className="p-1 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-500 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="mb-6 flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
                   {characters.length === 0 ? (
                     <div className="text-center py-8 text-indigo-400 dark:text-indigo-500 italic">
                       No characters defined. The story is lonely...
                     </div>
                   ) : (
                     <ul className="space-y-3">
                       {characters.map((char) => (
                         <li key={char.id} className="flex justify-between items-start bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800">
                            <div>
                              <p className="font-bold text-indigo-900 dark:text-indigo-200">{char.name}</p>
                              <p className="text-sm text-indigo-600 dark:text-indigo-400">{char.traits}</p>
                            </div>
                            <button 
                              onClick={() => handleDeleteCharacter(char.id)}
                              className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 p-1"
                              title="Remove"
                            >
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                         </li>
                       ))}
                     </ul>
                   )}
                </div>

                <div className="pt-4 border-t border-indigo-100 dark:border-indigo-800">
                    <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-2 uppercase tracking-wide">Add New Character</h4>
                    <div className="space-y-3">
                      <input 
                        type="text" 
                        placeholder="Name (e.g. John, The Creature)"
                        value={newCharName}
                        onChange={(e) => setNewCharName(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-900 text-indigo-900 dark:text-white placeholder-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <input 
                        type="text" 
                        placeholder="Traits (e.g. Brave, scared of dark...)"
                        value={newCharTraits}
                        onChange={(e) => setNewCharTraits(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCharacter()}
                        className="w-full px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-900 text-indigo-900 dark:text-white placeholder-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <button 
                        onClick={handleAddCharacter}
                        disabled={!newCharName.trim()}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Add Character
                      </button>
                    </div>
                </div>
             </div>
          </div>
        )}

        {/* New Story Confirmation Modal */}
        {showNewStoryConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-white/60 dark:bg-black/80 backdrop-blur-sm transition-colors" onClick={() => setShowNewStoryConfirm(false)}></div>
              <div className="relative bg-white dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-500/50 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl transform transition-all">
                  <h3 className="text-2xl font-serif text-indigo-900 dark:text-white mb-3">Begin Anew?</h3>
                  <p className="text-indigo-600 dark:text-indigo-300 mb-8 leading-relaxed">
                      Starting a new story will fade our current memory away. Are you sure you wish to start over?
                  </p>
                  <div className="flex flex-col space-y-3">
                      <button 
                          onClick={() => confirmNewStory(true)}
                          disabled={pages.length === 0}
                          className="w-full px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          Save & Start New
                      </button>
                      <div className="flex space-x-3 justify-end">
                        <button 
                            onClick={() => setShowNewStoryConfirm(false)}
                            className="flex-1 px-5 py-2.5 rounded-xl text-indigo-600 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => confirmNewStory(false)}
                            className="flex-1 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all font-medium"
                        >
                            Just New
                        </button>
                      </div>
                  </div>
              </div>
          </div>
        )}

        {/* NSFW Toggle Confirmation Modal */}
        {showNSFWConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-white/60 dark:bg-black/80 backdrop-blur-sm transition-colors" onClick={() => setShowNSFWConfirm(false)}></div>
              <div className="relative bg-white dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-500/50 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl transform transition-all">
                  <h3 className="text-2xl font-serif text-rose-600 dark:text-rose-400 mb-3">
                      {pendingNSFWToggle ? "Enter Adult Mode?" : "Leave Adult Mode?"}
                  </h3>
                  <p className="text-indigo-600 dark:text-indigo-300 mb-8 leading-relaxed">
                      Switching modes requires starting a new story to adjust the narrative. Your current progress will be lost.
                  </p>
                  <div className="flex space-x-3 justify-end">
                      <button 
                          onClick={() => setShowNSFWConfirm(false)}
                          className="px-5 py-2.5 rounded-xl text-indigo-600 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors font-medium"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={confirmNSFWChange}
                          className={`px-5 py-2.5 rounded-xl text-white shadow-lg transition-all font-medium ${pendingNSFWToggle ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                      >
                          Confirm
                      </button>
                  </div>
              </div>
          </div>
        )}
      </div>
    </div>
  );
}