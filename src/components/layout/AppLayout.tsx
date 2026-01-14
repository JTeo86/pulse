import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Palette, 
  Upload, 
  FileEdit, 
  Send, 
  Users, 
  Plug, 
  CreditCard,
  ChevronDown,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useVenue } from '@/lib/venue-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AppLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Brand Kit', href: '/brand-kit', icon: Palette },
  { name: 'Upload', href: '/upload', icon: Upload },
  { name: 'Drafts & Review', href: '/drafts', icon: FileEdit },
  { name: 'Publishing', href: '/publishing', icon: Send },
];

const adminNavigation = [
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Billing', href: '/billing', icon: CreditCard },
];

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { venues, currentVenue, setCurrentVenue, isAdmin } = useVenue();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const NavLink = ({ item }: { item: typeof navigation[0] }) => {
    const isActive = location.pathname === item.href;
    return (
      <Link
        to={item.href}
        className={`
          flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
          ${isActive 
            ? 'bg-primary text-primary-foreground' 
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }
        `}
        onClick={() => setMobileMenuOpen(false)}
      >
        <item.icon className="w-4 h-4" />
        {item.name}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-16">
          <Link to="/dashboard" className="font-serif text-xl font-medium">
            TheEditor<span className="text-accent">.ai</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 z-40 bg-card pt-16"
          >
            <nav className="p-4 space-y-1">
              {navigation.map((item) => (
                <NavLink key={item.name} item={item} />
              ))}
              {isAdmin && (
                <>
                  <div className="my-4 border-t border-border" />
                  {adminNavigation.map((item) => (
                    <NavLink key={item.name} item={item} />
                  ))}
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-sidebar border-r border-sidebar-border">
        {/* Logo */}
        <div className="flex items-center h-16 px-6 border-b border-sidebar-border">
          <Link to="/dashboard" className="font-serif text-xl font-medium text-sidebar-foreground">
            TheEditor<span className="text-accent">.ai</span>
          </Link>
        </div>

        {/* Venue Switcher */}
        {currentVenue && venues.length > 0 && (
          <div className="px-4 py-4 border-b border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between text-left font-normal h-auto py-2"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-muted-foreground">Current venue</span>
                    <span className="font-medium truncate max-w-[160px]">{currentVenue.name}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {venues.map((venue) => (
                  <DropdownMenuItem 
                    key={venue.id}
                    onClick={() => setCurrentVenue(venue)}
                    className={venue.id === currentVenue.id ? 'bg-accent/10' : ''}
                  >
                    {venue.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/create-venue')}>
                  + Create new venue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}

          {isAdmin && (
            <>
              <div className="my-4 border-t border-sidebar-border" />
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Admin
              </div>
              {adminNavigation.map((item) => (
                <NavLink key={item.name} item={item} />
              ))}
            </>
          )}
        </nav>

        {/* User Menu */}
        <div className="p-4 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-left font-normal h-auto py-2"
              >
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center mr-3">
                  <span className="text-sm font-medium text-accent">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col items-start flex-1 min-w-0">
                  <span className="text-sm font-medium truncate max-w-[140px]">
                    {user?.email}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isAdmin ? 'Admin' : 'Staff'}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
