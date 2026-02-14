import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { updateVendor } from "@/lib/supabase-data";
import { useApp } from "@/context/AppContext";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const defaultWeekly: Record<string, string[] | null> = Object.fromEntries(
  DAYS.map((d) => [d, ["09:00", "17:00"]])
);

type JobTypeRow = { type: string; price: string; duration_minutes: string };

function vendorToFormState(v: { name: string; max_distance_miles: number; home_location: { lat: number; lng: number }; experience_years: number; negotiation_aggression: number; weekly_availability: Record<string, string[] | null>; job_types: { type: string; price: number; duration_minutes: number }[] }) {
  const weekly = { ...defaultWeekly, ...(v.weekly_availability || {}) };
  const jobTypes: JobTypeRow[] =
    v.job_types?.length > 0
      ? v.job_types.map((jt) => ({
          type: jt.type,
          price: String(jt.price),
          duration_minutes: String(jt.duration_minutes),
        }))
      : [{ type: "", price: "", duration_minutes: "" }];
  return {
    name: v.name ?? "",
    maxDistanceMiles: String(v.max_distance_miles ?? 25),
    lat: String(v.home_location?.lat ?? "37.7749"),
    lng: String(v.home_location?.lng ?? "-122.4194"),
    experienceYears: String(v.experience_years ?? 5),
    negotiationAggression: String(v.negotiation_aggression ?? 1),
    weekly,
    jobTypes,
  };
}

export function EditVendorPage() {
  const navigate = useNavigate();
  const { selectedVendor, setSelectedVendor, refetchVendors } = useApp();

  const [name, setName] = useState("");
  const [maxDistanceMiles, setMaxDistanceMiles] = useState("25");
  const [lat, setLat] = useState("37.7749");
  const [lng, setLng] = useState("-122.4194");
  const [experienceYears, setExperienceYears] = useState("5");
  const [negotiationAggression, setNegotiationAggression] = useState("1");
  const [weekly, setWeekly] = useState<Record<string, string[] | null>>(defaultWeekly);
  const [jobTypes, setJobTypes] = useState<JobTypeRow[]>([{ type: "", price: "", duration_minutes: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!selectedVendor) {
      navigate("/vendor", { replace: true });
      return;
    }
    const s = vendorToFormState(selectedVendor);
    setName(s.name);
    setMaxDistanceMiles(s.maxDistanceMiles);
    setLat(s.lat);
    setLng(s.lng);
    setExperienceYears(s.experienceYears);
    setNegotiationAggression(s.negotiationAggression);
    setWeekly(s.weekly);
    setJobTypes(s.jobTypes);
    setInitialized(true);
  }, [selectedVendor, navigate]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVendor) return;
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

    const payload = {
      name: trimName,
      max_distance_miles: Number(maxDistanceMiles) || 25,
      home_location: { lat: Number(lat) || 0, lng: Number(lng) || 0 },
      experience_years: Number(experienceYears) || 0,
      negotiation_aggression: Number(negotiationAggression) || 1,
      weekly_availability: weekly,
      job_types: jobTypesPayload,
      job_ids: selectedVendor.job_ids ?? [],
      reviews: selectedVendor.reviews ?? [],
      average_rating: selectedVendor.average_rating,
      total_ratings: selectedVendor.total_ratings,
    };

    setSubmitting(true);
    const updated = await updateVendor(selectedVendor.vendor_id, payload);
    setSubmitting(false);
    if (!updated) {
      setError("Failed to update vendor. Check Supabase table and RLS.");
      return;
    }

    await refetchVendors();
    setSelectedVendor(updated);
    navigate("/vendor");
  }

  if (!selectedVendor || !initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/vendor")} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Edit vendor</h1>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lat">Home latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="lng">Home longitude</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                  />
                </div>
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
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
