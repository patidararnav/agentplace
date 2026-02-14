import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Plus, Calendar, Bot, ArrowLeft, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

const JOB_STATUS_LABELS: Record<number, string> = {
  1: "Concierge",
  2: "Matching",
  3: "Negotiating",
  4: "Ranking",
  5: "Booked",
  6: "In progress",
  7: "Completed",
  8: "Payment sent",
  9: "Payment received",
};

export function VendorDashboard() {
  const navigate = useNavigate();
  const { vendors, jobs, selectedVendor, setSelectedVendor, dataLoading, dataError } = useApp();
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");

  const filteredVendors = vendorSearch.trim()
    ? vendors.filter((v) =>
        v.name.toLowerCase().includes(vendorSearch.toLowerCase())
      )
    : vendors;
  const sortedVendors = [...filteredVendors].sort((a, b) => b.vendor_id - a.vendor_id);

  const vendorJobs = selectedVendor
    ? jobs.filter((j) => j.vendor_id === selectedVendor.vendor_id)
    : [];
  const totalBookings =
    selectedVendor?.job_ids?.length ?? vendorJobs.length;
  const activeNegotiations = vendorJobs.filter((j) => j.status === 2 || j.status === 3);
  const jobTypes = selectedVendor?.job_types ?? [];
  const jobCountByType = selectedVendor
    ? Object.fromEntries(
        jobTypes.map((jt) => [
          jt.type,
          vendorJobs.filter((j) => j.type === jt.type).length,
        ])
      )
    : {};

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              aria-label="Back to home"
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
                <p className="text-xs text-muted-foreground">Vendor Portal</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setVendorOpen(true)}
            >
              <User className="h-4 w-4 mr-1.5" />
              {selectedVendor ? selectedVendor.name : "Choose vendor"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/vendor/calendar")}
            >
              <Calendar className="h-4 w-4 mr-1.5" />
              My calendar
            </Button>
            <Button size="sm" onClick={() => navigate("/vendor/new-service")}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add new service
            </Button>
          </div>
        </div>
      </header>

      {/* Vendor picker dialog */}
      <Dialog open={vendorOpen} onOpenChange={setVendorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Search by name..."
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              className="w-full"
            />
            {dataError?.vendors && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 space-y-1">
                <p className="font-medium">Could not load vendors</p>
                <p className="text-xs">{dataError.vendors}</p>
                <p className="text-xs opacity-90">Check table name (VendorData), RLS policies, and SUPABASE_SETUP.md.</p>
              </div>
            )}
            {dataLoading ? (
              <p className="text-sm text-muted-foreground">Loading vendors…</p>
            ) : sortedVendors.length === 0 && !dataError?.vendors ? (
              <div className="text-sm text-muted-foreground py-4 text-center space-y-1">
                <p>No vendors loaded. You have data in Supabase?</p>
                <p className="text-xs">If yes, RLS may be blocking SELECT. Run in SQL Editor: ALTER TABLE public.&quot;VendorData&quot; DISABLE ROW LEVEL SECURITY;</p>
              </div>
            ) : sortedVendors.length === 0 ? null : (
              <div className="max-h-[200px] overflow-auto space-y-1">
                {sortedVendors.slice(0, 50).map((v) => (
                  <button
                    key={v.vendor_id}
                    type="button"
                    onClick={() => {
                      setSelectedVendor(v);
                      setVendorOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                      selectedVendor?.vendor_id === v.vendor_id
                        ? "bg-primary/15 text-primary font-medium"
                        : "hover:bg-muted"
                    )}
                  >
                    {v.name}
                    {v.job_ids && v.job_ids.length > 0 && (
                      <span className="text-muted-foreground ml-2">
                        ({v.job_ids.length} jobs)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setVendorOpen(false);
                navigate("/vendor/new");
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create new vendor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {!selectedVendor ? (
          <div className="rounded-xl border border-border bg-muted/30 p-12 text-center">
            <p className="text-muted-foreground font-medium">
              Choose a vendor above to view the dashboard.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Click &ldquo;Choose vendor&rdquo; and pick one from the list or create a new one.
            </p>
          </div>
        ) : (
          <>
            {/* Stats Row — from selected vendor Supabase data */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Services</p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {jobTypes.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Total Bookings</p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {totalBookings}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Active Negotiations
                  </p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {activeNegotiations.length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Services — from selectedVendor.job_types */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">
                Your Services
              </h2>
              {jobTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No service types defined.</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobTypes.map((jt, idx) => (
                    <Card key={`${jt.type}-${idx}`}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold leading-snug">
                          {jt.type}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Price</span>
                          <span className="font-medium text-foreground">
                            ${jt.price}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Duration</span>
                          <span className="font-medium text-foreground">
                            {jt.duration_minutes} min
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Bookings</span>
                          <span className="font-medium text-foreground">
                            {jobCountByType[jt.type] ?? 0}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* Active Negotiations — jobs with status 2 or 3 for this vendor */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">
                  Active Negotiations
                </h2>
              </div>
              {activeNegotiations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active negotiations.</p>
              ) : (
                <div className="space-y-3">
                  {activeNegotiations.map((job) => (
                    <Card key={job.job_id}>
                      <CardContent className="pt-5 pb-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {job.type} — {job.consumer_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {job.date} {job.start_time}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 ml-3">
                            {JOB_STATUS_LABELS[job.status] ?? `Status ${job.status}`}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">
                          <span>${job.price} · {job.duration_minutes} min</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
