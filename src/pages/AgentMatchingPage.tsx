import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Bot, CheckCircle2, Loader2, Circle,
  MessageSquare, Search, ListOrdered,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/context/AppContext';
import type { AgentStep } from '@/types';
import { cn } from '@/lib/utils';

/* ── 4 steps: Concierge → Matching → Negotiation → Ranking ── */
const FOUR_STEPS: AgentStep[] = [
  { id: 'concierge', label: '① Concierge', detail: 'Parsing your request and structuring the job spec.', status: 'pending', agentType: 'system' },
  { id: 'matching', label: '② Matching', detail: 'Searching and ranking vendors for your job.', status: 'pending', agentType: 'system' },
  { id: 'negotiation', label: '③ Negotiation', detail: 'Agents negotiating price and terms with vendors.', status: 'pending', agentType: 'system' },
  { id: 'ranking', label: '④ Ranking', detail: 'Ranking offers and preparing your top results.', status: 'pending', agentType: 'system' },
];

/* Each agent gets a unique accent color */
const SYSTEM_AGENTS = [
  { id: 'concierge', label: 'Concierge', icon: MessageSquare, angle: -90, color: '#0070f3', glowClass: 'node-glow-blue' },
  { id: 'matching', label: 'Matching', icon: Search, angle: 0, color: '#7928ca', glowClass: 'node-glow-purple' },
  { id: 'negotiation', label: 'Negotiation', icon: Bot, angle: 90, color: '#ff0080', glowClass: 'node-glow-pink' },
  { id: 'ranking', label: 'Ranking', icon: ListOrdered, angle: 180, color: '#79ffe1', glowClass: 'node-glow-cyan' },
];

type AgentStatus = 'idle' | 'active' | 'done';

