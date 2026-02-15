import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, ArrowLeft, Calendar, Wrench, TrendingUp, Star, Briefcase, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import { fetchJobsForVendor } from '@/lib/supabase-data';
import type { JobData } from '@/types';

export function VendorDashboard() {
  const navigate = useNavigate();
  const { selectedVendor, vendors, setSelectedVendor } = useApp();
  const vendor = selectedVendor;
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorJobs, setVendorJobs] = useState<JobData[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  useEffect(() => {
    if (!vendor) {
      setVendorJobs([]);
      return;
    }
    setJobsLoading(true);
    const jobIds = (vendor.job_ids ?? []).map((id: number | string) => Number(id));
    fetchJobsForVendor(
      vendor.vendor_id,
      jobIds.length > 0 ? jobIds : undefined
    )
      .then(setVendorJobs)
      .finally(() => setJobsLoading(false));
  }, [vendor?.vendor_id]);

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => {
      if (v.name.toLowerCase().includes(q)) return true;
      const serviceNames = (v.job_types ?? []).map((jt) => jt.type.toLowerCase()).join(' ');
      return serviceNames.includes(q) || (v.job_types ?? []).some((jt) => jt.type.toLowerCase().includes(q));
    });
  }, [vendors, vendorSearch]);

  const unfinishedCount = vendorJobs.filter((j) => (j.status ?? 0) < 7).length;

  const jobTypes = vendor?.job_types ?? [];
  const serviceStats = vendor
    ? jobTypes.map((jt) => {
        const typeMatch = (j: { type: string }) => {
          const a = (j.type || '').toLowerCase();
          const b = (jt.type || '').toLowerCase();
          return a === b || a.includes(b) || b.includes(a);
        };
        const completed = vendorJobs.filter(
          (j) => typeMatch(j) && (j.status ?? 0) >= 7
        );
        const totalRevenue = completed.reduce(
          (sum, j) => sum + (j.price ?? 0),
          0
        );
        return {
          type: jt.type,
          duration_minutes: jt.duration_minutes,
          price: jt.price,
          completed: completed.length,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
        };
      })
    : [];

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="px-6 py-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate('/')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <Wrench className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Vendor Portal</h1>
              <p className="text-xs text-muted-foreground">
                {vendor ? vendor.name : 'Select or create a vendor'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/vendor/calendar')}>
              <Calendar className="size-3.5" />
              Calendar
            </Button>
            {vendor && (
              <Button size="sm" className="gap-1.5" onClick={() => navigate('/vendor/edit')}>
                <Pencil className="size-3.5" />
                Edit vendor
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {!vendor && (
            <Card>
              <CardContent className="p-6 text-center space-y-4">
                <Wrench className="size-10 text-muted-foreground/30 mx-auto" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">No vendor selected</h2>
                  <p className="text-sm text-muted-foreground mt-1">Choose an existing vendor or create a new one.</p>
                </div>
                <Button onClick={() => navigate('/vendor/new')} className="gap-2">
                  <Plus className="size-4" />
                  Create new vendor
                </Button>
                {vendors.length > 0 && (
                  <div className="pt-4 border-t border-border/30 space-y-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Existing vendors</p>
                    <div className="max-w-md mx-auto relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="search"
                        placeholder="Search by name or service..."
                        value={vendorSearch}
                        onChange={(e) => setVendorSearch(e.target.value)}
                        className="pl-9 bg-muted/30 border-border"
                      />
                    </div>
                    <div className="grid gap-2 max-w-md mx-auto">
                      {filteredVendors.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">No vendors match your search.</p>
                      ) : (
                      filteredVendors.map((v) => (
                        <button
                          key={v.vendor_id}
                          type="button"
                          onClick={() => setSelectedVendor(v)}
                          className="w-full text-left px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{v.name}</p>
                            <p className="text-xs text-muted-foreground">{v.job_types.length} services</p>
                          </div>
                          {v.average_rating != null && Number(v.average_rating) > 0 && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Star className="size-3" />
                              {Number(v.average_rating).toFixed(1)}
                            </Badge>
                          )}
                        </button>
                      ))
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {vendor && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Briefcase className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{vendor.job_types.length}</p>
                        <p className="text-xs text-muted-foreground">Services offered</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <TrendingUp className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {jobsLoading ? '—' : unfinishedCount}
                        </p>
                        <p className="text-xs text-muted-foreground">Unfinished jobs</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Star className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {vendor.average_rating != null && Number(vendor.average_rating) > 0 ? Number(vendor.average_rating).toFixed(1) : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">Rating</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">Revenue per service</h2>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/vendor/edit')}>
                    <Pencil className="size-3.5" />
                    Edit vendor
                  </Button>
                </div>
                {vendor.job_types.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      No services yet. Edit vendor to add job types and availability.
                    </CardContent>
                  </Card>
                ) : jobsLoading ? (
                  <Card>
                    <CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading jobs…
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {vendor.job_types.map((jt, i) => {
                      const stat = serviceStats[i];
                      const total = stat?.totalRevenue ?? 0;
                      const completed = stat?.completed ?? 0;
                      return (
                        <Card key={i}>
                          <CardContent className="p-4 flex items-center justify-between gap-4">
                            <div>
                              <p className="font-medium text-foreground">{jt.type}</p>
                              <p className="text-sm text-muted-foreground">
                                {jt.duration_minutes} min · ${jt.price} listed
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-bold text-foreground">
                                ${total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {completed} job{completed !== 1 ? 's' : ''} completed
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border/20">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSelectedVendor(null)}>
                  Switch vendor
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
