import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Bot, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const JOB_TYPES = [
  "Plumbing",
  "Electrical",
  "Cleaning",
  "Painting",
  "HVAC",
  "Landscaping",
  "Carpentry",
  "Roofing",
  "Moving",
  "General Repair",
];

const DAYS = [
  { key: "monday", label: "Mon", hours: "9:00 AM - 5:00 PM" },
  { key: "tuesday", label: "Tue", hours: "9:00 AM - 5:00 PM" },
  { key: "wednesday", label: "Wed", hours: "9:00 AM - 5:00 PM" },
  { key: "thursday", label: "Thu", hours: "9:00 AM - 5:00 PM" },
  { key: "friday", label: "Fri", hours: "9:00 AM - 5:00 PM" },
  { key: "saturday", label: "Sat", hours: "10:00 AM - 2:00 PM" },
];

export function NewServicePage() {
  const navigate = useNavigate();

  const [serviceName, setServiceName] = useState("");
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState("");
  const [maxDistance, setMaxDistance] = useState([25]);
  const [experienceYears, setExperienceYears] = useState("");
  const [flexibility, setFlexibility] = useState([5]);
  const [availability, setAvailability] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        DAYS.map((d) => [d.key, d.key !== "saturday"])
      )
  );
  const [submitted, setSubmitted] = useState(false);

  function toggleJobType(type: string) {
    setSelectedJobTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function toggleDay(key: string) {
    setAvailability((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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

        {/* Job Types */}
        <div className="space-y-3">
          <Label>Job Types</Label>
          <div className="flex flex-wrap gap-2">
            {JOB_TYPES.map((type) => {
              const selected = selectedJobTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleJobType(type)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {type}
                </button>
              );
            })}
          </div>
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

        {/* Max Distance */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Max Distance Willing to Travel</Label>
            <span className="text-sm font-medium text-foreground">
              {maxDistance[0]} miles
            </span>
          </div>
          <Slider
            value={maxDistance}
            onValueChange={setMaxDistance}
            min={5}
            max={50}
            step={1}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>5 mi</span>
            <span>50 mi</span>
          </div>
        </div>

        {/* Experience Years */}
        <div className="space-y-2">
          <Label htmlFor="experience">Experience (years)</Label>
          <Input
            id="experience"
            type="number"
            placeholder="0"
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
          />
        </div>

        <Separator />

        {/* Negotiation Flexibility */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Negotiation Flexibility</Label>
            <span className="text-sm font-medium text-foreground">
              {flexibility[0]}/10
            </span>
          </div>
          <Slider
            value={flexibility}
            onValueChange={setFlexibility}
            min={1}
            max={10}
            step={1}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Firm on price</span>
            <span>Very flexible</span>
          </div>
        </div>

        <Separator />

        {/* Weekly Availability */}
        <div className="space-y-4">
          <Label>Weekly Availability</Label>
          <Card>
            <CardContent className="pt-4 space-y-1">
              {DAYS.map((day, idx) => (
                <div key={day.key}>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={availability[day.key]}
                        onCheckedChange={() => toggleDay(day.key)}
                      />
                      <span
                        className={cn(
                          "font-medium text-sm w-8",
                          availability[day.key]
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {day.label}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-sm",
                        availability[day.key]
                          ? "text-muted-foreground"
                          : "text-muted-foreground/40"
                      )}
                    >
                      {day.hours}
                    </span>
                  </div>
                  {idx < DAYS.length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Submit */}
        <Button className="w-full h-12 text-base" onClick={handleSubmit}>
          <Bot className="h-5 w-5 mr-2" />
          Create service &amp; activate agent
        </Button>
      </main>
    </div>
  );
}
