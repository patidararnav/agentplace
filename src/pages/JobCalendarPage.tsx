import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Sparkles, ArrowLeft } from 'lucide-react';
import { JobDetailModal } from '@/components/JobDetailModal';
import type { PlannedJob } from '@/types';
import type { JobData } from '@/types';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { fetchJobsForCustomer } from '@/lib/supabase-data';
import { cn, getStatusColorClasses } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export function JobCalendarPage() {
  const navigate = useNavigate();
  const { selectedCustomer, vendors } = useApp();
  const [calendarJobs, setCalendarJobs] = useState<JobData[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedJob, setSelectedJob] = useState<PlannedJob | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const vendorIdToName = useMemo(() => {
    const map: Record<number, string> = {};
    for (const v of vendors) map[v.vendor_id] = v.name;
    return map;
  }, [vendors]);

  const consumerJobs = useMemo(() => {
    return calendarJobs.map((j) =>
      jobDataToPlannedJob(j, vendorIdToName[j.vendor_id] ?? 'Vendor')
    );
  }, [calendarJobs, vendorIdToName]);

  const jobsByDate = useMemo(() => {
    const map: Record<string, PlannedJob[]> = {};
    for (const job of consumerJobs) {
      const dateKey = job.dateTime.split('T')[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(job);
    }
    return map;
  }, [consumerJobs]);

  const jobsForSelectedDay = useMemo(() => {
    if (!selectedDateKey) return [];
    return jobsByDate[selectedDateKey] ?? [];
  }, [selectedDateKey, jobsByDate]);

  const pollIntervalMs = 5000;
  const isInitialFetch = useRef(true);

  useEffect(() => {
    if (!selectedCustomer) {
      setCalendarJobs([]);
      return;
    }
    isInitialFetch.current = true;
    const fetch = () => {
      if (isInitialFetch.current) {
        setJobsLoading(true);
        isInitialFetch.current = false;
      }
      fetchJobsForCustomer(selectedCustomer.consumer_name)
        .then(setCalendarJobs)
        .finally(() => setJobsLoading(false));
    };
    fetch();
    const interval = setInterval(fetch, pollIntervalMs);
    return () => clearInterval(interval);
  }, [selectedCustomer]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

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
      setSelectedJob((prev) => (prev?.id === jobs[0].id ? null : jobs[0]));
    } else {
      setSelectedJob(null);
    }
  }

  async   function handleTrackJob(job: PlannedJob) {
    navigate('/customer/tracking', { state: { job, fromCalendar: true } });
  }

  if (!selectedCustomer) {
    return (
      <div className="min-h-svh bg-background flex flex-col">
        <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate('/')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Your jobs</h1>
              <p className="text-xs text-muted-foreground">Choose a customer on the home page to see their calendar.</p>
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <p className="text-muted-foreground text-center">
            Select a customer from the home page to view their job calendar.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate('/')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Your jobs</h1>
            <p className="text-xs text-muted-foreground">
              {selectedCustomer.consumer_name} · {consumerJobs.length} job{consumerJobs.length !== 1 ? 's' : ''}
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
                        key={job.id}
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs truncate',
                          getStatusColorClasses(job.status)
                        )}
                      >
                        {job.vendorName}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

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
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJob((prev) => (prev?.id === job.id ? null : job))}
                  className="w-full text-left rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors"
                >
                  <p className="font-medium text-foreground">{job.jobType}</p>
                  <p className="text-sm text-muted-foreground">{job.vendorName}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    at {new Date(job.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · $
                    {job.price} · {job.durationMinutes} min
                  </p>
                </button>
              ))}
          </section>
        </div>
      </main>

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onTrackJob={handleTrackJob}
        />
      )}
    </div>
  );
}
