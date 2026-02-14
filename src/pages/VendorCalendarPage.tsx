import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  Clock,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { mockPlannedJobs } from "@/data/mock";
import type { PlannedJob } from "@/types";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function VendorCalendarPage() {
  const navigate = useNavigate();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedJob, setSelectedJob] = useState<PlannedJob | null>(null);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  // Map date string (YYYY-MM-DD) -> jobs
  const jobsByDate = useMemo(() => {
    const map: Record<string, PlannedJob[]> = {};
    for (const job of mockPlannedJobs) {
      const dateKey = job.dateTime.split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(job);
    }
    return map;
  }, []);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedJob(null);
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedJob(null);
  }

  function handleDayClick(day: number) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const jobs = jobsByDate[dateKey];
    if (jobs && jobs.length > 0) {
      setSelectedJob((prev) =>
        prev?.id === jobs[0].id ? null : jobs[0]
      );
    } else {
      setSelectedJob(null);
    }
  }

  // Build calendar grid cells
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
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
              <p className="text-xs text-muted-foreground">My Calendar</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Month Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-semibold text-foreground">
            {MONTH_NAMES[month]} {year}
          </h2>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Calendar Grid */}
        <Card>
          <CardContent className="pt-6">
            {/* Day labels */}
            <div className="grid grid-cols-7 mb-2">
              {DAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="text-center text-xs font-medium text-muted-foreground py-2"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7">
              {calendarCells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="p-2" />;
                }

                const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayJobs = jobsByDate[dateKey] || [];
                const isToday = dateKey === todayKey;
                const isSelected = selectedJob
                  ? selectedJob.dateTime.startsWith(dateKey)
                  : false;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className={cn(
                      "relative flex flex-col items-center justify-start p-2 min-h-[72px] rounded-lg transition-colors",
                      isToday && "bg-primary/5",
                      isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                      dayJobs.length > 0
                        ? "cursor-pointer hover:bg-accent/50"
                        : "cursor-default"
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isToday
                          ? "text-primary font-bold"
                          : "text-foreground"
                      )}
                    >
                      {day}
                    </span>
                    {dayJobs.length > 0 && (
                      <div className="flex flex-col items-center gap-1 mt-1">
                        {dayJobs.map((job) => (
                          <div
                            key={job.id}
                            className="w-2 h-2 rounded-full bg-primary"
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Job Detail (inline expand) */}
        {selectedJob && (
          <Card className="animate-in slide-in-from-top-2 duration-200">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {selectedJob.jobType}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedJob.vendorName}
                  </p>
                </div>
                <Badge>{selectedJob.jobType.split(" ")[0]}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    {formatTime(selectedJob.dateTime)} &middot;{" "}
                    {selectedJob.durationMinutes} min
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4 shrink-0" />
                  <span>${selectedJob.price}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground/70">
                {new Date(selectedJob.dateTime).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Upcoming jobs list */}
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">
            Upcoming Jobs
          </h3>
          {mockPlannedJobs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No upcoming jobs scheduled.
            </p>
          )}
          {mockPlannedJobs.map((job) => (
            <Card
              key={job.id}
              className={cn(
                "cursor-pointer transition-colors hover:border-primary/30",
                selectedJob?.id === job.id && "border-primary"
              )}
              onClick={() =>
                setSelectedJob((prev) =>
                  prev?.id === job.id ? null : job
                )
              }
            >
              <CardContent className="pt-4 pb-4 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-medium text-sm text-foreground">
                    {job.jobType}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(job.dateTime).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at {formatTime(job.dateTime)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm text-foreground">
                    ${job.price}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.durationMinutes} min
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
