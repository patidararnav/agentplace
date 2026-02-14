import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, Wrench, Clock, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useApp } from '@/context/AppContext';
import { fetchJobsForVendor } from '@/lib/supabase-data';
import type { JobData, PlannedJob } from '@/types';
import { cn, getStatusColorClasses, getStatusTextColorClass } from '@/lib/utils';

function jobDataToPlannedJob(job: JobData, vendorName: string): PlannedJob {
  const dateTime =
    job.date && job.start_time
      ? `${job.date}T${job.start_time}`
      : `${job.date}T09:00`;
  return {
    id: String(job.job_id),
    vendorName,
    customerName: job.consumer_name,
    jobType: job.type,
    price: job.price,
    dateTime,
    durationMinutes: job.duration_minutes,
    vendorId: job.vendor_id,
    status: job.status,
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const JOB_STATUS_LABELS: Record<number, string> = {
  1: 'Concierge',
  2: 'Matching',
  3: 'Negotiating',
  4: 'Ranking',
  5: 'Booked',
  6: 'In progress',
  7: 'Project completed',
  8: 'Payment sent',
  9: 'Payment received',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function VendorCalendarPage() {
  const navigate = useNavigate();
  const { selectedVendor } = useApp();
  const [calendarJobs, setCalendarJobs] = useState<JobData[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);

  const jobsByDate = useMemo(() => {
    const map: Record<string, JobData[]> = {};
    for (const job of calendarJobs) {
      const dateKey = job.date ?? '';
      if (!dateKey) continue;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(job);
    }
    return map;
  }, [calendarJobs]);

  const jobsForSelectedDay = useMemo(() => {
    if (!selectedDateKey) return [];
    return jobsByDate[selectedDateKey] ?? [];
  }, [selectedDateKey, jobsByDate]);

  useEffect(() => {
    if (!selectedVendor) {
      setCalendarJobs([]);
      return;
    }
    setJobsLoading(true);
    const jobIds = (selectedVendor.job_ids ?? []).map((id) => Number(id));
    fetchJobsForVendor(
      selectedVendor.vendor_id,
      jobIds.length > 0 ? jobIds : undefined
    )
      .then(setCalendarJobs)
      .finally(() => setJobsLoading(false));
  }, [selectedVendor]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startPad = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const today = new Date();
  const isToday = (day: number) =>
    year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  function handleDayClick(day: number) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDateKey(dateKey);
    const jobs = jobsByDate[dateKey];
    if (jobs && jobs.length > 0) {
      setSelectedJob((prev) => (prev && jobs.some((j) => j.job_id === prev.job_id) ? null : jobs[0]));
    } else {
      setSelectedJob(null);
    }
  }

  if (!selectedVendor) {
    return (
      <div className="min-h-svh bg-background flex flex-col">
        <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate('/vendor')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <Wrench className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Vendor Calendar</h1>
              <p className="text-xs text-muted-foreground">Select a vendor from the dashboard first.</p>
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <p className="text-muted-foreground text-center">
            Select a vendor from the dashboard to view their calendar.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate('/vendor')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Wrench className="size-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Vendor Calendar</h1>
            <p className="text-xs text-muted-foreground">
              {selectedVendor.name} · {calendarJobs.length} job{calendarJobs.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1))}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">
              {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1))}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (d === null) return <div key={`e-${i}`} />;
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dayJobs = jobsByDate[dateKey] ?? [];
              const hasJobs = dayJobs.length > 0;
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => handleDayClick(d)}
                  className={cn(
                    'min-h-[88px] rounded-lg border p-2 flex flex-col transition-colors text-left',
                    hasJobs ? 'border-primary/20 bg-card hover:border-primary/40' : 'border-border/40 bg-card/40',
                    isToday(d) && 'ring-1 ring-primary/50',
                    selectedDateKey === dateKey && 'ring-2 ring-primary ring-offset-1'
                  )}
                >
                  <span
                    className={cn(
                      'text-sm',
                      isToday(d) ? 'font-bold text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {d}
                  </span>
                  <div className="mt-1 space-y-1 overflow-hidden">
                    {dayJobs.map((job) => (
                      <div
                        key={job.job_id}
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs truncate',
                          getStatusColorClasses(job.status)
                        )}
                      >
                        {job.consumer_name || job.type}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedJob && (
            <>
              <Card className="border-primary/20">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-foreground">{selectedJob.type}</h3>
                      <p className="text-sm text-muted-foreground">{selectedJob.consumer_name}</p>
                    </div>
                    <span className={cn('shrink-0', getStatusTextColorClass(selectedJob.status))}>
                      {JOB_STATUS_LABELS[selectedJob.status ?? 0] ?? `Status ${selectedJob.status ?? '—'}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        {selectedJob.date && selectedJob.start_time
                          ? formatTime(`${selectedJob.date}T${selectedJob.start_time}`)
                          : selectedJob.date}{' '}
                        · {selectedJob.duration_minutes} min
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DollarSign className="h-4 w-4 shrink-0" />
                      <span>${selectedJob.price}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground/70">
                    {selectedJob.date &&
                      new Date(selectedJob.date + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                  </p>
                  <Button
                    className="w-full gap-2"
                    variant="secondary"
                    onClick={() => {
                      const planned = jobDataToPlannedJob(selectedJob, selectedVendor.name);
                      navigate('/vendor/tracking', { state: { job: planned, fromCalendar: true } });
                    }}
                  >
                    Track job &amp; update status
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {selectedDateKey
                ? `Jobs for ${new Date(selectedDateKey + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : 'Jobs for selected day'}
            </h3>
            {!selectedDateKey && (
              <p className="text-sm text-muted-foreground">Click a day on the calendar to see jobs.</p>
            )}
            {selectedDateKey && jobsLoading && (
              <p className="text-sm text-muted-foreground">Loading jobs…</p>
            )}
            {selectedDateKey && !jobsLoading && jobsForSelectedDay.length === 0 && (
              <p className="text-sm text-muted-foreground">No jobs scheduled for this day.</p>
            )}
            {selectedDateKey &&
              !jobsLoading &&
              jobsForSelectedDay.map((job) => (
                <Card
                  key={job.job_id}
                  className={cn(
                    'cursor-pointer transition-colors hover:border-primary/30',
                    selectedJob?.job_id === job.job_id && 'border-primary'
                  )}
                  onClick={() => setSelectedJob((prev) => (prev?.job_id === job.job_id ? null : job))}
                >
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm text-foreground">{job.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.consumer_name} · {job.date && job.start_time ? formatTime(`${job.date}T${job.start_time}`) : job.date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm text-foreground">${job.price}</p>
                      <p className="text-xs text-muted-foreground">{job.duration_minutes} min</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </section>
        </div>
      </main>
    </div>
  );
}
