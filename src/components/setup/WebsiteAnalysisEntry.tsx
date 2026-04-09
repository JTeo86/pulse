import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type WebsiteAnalysisEntryProps = {
  analysisUrl: string;
  analysisLoading: boolean;
  analysisError: string | null;
  websiteAnalyzed: boolean;
  coreProfileConfirmed: boolean;
  onUrlChange: (value: string) => void;
  onAnalyze: () => void;
};

export function WebsiteAnalysisEntry({
  analysisUrl,
  analysisLoading,
  analysisError,
  websiteAnalyzed,
  coreProfileConfirmed,
  onUrlChange,
  onAnalyze,
}: WebsiteAnalysisEntryProps) {
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Analyse my venue
        </CardTitle>
        <CardDescription>
          Start with your website. Pulse will draft your profile so you can confirm instead of filling blank forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <Input
            value={analysisUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://yourvenue.com"
          />
          <Button onClick={onAnalyze} disabled={analysisLoading}>
            {analysisLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analysing...
              </>
            ) : (
              'Analyse my venue'
            )}
          </Button>
        </div>
        {analysisError ? <p className="text-sm text-destructive">{analysisError}</p> : null}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={websiteAnalyzed ? 'default' : 'outline'}>Website analysed</Badge>
          <Badge variant={coreProfileConfirmed ? 'default' : 'outline'}>Core profile confirmed</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
