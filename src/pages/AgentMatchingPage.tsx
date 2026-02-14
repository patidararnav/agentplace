import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Bot, CheckCircle2, Loader2, Circle, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/context/AppContext';
import { mockAgentSteps } from '@/data/mock';
import type { AgentStep } from '@/types';
import { cn } from '@/lib/utils';

/* ── Vendor nodes arranged in a circle ── */
const VENDOR_NODES = [
  { name: 'QuickFix Plumbing', angle: -60 },
  { name: 'ProFlow Solutions', angle: 0 },
  { name: 'Bay Area Plumbing Co', angle: 60 },
  { name: 'Elite Drain Services', angle: 120 },
  { name: 'Sunset Plumbing & Heating', angle: 180 },
];

type NodeStatus = 'hidden' | 'activating' | 'negotiating' | 'done';

export function AgentMatchingPage() {
  const navigate = useNavigate();
  const { lastPrompt } = useApp();
  const [steps, setSteps] = useState<AgentStep[]>(
    mockAgentSteps.map((s) => ({ ...s, status: 'pending' }))
  );
  const [currentStep, setCurrentStep] = useState(-1);
  const [customerNodeActive, setCustomerNodeActive] = useState(false);
  const [vendorStatuses, setVendorStatuses] = useState<Record<string, NodeStatus>>(
    Object.fromEntries(VENDOR_NODES.map((v) => [v.name, 'hidden']))
  );
  const logEndRef = useRef<HTMLDivElement>(null);

  // Progress through steps
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let stepIdx = 0;

    const advanceStep = () => {
      if (stepIdx >= mockAgentSteps.length) {
        timers.push(setTimeout(() => navigate('/customer/map'), 1500));
        return;
      }

      const step = mockAgentSteps[stepIdx];

      // Mark active
      setSteps((prev) =>
        prev.map((s, i) =>
          i === stepIdx ? { ...s, status: 'active' } : i < stepIdx ? { ...s, status: 'done' } : s
        )
      );
      setCurrentStep(stepIdx);

      // Trigger visual effects based on step
      if (step.id === 'spawn-customer') {
        setCustomerNodeActive(true);
      }
      if (step.agentType === 'vendor' && step.vendorName) {
        setVendorStatuses((prev) => ({ ...prev, [step.vendorName!]: 'activating' }));
      }
      if (step.id === 'negotiate') {
        setVendorStatuses((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key] === 'activating') next[key] = 'negotiating';
          }
          return next;
        });
      }
      if (step.id === 'rank' || step.id === 'done') {
        setVendorStatuses((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key] !== 'hidden') next[key] = 'done';
          }
          return next;
        });
      }

      stepIdx++;
      const delay = step.id === 'negotiate' ? 2000 : step.id === 'search' ? 1800 : 1200;
      timers.push(setTimeout(advanceStep, delay));
    };

    timers.push(setTimeout(advanceStep, 600));

    return () => timers.forEach(clearTimeout);
  }, [navigate]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentStep]);

  const progress = Math.round(
    (steps.filter((s) => s.status === 'done').length / steps.length) * 100
  );

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
              <h1 className="text-base font-semibold text-foreground">Agent Place</h1>
              {lastPrompt && (
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  &ldquo;{lastPrompt}&rdquo;
                </p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 font-mono text-xs">
            <Loader2 className="size-3 animate-spin" />
            {progress}%
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Main content: node graph + log */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left: Node visualization */}
        <div className="flex-1 relative flex items-center justify-center p-6 min-h-[350px]">
          {/* Background grid effect */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'radial-gradient(circle, currentColor 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Customer Agent — center node */}
          <div className="relative">
            {/* Glow ring */}
            <div
              className={cn(
                'absolute inset-0 rounded-full transition-all duration-1000',
                customerNodeActive
                  ? 'scale-[2.5] opacity-100'
                  : 'scale-100 opacity-0'
              )}
              style={{
                background: 'radial-gradient(circle, rgba(79,70,229,0.15) 0%, transparent 70%)',
              }}
            />

            {/* Center node */}
            <div
              className={cn(
                'relative z-10 size-20 rounded-full border-2 flex flex-col items-center justify-center gap-1 transition-all duration-500',
                customerNodeActive
                  ? 'border-primary bg-primary/20 shadow-lg shadow-primary/20'
                  : 'border-border bg-card'
              )}
            >
              <Sparkles
                className={cn(
                  'size-6 transition-colors duration-500',
                  customerNodeActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <span className="text-[9px] font-semibold text-foreground">YOUR AGENT</span>
            </div>

            {/* Vendor nodes */}
            {VENDOR_NODES.map((vendor, idx) => {
              const status = vendorStatuses[vendor.name];
              const rad = (vendor.angle * Math.PI) / 180;
              const radius = 140;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;

              return (
                <div key={vendor.name}>
                  {/* Connection line */}
                  {status !== 'hidden' && (
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
                        stroke={
                          status === 'done'
                            ? '#10B981'
                            : status === 'negotiating'
                            ? '#14B8A6'
                            : '#4F46E5'
                        }
                        strokeWidth={status === 'negotiating' ? 2 : 1.5}
                        strokeDasharray={status === 'done' ? 'none' : '6 6'}
                        opacity={status === 'done' ? 0.6 : 0.5}
                        className={
                          status === 'negotiating'
                            ? 'animate-[dash_1s_linear_infinite]'
                            : ''
                        }
                      />
                    </svg>
                  )}

                  {/* Vendor node */}
                  <div
                    className={cn(
                      'absolute z-10 flex flex-col items-center gap-1 transition-all duration-500',
                      status === 'hidden'
                        ? 'opacity-0 scale-50'
                        : 'opacity-100 scale-100'
                    )}
                    style={{
                      top: `calc(50% + ${y}px - 24px)`,
                      left: `calc(50% + ${x}px - 24px)`,
                    }}
                  >
                    <div
                      className={cn(
                        'size-12 rounded-full border-2 flex items-center justify-center transition-all duration-500',
                        status === 'done'
                          ? 'border-emerald-500 bg-emerald-500/20'
                          : status === 'negotiating'
                          ? 'border-teal-400 bg-teal-400/15 shadow-md shadow-teal-400/20'
                          : status === 'activating'
                          ? 'border-primary bg-primary/15'
                          : 'border-border bg-card'
                      )}
                    >
                      {status === 'done' ? (
                        <CheckCircle2 className="size-5 text-emerald-400" />
                      ) : status === 'negotiating' ? (
                        <Loader2 className="size-5 text-teal-400 animate-spin" />
                      ) : (
                        <Bot
                          className={cn(
                            'size-5 transition-colors',
                            status === 'activating'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          )}
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium text-center max-w-[80px] leading-tight">
                      {vendor.name.split(' ').slice(0, 2).join(' ')}
                    </span>
                    {status === 'negotiating' && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0 h-4 gap-0.5"
                      >
                        <Zap className="size-2.5" />
                        Negotiating
                      </Badge>
                    )}
                    {status === 'done' && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0 h-4 text-emerald-400"
                      >
                        Done
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Agent log */}
        <div className="lg:w-[400px] border-t lg:border-t-0 lg:border-l border-border/40 flex flex-col bg-card/30">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Agent Activity Log
            </span>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3 font-mono text-sm">
              {steps.map((step, i) => {
                if (step.status === 'pending') return null;
                const isActive = step.status === 'active';
                const isDone = step.status === 'done';

                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex gap-3 transition-opacity duration-300',
                      isActive ? 'opacity-100' : 'opacity-70'
                    )}
                  >
                    {/* Status icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {isActive ? (
                        <Loader2 className="size-4 text-primary animate-spin" />
                      ) : isDone ? (
                        <CheckCircle2 className="size-4 text-emerald-400" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-sm font-medium leading-tight',
                          isActive ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
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

      {/* CSS for dash animation */}
      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -12; }
        }
      `}</style>
    </div>
  );
}
