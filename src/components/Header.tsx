import { Moon, Sun, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export default function Header({ isDark, onToggleTheme }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 cursor-pointer">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <FlaskConical size={15} className="text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">CT Lead Finder</span>
        </Link>

        {/* Right */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Toggle theme">
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
        </div>
      </div>
      <Separator />
    </header>
  );
}
