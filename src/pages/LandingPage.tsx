import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Wrench, Shield, Zap, Brain, CreditCard, Star } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';

const AGENT_FEATURES = [
  { icon: Brain, label: 'Smart Matching', desc: 'AI finds the best vendors for your exact needs' },
  { icon: Zap, label: 'Auto-Negotiation', desc: 'Agents negotiate price, scope, and schedule' },
  { icon: Shield, label: 'Secure Escrow', desc: 'Payment held safely until the job is done' },
  { icon: CreditCard, label: 'End-to-End', desc: 'From discovery to payment to review — automated' },
  { icon: Star, label: 'Quality Ranked', desc: 'Vendors scored by reliability, skill, and reviews' },
];

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-12 w-12" />
          <span className="text-base font-semibold tracking-tight text-foreground">
            AgentPlace
          </span>
        </div>
        <button
          onClick={() => navigate('/vendor')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <Wrench className="size-3.5" />
          Vendor Portal
        </button>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3" />
            Powered by 8 specialized AI agents
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
            Describe it.{' '}
            <span className="text-primary">We handle the rest.</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Tell us what you need in plain English. Our AI agents find vendors,
            negotiate the best price, book the job, handle payment, and track
            everything — so you don't have to.
          </p>

          <Button
            size="lg"
            className="rounded-xl text-base font-medium gap-2 px-8 h-12"
            onClick={() => navigate('/customer')}
          >
            Get started
            <ArrowRight className="size-4" />
          </Button>
        </div>

        {/* Feature pills */}
        <div className="mt-16 max-w-3xl mx-auto">
          <div className="flex flex-wrap justify-center gap-3">
            {AGENT_FEATURES.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/50 px-4 py-2.5"
              >
                <f.icon className="size-4 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground leading-tight">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-border/30">
        <p className="text-xs text-muted-foreground/60">
          TreeHacks 2026 · Discovery → Negotiation → Booking → Payment → Fulfillment → Reviews
        </p>
      </footer>
    </div>
  );
}
