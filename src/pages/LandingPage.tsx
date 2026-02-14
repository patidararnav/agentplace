import { useNavigate } from "react-router-dom";
import { Search, Wrench, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto text-center space-y-6 mb-16">
          <div className="inline-flex items-center gap-2 text-muted-foreground mb-4">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            <span className="text-sm font-medium tracking-wide uppercase">
              TreeHacks 2026
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
            Agent Place
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            AI agents that negotiate, book, and pay — so you don&apos;t have to.
          </p>
        </div>

        {/* Cards */}
        <div className="grid sm:grid-cols-2 gap-6 w-full max-w-4xl mx-auto">
          <Card
            className={cn(
              "cursor-pointer transition-all duration-200 h-full",
              "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5",
              "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background"
            )}
            onClick={() => navigate("/customer")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/customer");
              }
            }}
            tabIndex={0}
            role="button"
          >
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Search className="h-6 w-6" aria-hidden />
                </div>
                <CardTitle className="text-xl">I need a service</CardTitle>
              </div>
              <CardDescription className="text-base text-muted-foreground leading-relaxed">
                Describe what you need in plain English. Your personal agent will
                find vendors, negotiate the best price, and book it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary">
                Get started →
              </span>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all duration-200 h-full",
              "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5",
              "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background"
            )}
            onClick={() => navigate("/vendor")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/vendor");
              }
            }}
            tabIndex={0}
            role="button"
          >
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Wrench className="h-6 w-6" aria-hidden />
                </div>
                <CardTitle className="text-xl">I&apos;m a vendor</CardTitle>
              </div>
              <CardDescription className="text-base text-muted-foreground leading-relaxed">
                List your services and let your agent handle negotiations,
                scheduling, and payments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary">
                Get started →
              </span>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-sm text-muted-foreground/80">
          Powered by agentic AI
        </p>
      </footer>
    </div>
  );
}
