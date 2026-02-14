import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { mockPlannedJobs } from '@/data/mock';
import { JobDetailModal } from '@/components/JobDetailModal';
import type { PlannedJob } from '@/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function JobCalendarPage() {
  const [viewDate, setViewDate] = useState(new Date(2025, 1, 1)); // Feb 2025
  const [selectedJob, setSelectedJob] = useState<PlannedJob | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const getJobsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return mockPlannedJobs.filter((j) => j.dateTime.startsWith(dateStr));
  };

  const dayKey = (day: number) => `${year}-${month}-${day}`;

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="border-b border-border/50 px-4 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-foreground">Your jobs</h1>
        <p className="text-sm text-muted-foreground">Upcoming scheduled work</p>
      </header>

      <main className="flex-1 p-4 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month - 1))}
            className="p-2 rounded-lg bg-card border border-border text-foreground"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="font-semibold text-foreground">
            {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month + 1))}
            className="p-2 rounded-lg bg-card border border-border text-foreground"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            if (d === null) return <div key={`e-${i}`} />;
            const jobs = getJobsForDay(d);
            const key = dayKey(d);
            const isExpanded = expandedDay === key;
            return (
              <div
                key={key}
                className="min-h-[80px] rounded-xl border border-border bg-card p-2 flex flex-col"
              >
                <span className="text-sm text-muted-foreground">{d}</span>
                <div className="mt-1 space-y-1 overflow-hidden">
                  {jobs.slice(0, isExpanded ? undefined : 1).map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJob(job)}
                      className="w-full text-left rounded-lg bg-primary/20 hover:bg-primary/30 px-2 py-1.5 text-xs text-foreground truncate"
                    >
                      {job.vendorName} · ${job.price}
                    </button>
                  ))}
                  {jobs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDay(isExpanded ? null : key)}
                      className="text-xs text-brand-teal hover:underline"
                    >
                      {isExpanded ? 'Less' : `+${jobs.length - 1} more`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
