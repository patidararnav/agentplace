import { useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, Calendar, Wrench, TrendingUp, Star, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';

export function VendorDashboard() {
  const navigate = useNavigate();
  const { selectedVendor, vendors, setSelectedVendor } = useApp();
  const vendor = selectedVendor;

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
            <Button size="sm" className="gap-1.5" onClick={() => navigate('/vendor/new-service')}>
              <Plus className="size-3.5" />
              New service
            </Button>
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
                  <div className="pt-4 border-t border-border/30 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Existing vendors</p>
                    <div className="grid gap-2 max-w-md mx-auto">
                      {vendors.map((v) => (
                        <button
                          key={v.vendor_id}
                          type="button"
                          onClick={() => setSelectedVendor(v)}
                          className="w-full text-left px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{v.name}</p>
                            <p className="text-xs text-muted-foreground">{v.job_types.length} services · {v.experience_years}yr exp</p>
                          </div>
                          {v.average_rating != null && Number(v.average_rating) > 0 && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Star className="size-3" />
                              {Number(v.average_rating).toFixed(1)}
                            </Badge>
                          )}
                        </button>
                      ))}
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
                        <p className="text-xs text-muted-foreground">Services</p>
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
                        <p className="text-2xl font-bold text-foreground">{vendor.experience_years}</p>
                        <p className="text-xs text-muted-foreground">Years experience</p>
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
                  <h2 className="text-lg font-semibold text-foreground">Services</h2>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/vendor/new-service')}>
                    <Plus className="size-3.5" />
                    Add service
                  </Button>
                </div>
                {vendor.job_types.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      No services yet. Add your first service to start receiving jobs.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {vendor.job_types.map((jt, i) => (
                      <Card key={i}>
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{jt.type}</p>
                            <p className="text-sm text-muted-foreground">{jt.duration_minutes} min · Max {vendor.max_distance_miles} mi</p>
                          </div>
                          <p className="text-lg font-bold text-foreground">${jt.price}</p>
                        </CardContent>
                      </Card>
                    ))}
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
