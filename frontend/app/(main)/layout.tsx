import { AppHeader } from '@/components/layout/AppHeader';
import { TabNav } from '@/components/layout/TabNav';
import { CartSidebar } from '@/components/ui/CartSidebar';
import { OrdersSidebar } from '@/components/ui/OrdersSidebar';
import { CartHydrator } from '@/components/ui/CartHydrator';
import { AuthGuard } from '@/components/layout/AuthGuard';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="app-command-center flex h-screen flex-col bg-(--bg)">
        <AppHeader />
        <TabNav />
        <main className="relative z-10 flex-1 min-h-0 overflow-hidden">{children}</main>
        <CartSidebar />
        <OrdersSidebar />
        <CartHydrator />
      </div>
    </AuthGuard>
  );
}
