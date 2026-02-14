import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, ArrowLeft } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const SUGGESTIONS = [
  'Fix a leak under my kitchen sink',
  'Deep clean my 2BR apartment this weekend',
  'Install a ceiling fan in the bedroom',
  'Paint my living room walls — neutral tones',
];

export function PromptPage() {
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();
  const { setLastPrompt, userLocation, setUserLocation } = useApp();

  useEffect(() => {
    if (!userLocation) setUserLocation({ lat: 37.4419, lng: -122.143 });
  }, [userLocation, setUserLocation]);

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setLastPrompt(trimmed);
    navigate('/customer/agents');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold tracking-tight text-foreground">
            Agent Place
          </span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
        <div className="w-full max-w-xl space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              What do you need done?
            </h1>
            <p className="text-muted-foreground text-base">
              Describe the job in plain English. Your agent will find vendors, negotiate the best price, and book it.
            </p>
          </div>

          <div className="space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. I need a plumber to fix a leak under my kitchen sink next week..."
              className="min-h-[140px] resize-none bg-card border-border text-foreground placeholder:text-muted-foreground text-base leading-relaxed p-4 rounded-xl focus-visible:ring-primary/40"
              autoFocus
            />

            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="text-xs text-muted-foreground bg-muted/60 hover:bg-muted hover:text-foreground rounded-full px-3 py-1.5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              size="lg"
              className="w-full rounded-xl text-base font-medium gap-2"
            >
              Find vendors
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
