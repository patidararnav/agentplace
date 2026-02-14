import { useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { mockPlannedJobs } from '@/data/mock';
import { JobDetailModal } from '@/components/JobDetailModal';
import type { PlannedJob } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function JobCalendarPage() {
  const [viewDate, setViewDate] = useState(new Date(2025, 1, 1));
  const [selectedJob, setSelectedJob] = useState<PlannedJob | null>(null);

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
    year === today.getFullYear() &&
    month === today.getMonth() &&
    day === today.getDate();

  const getJobsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return mockPlannedJobs.filter((j) => j.dateTime.startsWith(dateStr));
  };

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Your jobs</h1>
            <p className="text-xs text-muted-foreground">
              {mockPlannedJobs.length} upcoming
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewDate(new Date(year, month - 1))}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">
              {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewDate(new Date(year, month + 1))}
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-muted-foreground py-2"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (d === null) return <div key={`e-${i}`} />;
              const jobs = getJobsForDay(d);
              const hasJobs = jobs.length > 0;

              return (
                <div
                  key={`${year}-${month}-${d}`}
                  className={cn(
                    'min-h-[88px] rounded-lg border p-2 flex flex-col transition-colors',
                    hasJobs
                      ? 'border-primary/20 bg-card hover:border-primary/40'
                      : 'border-border/40 bg-card/40',
                    isToday(d) && 'ring-1 ring-primary/50'
                  )}
                >
                  <span
                    className={cn(
                      'text-sm',
                      isToday(d)
                        ? 'font-bold text-primary'
                        : 'text-muted-foreground'
                    )}
                  >
                    {d}
                  </span>
                  <div className="mt-1 space-y-1 overflow-hidden">
                    {jobs.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => setSelectedJob(job)}
                        className="w-full text-left rounded-md bg-primary/10 hover:bg-primary/20 px-2 py-1 text-xs text-foreground truncate transition-colors"
                      >
                        {job.vendorName}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