export function AgentMatchingPage() {
  const navigate = useNavigate();
  const { lastPrompt } = useApp();
  const [steps, setSteps] = useState<AgentStep[]>(
    FOUR_STEPS.map((s) => ({ ...s, status: 'pending' }))
  );
  const [currentStep, setCurrentStep] = useState(-1);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>(
    Object.fromEntries(SYSTEM_AGENTS.map((a) => [a.id, 'idle']))
  );
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let stepIdx = 0;

    const advanceStep = () => {
      if (stepIdx >= FOUR_STEPS.length) {
        setAgentStatuses((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) next[key] = 'done';
          return next;
        });
        timers.push(setTimeout(() => navigate('/customer/results'), 1500));
        return;
      }

      const step = FOUR_STEPS[stepIdx];
      const agentId = step.id;

      setSteps((prev) =>
        prev.map((s, i) =>
          i === stepIdx ? { ...s, status: 'active' } : i < stepIdx ? { ...s, status: 'done' } : s
        )
      );
      setCurrentStep(stepIdx);
      setAgentStatuses((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key] === 'active' && key !== agentId) next[key] = 'done';
        }
        next[agentId] = 'active';
        return next;
      });

      stepIdx++;
      const delay = step.id === 'negotiation' ? 1500 : 1000;
      timers.push(setTimeout(advanceStep, delay));
    };

    timers.push(setTimeout(advanceStep, 500));
    return () => timers.forEach(clearTimeout);
  }, [navigate]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentStep]);

  const doneCount = steps.filter((s) => s.status === 'done').length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Agent Orchestration</h1>
              {lastPrompt && (
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  &ldquo;{lastPrompt}&rdquo;
                </p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 font-mono text-xs">
            {progress < 100 ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {progress}%
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3 text-[var(--success)]" />
                Done
              </>
            )}
          </Badge>
        </div>
        <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Main: ring visualization + log */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left: Agent ring */}
        <div className="flex-1 relative flex items-center justify-center p-6 min-h-[420px]">
          {/* Background grid */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="relative">
            {/* Center orchestrator node */}
            <div className="relative z-10 size-28 rounded-full border-2 border-primary bg-primary/20 shadow-lg shadow-primary/20 flex flex-col items-center justify-center gap-1.5">
              <Sparkles className="size-7 text-primary" />
              <span className="text-[10px] font-bold text-foreground tracking-wider">ORCHESTRATOR</span>
            </div>

            {/* Glow */}
            <div
              className="absolute inset-0 rounded-full scale-[3] opacity-100"
              style={{
                background: 'radial-gradient(circle, rgba(250,250,250,0.06) 0%, transparent 70%)',
              }}
            />

            {/* 4 agent nodes */}
            {SYSTEM_AGENTS.map((agent) => {
              const status = agentStatuses[agent.id];
              const rad = (agent.angle * Math.PI) / 180;
              const radius = 140;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;
              const Icon = agent.icon;
              const isActive = status === 'active';
              const isDone = status === 'done';

              return (
                <div key={agent.id}>
                  {/* Connection line */}
                  <svg
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    width={radius * 2 + 80}
                    height={radius * 2 + 80}
                    style={{ zIndex: 0 }}
                  >
                    <line
                      x1={radius + 40}
                      y1={radius + 40}
                      x2={radius + 40 + x}
                      y2={radius + 40 + y}
                      stroke={isDone ? 'var(--success)' : isActive ? agent.color : '#404040'}
                      strokeWidth={isActive ? 2 : 1}
                      strokeDasharray={isDone ? 'none' : '4 6'}
                      opacity={status === 'idle' ? 0.3 : 0.7}
                    />
                  </svg>

                  {/* Node */}
                  <div
                    className={cn(
                      'absolute z-10 flex flex-col items-center gap-1.5 transition-all duration-500',
                      status === 'idle' ? 'opacity-40' : 'opacity-100'
                    )}
                    style={{
                      top: `calc(50% + ${y}px - 22px)`,
                      left: `calc(50% + ${x}px - 22px)`,
                    }}
                  >
                    <div
                      className={cn(
                        'size-11 rounded-full border-2 flex items-center justify-center transition-all duration-500',
                      )}
                      style={{
                        borderColor: isDone ? 'var(--success)' : isActive ? agent.color : '#333',
                        background: isDone
                          ? 'rgba(80,227,194,0.1)'
                          : isActive
                          ? `${agent.color}15`
                          : 'rgba(10,10,10,0.5)',
                        boxShadow: isActive ? `0 0 20px ${agent.color}40` : isDone ? '0 0 15px rgba(80,227,194,0.3)' : 'none',
                      }}
                    >
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-[var(--success)]" />
                      ) : isActive ? (
                        <Loader2 className="size-4 animate-spin" style={{ color: agent.color }} />
                      ) : (
                        <Icon className="size-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <span
                      className="text-[9px] font-semibold text-center leading-tight"
                      style={{ color: isActive ? agent.color : isDone ? 'var(--success)' : '#555' }}
                    >
                      {agent.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Activity log */}
        <div className="lg:w-[420px] border-t lg:border-t-0 lg:border-l border-border/40 flex flex-col bg-card/30">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <div className="size-2 rounded-full bg-[var(--success)] animate-pulse" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Agent Activity Log
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
              {doneCount}/{steps.length} steps
            </span>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2.5 font-mono text-sm">
              {steps.map((step) => {
                if (step.status === 'pending') return null;
                const isActive = step.status === 'active';
                const isDone = step.status === 'done';
                const agent = SYSTEM_AGENTS.find((a) => a.id === step.id);

                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex gap-3 transition-opacity duration-300',
                      isActive ? 'opacity-100' : 'opacity-60'
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {isActive ? (
                        <Loader2 className="size-4 animate-spin" style={{ color: agent?.color ?? '#0070f3' }} />
                      ) : isDone ? (
                        <CheckCircle2 className="size-4 text-[var(--success)]" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-xs font-medium leading-tight',
                          isActive ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {step.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </ScrollArea>
        </div>
      </main>
    </div>
  );
}
