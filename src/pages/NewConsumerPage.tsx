import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { insertConsumer } from '@/lib/supabase-data';
import { useApp } from '@/context/AppContext';

export function NewConsumerPage() {
  const navigate = useNavigate();
  const { setSelectedConsumer, refetchConsumers } = useApp();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimName = name.trim();
    if (!trimName) {
      setError('Name is required.');
      return;
    }
    setError('');
    setSubmitting(true);
    const result = await insertConsumer({ consumer_name: trimName, job_count: 0, job_ids: [] });
    setSubmitting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    await refetchConsumers();
    setSelectedConsumer(result.data);
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">New consumer</h1>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-2">
              {error}
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consumer name</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="consumer-name">Name</Label>
              <Input
                id="consumer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="mt-2"
              />
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create consumer'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
