import React, { useEffect, useState, useRef } from 'react';
import { StoryPage } from '../types';
import { decodeBase64, decodeAudioData } from '../services/audioUtils';

interface StoryPageCardProps {
  page: StoryPage;
}

// Global audio context singleton to prevent multiple contexts
let audioContext: AudioContext | null = null;
const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return audioContext;
};

export const StoryPageCard: React.FC<StoryPageCardProps> = ({ page }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const playAudio = async () => {
    if (!page.audioData || isPlaying) return;
    
    // Resume context if suspended (browser policy)
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
        setIsPlaying(true);
        // We need to re-decode audio data each time or store the decoded buffer. 
        // Storing AudioBuffer in state can be heavy, but decoding raw bytes is fast enough for short clips.
        
        if (!page.audioData) return;

        const audioBuffer = await decodeAudioData(new Uint8Array(page.audioData), ctx);
        
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        source.onended = () => {
            setIsPlaying(false);
            audioSourceRef.current = null;
        };

        source.start();
        audioSourceRef.current = source;

    } catch (e) {
        console.error("Playback error", e);
        setIsPlaying(false);
    }
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    // Auto-play when audio becomes available and it's a model message
    if (page.audioData && page.role === 'model' && !isPlaying) {
         // Tiny delay to ensure smooth UI render first
         const timer = setTimeout(() => {
             playAudio();
         }, 500);
         return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.audioData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
        }
    };
  }, []);

  if (page.role === 'user') {
    return (
      <div className="flex justify-end mb-6">
        <div className="bg-indigo-500 text-white rounded-l-2xl rounded-tr-2xl rounded-br-none p-4 max-w-md shadow-lg border border-indigo-400 dark:bg-indigo-600 dark:border-indigo-500 transition-colors">
          <p className="text-lg">{page.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col mb-12 items-center w-full animate-fade-in-up">
      <div className="w-full max-w-2xl bg-white/70 dark:bg-indigo-900/50 backdrop-blur-sm rounded-3xl overflow-hidden border border-indigo-200 dark:border-indigo-500/30 shadow-2xl transition-colors duration-500">
        
        {/* Image Section */}
        <div className="relative w-full aspect-square bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center transition-colors duration-500">
            {page.imageUrl ? (
                <img 
                    src={page.imageUrl} 
                    alt={page.visualPrompt} 
                    className="w-full h-full object-cover animate-fade-in"
                />
            ) : (
                <div className="flex flex-col items-center justify-center p-8 text-indigo-400 dark:text-indigo-300 transition-colors">
                    {page.isGeneratingImage ? (
                        <>
                            <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="font-medium animate-pulse">Dreaming up a picture...</p>
                        </>
                    ) : (
                        <span className="text-sm opacity-50">No illustration</span>
                    )}
                </div>
            )}
        </div>

        {/* Text & Audio Section */}
        <div className="p-6 md:p-8">
            <p className="text-xl md:text-2xl font-serif leading-relaxed text-indigo-900 dark:text-indigo-100 mb-6 drop-shadow-sm transition-colors duration-500">
                {page.text}
            </p>
            
            <div className="flex items-center justify-between border-t border-indigo-200 dark:border-indigo-500/20 pt-4 transition-colors duration-500">
                <div className="flex items-center space-x-2">
                    {page.isGeneratingAudio ? (
                        <span className="text-indigo-500 dark:text-indigo-400 text-sm flex items-center transition-colors">
                            <span className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bounce mr-1"></span>
                            Preparing voice...
                        </span>
                    ) : page.audioData ? (
                        <button
                            onClick={isPlaying ? stopAudio : playAudio}
                            className={`flex items-center px-4 py-2 rounded-full transition-all duration-300 ${
                                isPlaying 
                                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)]' 
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                            }`}
                        >
                            {isPlaying ? (
                                <>
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span>Stop Listening</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span>Listen to Me</span>
                                </>
                            )}
                        </button>
                    ) : (
                        <span className="text-xs text-indigo-400 dark:text-indigo-500 transition-colors">Audio unavailable</span>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};