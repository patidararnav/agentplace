import type { NegotiationMessage } from '@/types';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, Sparkles } from 'lucide-react';

interface NegotiationChatModalProps {
  messages: NegotiationMessage[];
  vendorName: string;
  onClose: () => void;
}

export function NegotiationChatModal({ messages, vendorName, onClose }: NegotiationChatModalProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 bg-card border-border">
        <DialogHeader className="px-5 py-4 border-b border-border/50">
          <DialogTitle className="text-base">
            Agent Negotiation — {vendorName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5 space-y-4">
            {messages.map((msg, i) => {
              const isCustomerAgent = msg.role === 'customer-agent';
              return (
                <div
                  key={i}
                  className={cn(
                    'flex gap-3',
                    isCustomerAgent ? 'flex-row' : 'flex-row-reverse'
                  )}
                >
                  <Avatar className="size-7 flex-shrink-0 mt-0.5">
                    <AvatarFallback
                      className={cn(
                        'text-xs',
                        isCustomerAgent
                          ? 'bg-primary/15 text-primary'
                          : 'bg-teal-500/15 text-teal-400'
                      )}
                    >
                      {isCustomerAgent ? (
                        <Sparkles className="size-3.5" />
                      ) : (
                        <Bot className="size-3.5" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      'rounded-xl px-3.5 py-2.5 text-sm max-w-[80%]',
                      isCustomerAgent
                        ? 'bg-primary/10 text-foreground'
                        : 'bg-teal-500/10 text-foreground'
                    )}
                  >
                    <span className="text-[11px] font-medium text-muted-foreground block mb-1">
                      {isCustomerAgent ? 'Your Agent' : `${vendorName}'s Agent`}
                    </span>
                    {msg.text}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
