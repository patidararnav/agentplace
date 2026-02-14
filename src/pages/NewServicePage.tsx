import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Bot, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function NewServicePage() {
  const navigate = useNavigate();

  const [serviceName, setServiceName] = useState("");
  const [jobType, setJobType] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    setSubmitted(true);
    setTimeout(() => navigate("/vendor"), 1500);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            Service Created!
          </h2>
          <p className="text-muted-foreground">
            Your vendor agent is now active and ready to negotiate.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Bot className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-sm text-primary font-medium">
              Agent spinning up&hellip;
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/vendor")}
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground leading-tight">
                Agent Place
              </h1>
              <p className="text-xs text-muted-foreground">New Service</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Service Name */}
        <div className="space-y-2">
          <Label htmlFor="service-name">Service Name</Label>
          <Input
            id="service-name"
            placeholder="e.g. Standard Plumbing Repair"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
        </div>

        {/* Job Type */}
        <div className="space-y-2">
          <Label htmlFor="job-type">Job Type</Label>
          <Input
            id="job-type"
            placeholder="e.g. Plumbing, Electrical, Cleaning"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
          />
        </div>

        <Separator />

        {/* Hourly Rate */}
        <div className="space-y-2">
          <Label htmlFor="hourly-rate">Hourly Rate</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              id="hourly-rate"
              type="number"
              placeholder="0"
              className="pl-7"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <Label htmlFor="duration">Duration (minutes)</Label>
          <Input
            id="duration"
            type="number"
            placeholder="e.g. 60"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
        </div>

        {/* Submit */}
        <Button className="w-full h-12 text-base" onClick={handleSubmit}>
          <Bot className="h-5 w-5 mr-2" />
          Create service
        </Button>
      </main>
    </div>
  );
}
