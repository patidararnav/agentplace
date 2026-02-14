import type { PlannedJob } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, DollarSign, Wrench, User } from 'lucide-react';

interface JobDetailModalProps {
  job: PlannedJob;
  onClose: () => void;
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

export function JobDetailModal({ job, onClose }: JobDetailModalProps) {
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
