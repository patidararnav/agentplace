import { X } from 'lucide-react';
import type { PlannedJob } from '@/types';

interface JobDetailModalProps {
  job: PlannedJob;
  onClose: () => void;
}

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function JobDetailModal({ job, onClose }: JobDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-foreground">Job details</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p><span className="text-muted-foreground">Vendor:</span> <span className="text-foreground">{job.vendorName}</span></p>
          <p><span className="text-muted-foreground">Type:</span> <span className="text-foreground">{job.jobType}</span></p>
          <p><span className="text-muted-foreground">When:</span> <span className="text-foreground">{formatDate(job.dateTime)}</span></p>
          <p><span className="text-muted-foreground">Duration:</span> <span className="text-foreground">{job.durationMinutes} min</span></p>
          <p><span className="text-muted-foreground">Price:</span> <span className="text-foreground font-semibold text-brand-emerald">${job.price}</span></p>
        </div>
      </div>
    </div>
  );
}
