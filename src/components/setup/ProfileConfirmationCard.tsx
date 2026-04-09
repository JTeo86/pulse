import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type ConfirmationValues = {
  cuisineType: string;
  audience: string;
  tone: string;
  positioning: string;
  keyStrengths: string;
};

type ProfileConfirmationCardProps = {
  values: ConfirmationValues;
  confirmed: boolean;
  onChange: <K extends keyof ConfirmationValues>(field: K, value: ConfirmationValues[K]) => void;
  onConfirm: () => void;
};

export function ProfileConfirmationCard({ values, confirmed, onChange, onConfirm }: ProfileConfirmationCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Here's what Pulse understands</CardTitle>
        <CardDescription>
          Edit any field inline, then confirm to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Cuisine</Label>
            <Input value={values.cuisineType} onChange={(e) => onChange('cuisineType', e.target.value)} />
          </div>
          <div>
            <Label>Audience</Label>
            <Input value={values.audience} onChange={(e) => onChange('audience', e.target.value)} />
          </div>
          <div>
            <Label>Tone</Label>
            <Input value={values.tone} onChange={(e) => onChange('tone', e.target.value)} />
          </div>
          <div>
            <Label>Positioning</Label>
            <Input value={values.positioning} onChange={(e) => onChange('positioning', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Key strengths</Label>
            <Textarea
              value={values.keyStrengths}
              onChange={(e) => onChange('keyStrengths', e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant={confirmed ? 'secondary' : 'default'} onClick={onConfirm}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {confirmed ? 'Confirmed' : 'Confirm profile'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
