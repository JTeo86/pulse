import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ApiKey {
  id: string;
  key_name: string;
  key_value: string;
  description: string | null;
  is_configured: boolean;
  updated_at: string;
}

export default function APIKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('platform_api_keys')
      .select('*')
      .order('key_name');
    if (error) {
      toast({ title: 'Error loading API keys', description: error.message, variant: 'destructive' });
    } else {
      setKeys(data || []);
      const vals: Record<string, string> = {};
      (data || []).forEach((k: ApiKey) => { vals[k.id] = k.key_value; });
      setEditValues(vals);
    }
    setLoading(false);
  };

  const handleSave = async (key: ApiKey) => {
    const value = editValues[key.id] ?? '';
    setSaving(key.id);
    const { error } = await supabase
      .from('platform_api_keys')
      .update({ key_value: value, is_configured: value.trim().length > 0 })
      .eq('id', key.id);
    setSaving(null);
    if (error) {
      toast({ title: 'Error saving key', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: `${key.key_name} updated successfully.` });
      fetchKeys();
    }
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
          Manage third-party API credentials used by backend functions. Values are stored in the database and read by edge functions at runtime.
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
                <div className="flex-1 relative">
                  <Label htmlFor={key.id} className="sr-only">{key.key_name}</Label>
                  <Input
                    id={key.id}
                    type={visible[key.id] ? 'text' : 'password'}
                    value={editValues[key.id] ?? ''}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, [key.id]: e.target.value }))}
                    placeholder="Enter API key…"
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setVisible((prev) => ({ ...prev, [key.id]: !prev[key.id] }))}
                  >
                    {visible[key.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  onClick={() => handleSave(key)}
                  disabled={saving === key.id}
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
