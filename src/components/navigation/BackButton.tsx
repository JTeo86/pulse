import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface BackButtonProps {
  fallbackTo: string;
  label?: string;
  className?: string;
}

export function BackButton({ fallbackTo, label = 'Back', className }: BackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    const historyIndex = typeof window !== 'undefined' ? window.history.state?.idx : 0;
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }
    navigate(fallbackTo, { replace: true });
  };

  return (
    <Button variant="ghost" size="sm" className={`w-fit gap-2 ${className || ''}`} onClick={handleBack}>
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Button>
  );
}
