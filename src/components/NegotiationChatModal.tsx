import { X } from 'lucide-react';
import type { NegotiationMessage } from '@/types';
import { cn } from '@/lib/utils';

interface NegotiationChatModalProps {
  messages: NegotiationMessage[];
  vendorName: string;
  onClose: () => void;
}

export function NegotiationChatModal({ messages, vendorName, onClose }: NegotiationChatModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-foreground">Negotiation with {vendorName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'rounded-xl px-4 py-2.5 text-sm',
                msg.role === 'agent'
                  ? 'bg-primary/20 text-foreground ml-0 mr-8'
                  : 'bg-muted text-foreground mr-0 ml-8'
              )}
            >
              <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                {msg.role === 'agent' ? 'Agent' : vendorName}
              </span>
              {msg.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
