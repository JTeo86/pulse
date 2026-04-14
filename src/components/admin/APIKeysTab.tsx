import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ApiKey {
  id: string;
  key_name: string;
  description: string | null;
  is_configured: boolean;
  updated_at: string;
}

export default function APIKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('platform_api_keys')
      .select('id, key_name, description, is_configured, updated_at')
      .order('key_name');
    if (error) {
      toast({ title: 'Error loading API keys', description: error.message, variant: 'destructive' });
    } else {
      setKeys(data || []);
    }
    setLoading(false);
  };

  const handleSave = async (key: ApiKey) => {
    const value = editValues[key.id] ?? '';
    if (!value.trim()) return;
    setSaving(key.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke('manage-platform-key', {
        body: { key_name: key.key_name, key_value: value },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (resp.error) throw new Error(resp.error.message);
      const result = resp.data as { error?: string } | null;
      if (result?.error) throw new Error(result.error);
      toast({ title: 'Saved', description: `${key.key_name} updated successfully.` });
      setEditValues(prev => ({ ...prev, [key.id]: '' }));
      fetchKeys();
    } catch (err) {
      toast({ title: 'Error saving key', description: (err as Error).message, variant: 'destructive' });
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">API Keys &amp; Tokens</h2>
        <p className="text-sm text-muted-foreground">
          Manage third-party API credentials used by backend functions. Key values are stored securely and never sent back to the browser. Buffer OAuth app credentials are configured separately as Supabase edge function secrets (BUFFER_CLIENT_ID, BUFFER_CLIENT_SECRET, BUFFER_REDIRECT_URI).
        </p>
      </div>

      <div className="grid gap-4">
        {keys.map((key) => (
          <Card key={key.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-base">{key.key_name}</CardTitle>
                </div>
                <Badge variant={key.is_configured ? 'default' : 'secondary'}>
                  {key.is_configured ? 'Configured' : 'Not set'}
                </Badge>
              </div>
              {key.description && <CardDescription>{key.description}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor={key.id} className="sr-only">{key.key_name}</Label>
                  <Input
                    id={key.id}
                    type="password"
                    value={editValues[key.id] ?? ''}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, [key.id]: e.target.value }))}
                    placeholder={key.is_configured ? '••••••••••• (enter new value to update)' : 'Enter API key…'}
                    className="font-mono text-sm"
                  />
                </div>
                <Button
                  onClick={() => handleSave(key)}
                  disabled={saving === key.id || !(editValues[key.id] ?? '').trim()}
                  size="sm"
                  className="gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving === key.id ? 'Saving…' : 'Save'}
                </Button>
              </div>
              {key.is_configured && (
                <p className="text-xs text-muted-foreground mt-2">
                  Last updated: {new Date(key.updated_at).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
