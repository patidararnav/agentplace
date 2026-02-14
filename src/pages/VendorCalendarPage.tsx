import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';

export function VendorCalendarPage() {
  const navigate = useNavigate();
  const { selectedVendor } = useApp();

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="px-6 py-4 border-b border-border/40">
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
              {selectedVendor ? selectedVendor.name : 'Select a vendor first'}
            </p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <p className="text-muted-foreground text-center">
          {selectedVendor
            ? 'Vendor calendar coming soon.'
            : 'Select a vendor from the dashboard to view their calendar.'}
        </p>
      </main>
    </div>
  );
}
