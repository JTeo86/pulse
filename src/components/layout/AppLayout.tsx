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
  X,
  PanelLeft
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
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

function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { venues, currentVenue, setCurrentVenue, isAdmin, isDemoMode } = useVenue();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const NavItem = ({ item }: { item: typeof navigation[0] }) => {
    const isActive = location.pathname === item.href;
    
    const linkContent = (
      <Link
        to={item.href}
        className={`
          flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
          ${isActive 
            ? 'bg-primary text-primary-foreground' 
            : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
          }
          ${isCollapsed ? 'justify-center' : ''}
        `}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {!isCollapsed && <span>{item.name}</span>}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right">
            {item.name}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center h-14 ${isCollapsed ? 'justify-center px-2' : 'px-4'}`}>
          <Link to="/dashboard" className="font-serif text-xl font-medium text-sidebar-foreground">
            {isCollapsed ? (
              <span className="text-accent">E</span>
            ) : (
              <>TheEditor<span className="text-accent">.ai</span></>
            )}
          </Link>
        </div>
      </SidebarHeader>

      {/* Venue Switcher */}
      {currentVenue && venues.length > 0 && !isCollapsed && (
        <div className="px-3 py-3 border-b border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between text-left font-normal h-auto py-2"
              >
                <div className="flex flex-col items-start">
                  <span className="text-xs text-muted-foreground">Current venue</span>
                  <span className="font-medium truncate max-w-[140px]">{currentVenue.name}</span>
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

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <NavItem item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Navigation */}
        {isAdmin && (
          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3">
                Admin
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavigation.map((item) => (
                  <SidebarMenuItem key={item.name}>
                    <NavItem item={item} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {isDemoMode && !user ? (
          // Unauthenticated demo mode
          <div className={`rounded-lg bg-accent/10 border border-accent/20 ${isCollapsed ? 'p-2' : 'p-3'}`}>
            {!isCollapsed && (
              <>
                <p className="text-xs font-medium text-accent mb-2">Demo Mode</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Viewing sample data
                </p>
              </>
            )}
            <Button 
              size="sm" 
              className={`btn-primary-editorial ${isCollapsed ? 'w-full p-2' : 'w-full'}`}
              onClick={() => navigate('/auth')}
            >
              {isCollapsed ? <LogOut className="w-4 h-4" /> : 'Sign In'}
            </Button>
          </div>
        ) : isDemoMode && user ? (
          // Authenticated user in demo mode (has no venues)
          <div className={`space-y-2 ${isCollapsed ? '' : ''}`}>
            {!isCollapsed && (
              <div className="rounded-lg bg-accent/10 border border-accent/20 p-2 mb-2">
                <p className="text-xs text-muted-foreground">Viewing demo data</p>
              </div>
            )}
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSignOut}
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-medium text-accent">
                    {user.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          // Regular authenticated user with venues
          isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="w-full"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-sm font-medium text-accent">
                      {user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{user?.email}</p>
                <p className="text-muted-foreground text-xs">{isAdmin ? 'Admin' : 'Staff'} • Click to sign out</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-left font-normal h-auto py-2"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center mr-3 shrink-0">
                    <span className="text-sm font-medium text-accent">
                      {user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col items-start flex-1 min-w-0">
                    <span className="text-sm font-medium truncate max-w-[120px]">
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
          )
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin, isDemoMode } = useVenue();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const MobileNavLink = ({ item }: { item: typeof navigation[0] }) => {
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
    <SidebarProvider>
      <div className="min-h-screen bg-background flex w-full">
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
              <nav className="p-4 space-y-1 flex flex-col h-[calc(100%-4rem)]">
                <div className="flex-1 space-y-1">
                  {navigation.map((item) => (
                    <MobileNavLink key={item.name} item={item} />
                  ))}
                  {isAdmin && (
                    <>
                      <div className="my-4 border-t border-border" />
                      <p className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Admin
                      </p>
                      {adminNavigation.map((item) => (
                        <MobileNavLink key={item.name} item={item} />
                      ))}
                    </>
                  )}
                </div>
                
                {/* Mobile Sign Out */}
                <div className="border-t border-border pt-4">
                  {user ? (
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        handleSignOut();
                        setMobileMenuOpen(false);
                      }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign out
                    </Button>
                  ) : (
                    <Button
                      className="w-full btn-primary-editorial"
                      onClick={() => {
                        navigate('/auth');
                        setMobileMenuOpen(false);
                      }}
                    >
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
        <main className="flex-1 pt-16 lg:pt-0 min-h-screen">
          {/* Desktop Sidebar Toggle */}
          <div className="hidden lg:flex items-center h-14 px-4 border-b border-border">
            <SidebarTrigger>
              <Button variant="ghost" size="icon">
                <PanelLeft className="w-4 h-4" />
              </Button>
            </SidebarTrigger>
          </div>
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
