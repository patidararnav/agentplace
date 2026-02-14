import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

export function PromptPage() {
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();
  const { setLastPrompt, userLocation, setUserLocation } = useApp();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Optional: on first enter, could show location modal; for demo we use default
  useEffect(() => {
    if (!userLocation) setUserLocation({ lat: 37.4419, lng: -122.143 });
  }, [userLocation, setUserLocation]);

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setLastPrompt(trimmed);
    navigate('/map');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="border-b border-border/50 px-4 py-3">
        <h1 className="text-lg font-semibold text-foreground">Agent Place</h1>
        <p className="text-sm text-muted-foreground">Describe what you need. Our agent will find and negotiate with local vendors.</p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <div
            className={cn(
              'rounded-2xl border border-border bg-card/50 px-4 py-3',
              'focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50'
            )}
          >
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. I need a plumber to fix a leak under my kitchen sink next week..."
              className="w-full min-h-[160px] resize-none bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base"
              rows={5}
              autoFocus
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              className={cn(
                'flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none'
              )}
            >
              <Send className="size-5" />
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
