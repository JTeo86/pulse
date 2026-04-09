import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home,
  Zap,
  FolderOpen,
  CalendarCheck2,
  MessageSquareText,
  Settings,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Shield,
  Plus,
  Camera,
  PenSquare,
  Upload
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useVenue } from '@/lib/venue-context';
import { useTodaysActions } from '@/hooks/use-todays-actions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup, SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AppLayoutProps {
  children: ReactNode;
}

const primaryNavigation: NavItem[] = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Reviews', href: '/reputation/reviews', icon: MessageSquareText },
  { name: 'Content', href: '/content/library', icon: FolderOpen },
  { name: 'Setup', href: '/setup', icon: Settings },
  { name: 'Autopilot', href: '/autopilot', icon: Zap },
  { name: 'Publishing', href: '/content/calendar', icon: CalendarCheck2 },
];

const platformAdminItem = { name: 'Platform Admin', href: '/admin/platform', icon: Shield, badge: 'Admin' };

// Quick action items for Add Content dropdown
const quickActions = [
  {
    name: 'Upload Photo',
    description: 'Add an existing image to your content inventory',
    href: '/studio/pro-photo',
    icon: Upload,
  },
  {
    name: 'Enhance Photo',
    description: 'Improve and prepare a photo for publishing',
    href: '/studio/pro-photo',
    icon: Camera,
  },
  {
    name: 'Create Post',
    description: 'Write a post and add it to your calendar',
    href: '/content/calendar',
    icon: PenSquare,
  },
  {
    name: 'Respond to Reviews',
    description: 'Reply to customer reviews',
    href: '/reputation/reviews',
    icon: MessageSquareText,
  },
];

function usePlatformAdmin() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsPlatformAdmin(false); return; }
    supabase.rpc('is_platform_admin', { check_user_id: user.id })
      .then(({ data }) => setIsPlatformAdmin(!!data));
  }, [user?.id]);

  return isPlatformAdmin;
}

type NavItem = { name: string; href: string; icon: any; badge?: string };

function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { venues: brands, currentVenue: currentBrand, setCurrentVenue: setCurrentBrand, isAdmin } = useVenue();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const isPlatformAdmin = usePlatformAdmin();
  const { dueCount } = useTodaysActions();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const NavItemComponent = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.href;
    
    const linkContent = (
      <Link
        to={item.href}
        className={`
          flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
          ${isActive 
            ? 'bg-accent/10 text-accent border border-accent/20' 
            : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
          }
          ${isCollapsed ? 'justify-center' : ''}
        `}
      >
        <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : ''}`} />
        {!isCollapsed && <span className="flex-1">{item.name}</span>}
        {!isCollapsed && item.badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">{item.badge}</span>
        )}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right">{item.name}</TooltipContent>
        </Tooltip>
      );
    }
    return linkContent;
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar-background">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center h-14 ${isCollapsed ? 'justify-center px-2' : 'px-4'}`}>
          <Link to="/home" className="font-serif text-lg font-medium text-sidebar-foreground">
            {isCollapsed ? (
              <span className="text-accent text-xl font-bold">P</span>
            ) : (
              <span>Pulse<span className="text-accent">.</span></span>
            )}
          </Link>
        </div>
      </SidebarHeader>

      {/* Brand Switcher */}
      {currentBrand && brands.length > 0 && !isCollapsed && (
        <div className="px-3 py-3 border-b border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-between text-left font-normal h-auto py-2 hover:bg-sidebar-accent">
                <div className="flex flex-col items-start">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Venue</span>
                  <span className="font-medium truncate max-w-[140px]">{currentBrand.name}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {brands.map((brand) => (
                <DropdownMenuItem 
                  key={brand.id}
                  onClick={() => setCurrentBrand(brand)}
                  className={brand.id === currentBrand.id ? 'bg-accent/10' : ''}
                >
                  {brand.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/create-brand')}>
                + Create new venue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {primaryNavigation.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <div className="relative">
                    <NavItemComponent item={item} />
                    {item.href === '/home' && dueCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 pointer-events-none">
                        {dueCount > 9 ? '9+' : dueCount}
                      </span>
                    )}
                  </div>
                </SidebarMenuItem>
              ))}
              {isPlatformAdmin && (
                <SidebarMenuItem>
                  <NavItemComponent item={platformAdminItem} />
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {user ? (
          isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleSignOut} className="w-full">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-sm font-medium text-accent">{user.email?.charAt(0).toUpperCase()}</span>
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{user.email}</p>
                <p className="text-muted-foreground text-xs">{isAdmin ? 'Admin' : 'Member'} • Click to sign out</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-medium text-accent">{user.email?.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.email}</p>
                <p className="text-xs text-muted-foreground">{isAdmin ? 'Admin' : 'Member'}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive shrink-0">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )
        ) : (
          <Button className="w-full btn-primary-editorial" onClick={() => navigate('/auth')}>
            {isCollapsed ? <LogOut className="w-4 h-4" /> : 'Sign In'}
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useVenue();
  const isPlatformAdmin = usePlatformAdmin();
  const { dueCount: mobileDueCount } = useTodaysActions();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const allNavItems: NavItem[] = [
    ...primaryNavigation,
    ...(isPlatformAdmin ? [platformAdminItem] : []),
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex w-full dark">
        {/* Mobile Header */}
        <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-4 h-14">
            <Link to="/home" className="font-serif text-lg font-medium relative">
              Pulse<span className="text-accent">.</span>
              {mobileDueCount > 0 && (
                <span className="absolute -top-1 -right-4 flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-0.5">
                  {mobileDueCount > 9 ? '9+' : mobileDueCount}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-2">
              {/* Add Content Button - Mobile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {quickActions.map((action) => (
                    <DropdownMenuItem key={action.name} onClick={() => navigate(action.href)} className="items-start">
                      <action.icon className="w-4 h-4 mr-2 mt-0.5" />
                      <div className="flex flex-col">
                        <span>{action.name}</span>
                        <span className="text-xs text-muted-foreground">{action.description}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </header>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, x: -300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -300 }}
              className="lg:hidden fixed inset-0 z-40 bg-card pt-14"
            >
              <nav className="p-4 space-y-1 flex flex-col h-[calc(100%-3.5rem)]">
                <div className="flex-1 space-y-1 overflow-y-auto">
                  {allNavItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        location.pathname === item.href
                          ? 'bg-accent/10 text-accent'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.name}
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent ml-auto">{item.badge}</span>
                      )}
                    </Link>
                  ))}
                </div>
                <div className="border-t border-border pt-4">
                  {user ? (
                    <Button variant="ghost" className="w-full justify-start text-destructive" onClick={() => { handleSignOut(); setMobileMenuOpen(false); }}>
                      <LogOut className="w-4 h-4 mr-2" />Sign out
                    </Button>
                  ) : (
                    <Button className="w-full btn-primary-editorial" onClick={() => { navigate('/auth'); setMobileMenuOpen(false); }}>
                      Sign In
                    </Button>
                  )}
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <main className="flex-1 pt-14 lg:pt-0 min-h-screen flex flex-col min-w-0">
          <div className="hidden lg:flex items-center justify-end h-12 px-4 border-b border-border">
            
            {/* Add Content Button - Desktop */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {quickActions.map((action) => (
                  <DropdownMenuItem key={action.name} onClick={() => navigate(action.href)} className="items-start">
                    <action.icon className="w-4 h-4 mr-2 mt-0.5" />
                    <div className="flex flex-col">
                      <span>{action.name}</span>
                      <span className="text-xs text-muted-foreground">{action.description}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
