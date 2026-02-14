import type { PlannedJob, JobStatus } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, DollarSign, Wrench, User, ListOrdered, ExternalLink } from 'lucide-react';

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
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

interface JobDetailModalProps {
  job: PlannedJob;
  onClose: () => void;
  /** When provided, shows a "Track job" button that opens the fulfillment/tracking screen for this job. */
  onTrackJob?: (job: PlannedJob) => void;
}

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function JobDetailModal({ job, onClose, onTrackJob }: JobDetailModalProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-border p-0">
        <DialogHeader className="px-5 py-4 border-b border-border/50">
          <DialogTitle className="text-base">Job details</DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <User className="size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Vendor</p>
              <p className="text-sm font-medium text-foreground">{job.vendorName}</p>
            </div>
          </div>

          <Separator className="bg-border/50" />

          <div className="flex items-center gap-3">
            <Wrench className="size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Service</p>
              <p className="text-sm font-medium text-foreground">{job.jobType}</p>
            </div>
          </div>

          <Separator className="bg-border/50" />
          <div className="flex items-center gap-3">
            <ListOrdered className="size-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-medium text-foreground">
                {JOB_STATUS_LABELS[job.status as JobStatus] ?? (job.status != null ? `Status ${job.status}` : '—')}
              </p>
            </div>
          </div>

          {onTrackJob && (
            <>
              <Separator className="bg-border/50" />
              <Button
                className="w-full gap-2"
                variant="secondary"
                onClick={() => {
                  onTrackJob(job);
                  onClose();
                }}
              >
                <ExternalLink className="size-4" />
                Track job &amp; update status
              </Button>
            </>
          )}

          <Separator className="bg-border/50" />

          <div className="flex items-center gap-3">
            <Calendar className="size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">When</p>
              <p className="text-sm font-medium text-foreground">{formatDate(job.dateTime)}</p>
            </div>
          </div>

          <Separator className="bg-border/50" />

          <div className="flex items-center gap-3">
            <Clock className="size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-medium text-foreground">{job.durationMinutes} min</p>
            </div>
          </div>

          <Separator className="bg-border/50" />

          <div className="flex items-center gap-3">
            <DollarSign className="size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Price</p>
              <p className="text-sm font-semibold text-primary">${job.price}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
