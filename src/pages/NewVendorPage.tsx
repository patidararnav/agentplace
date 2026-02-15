import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { insertVendor } from "@/lib/supabase-data";
import { geocodeAddress } from "@/lib/geocode";
import { useApp } from "@/context/AppContext";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const defaultWeekly: Record<string, string[] | null> = Object.fromEntries(
  DAYS.map((d) => [d, null])
);

type JobTypeRow = { type: string; price: string; duration_minutes: string };

export function NewVendorPage() {
  const navigate = useNavigate();
  const { setSelectedVendor, refetchVendors, vendors } = useApp();

  const [name, setName] = useState("");
  const [maxDistanceMiles, setMaxDistanceMiles] = useState("25");
  const [address, setAddress] = useState("");
  const [experienceYears, setExperienceYears] = useState("5");
  const [negotiationAggression, setNegotiationAggression] = useState("1");
  const [weekly, setWeekly] = useState<Record<string, string[] | null>>(defaultWeekly);
  const [jobTypes, setJobTypes] = useState<JobTypeRow[]>([
    { type: "", price: "", duration_minutes: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function addJobType() {
    setJobTypes((prev) => [...prev, { type: "", price: "", duration_minutes: "" }]);
  }

  function removeJobType(i: number) {
    setJobTypes((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateJobType(i: number, field: keyof JobTypeRow, value: string) {
    setJobTypes((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row))
    );
  }

  function setDayHours(day: string, value: string) {
    if (!value.trim()) {
      setWeekly((prev) => ({ ...prev, [day]: null }));
      return;
    }
    const parts = value.split("-").map((s) => s.trim());
    if (parts.length >= 2) setWeekly((prev) => ({ ...prev, [day]: [parts[0], parts[1]] }));
  }

  function fillDemo() {
    setName("QuickFix Plumbing");
    setMaxDistanceMiles("30");
    setAddress("450 Serra Mall, Stanford, CA 94305");
    setExperienceYears("8");
    setNegotiationAggression("2");
    setWeekly({
      monday: ["08:00", "18:00"],
      tuesday: ["08:00", "18:00"],
      wednesday: ["08:00", "18:00"],
      thursday: ["08:00", "18:00"],
      friday: ["08:00", "18:00"],
      saturday: ["09:00", "14:00"],
      sunday: null,
    });
    setJobTypes([
      { type: "Plumbing Repair", price: "150", duration_minutes: "90" },
      { type: "Drain Cleaning", price: "180", duration_minutes: "60" },
      { type: "Pipe Leak Fix", price: "220", duration_minutes: "120" },
    ]);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimName = name.trim();
    if (!trimName) {
      setError("Vendor name is required.");
      return;
    }

    const validJobTypes = jobTypes.filter(
      (r) => r.type.trim() && r.price.trim() && r.duration_minutes.trim()
    );
    const jobTypesPayload = validJobTypes.map((r) => ({
      type: r.type.trim(),
      price: Number(r.price) || 0,
      duration_minutes: Number(r.duration_minutes) || 60,
    }));
    if (jobTypesPayload.length === 0) {
      setError("Add at least one job type with type, price, and duration.");
      return;
    }

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setError("Home address is required.");
      return;
    }

    setSubmitting(true);
    const location = await geocodeAddress(trimmedAddress);
    if (!location) {
      setSubmitting(false);
      setError("Could not find that address. Try a full address (e.g. street, city, state/country).");
      return;
    }

    const nextId = vendors.length > 0
      ? Math.max(...vendors.map((v) => v.vendor_id)) + 1
      : 1;
    const payload = {
      vendor_id: nextId,
      name: trimName,
      max_distance_miles: Number(maxDistanceMiles) || 25,
      home_location: { lat: location.lat, lng: location.lng },
      experience_years: Number(experienceYears) || 0,
      negotiation_aggression: Number(negotiationAggression) || 1,
      weekly_availability: weekly,
      job_types: jobTypesPayload,
      job_ids: [],
      reviews: [],
      average_rating: 0,
      total_ratings: 0,
    };

    const created = await insertVendor(payload);
    if (!created) {
      setSubmitting(false);
      setError("Failed to create vendor in browser storage.");
      return;
    }

    // Also register a vendor agent on the backend
    try {
      const agentRes = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimName,
          services: jobTypesPayload.map((jt) => jt.type.toLowerCase()),
          base_prices: Object.fromEntries(
            jobTypesPayload.map((jt) => [jt.type.toLowerCase(), jt.price])
          ),
          aggression: Number(negotiationAggression) || 1,
        }),
      });
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        console.log("[NewVendorPage] Vendor agent registered:", agentData);
      } else {
        console.warn("[NewVendorPage] Backend agent registration failed (non-critical):", agentRes.status);
      }
    } catch (err) {
      // Agent registration is non-critical — vendor is already saved locally
      console.warn("[NewVendorPage] Backend agent registration error:", err);
    }

    setSubmitting(false);
    await refetchVendors();
    setSelectedVendor(created);
    navigate("/vendor");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/vendor")} aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-foreground">New vendor</h1>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={fillDemo} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            Fill demo
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-2">
              {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Vendor name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. QuickFix Plumbing"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="max_distance">Max distance (miles)</Label>
                  <Input
                    id="max_distance"
                    type="number"
                    min={1}
                    value={maxDistanceMiles}
                    onChange={(e) => setMaxDistanceMiles(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="experience">Experience (years)</Label>
                  <Input
                    id="experience"
                    type="number"
                    min={0}
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="address">Home address</Label>
                <Input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 123 Main St, San Francisco, CA"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  We’ll look up the location to get coordinates for matching.
                </p>
              </div>
              <div>
                <Label htmlFor="negotiation">Negotiation aggression (1–5)</Label>
                <Input
                  id="negotiation"
                  type="number"
                  min={1}
                  max={5}
                  value={negotiationAggression}
                  onChange={(e) => setNegotiationAggression(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly availability</CardTitle>
              <p className="text-sm text-muted-foreground">
                Format: start-end (e.g. 09:00-17:00). Leave empty for unavailable.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center gap-2">
                  <Label className="w-28 capitalize">{day}</Label>
                  <Input
                    placeholder="09:00-17:00"
                    value={
                      weekly[day] && weekly[day]?.length === 2
                        ? `${weekly[day]![0]}-${weekly[day]![1]}`
                        : ""
                    }
                    onChange={(e) => setDayHours(day, e.target.value)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Job types</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addJobType}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobTypes.map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Type (e.g. Plumbing Repair)"
                    className="flex-1 min-w-[140px]"
                    value={row.type}
                    onChange={(e) => updateJobType(i, "type", e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    className="w-24"
                    value={row.price}
                    onChange={(e) => updateJobType(i, "price", e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Mins"
                    className="w-20"
                    value={row.duration_minutes}
                    onChange={(e) => updateJobType(i, "duration_minutes", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeJobType(i)}
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate("/vendor")}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create vendor"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
