'use client';

import Sidebar from '@/components/layout/Sidebar';
import Notifications from '@/components/layout/Notifications';
import useStore from '@/store/useStore';

export default function AppShell({ children }) {
    const { sidebarOpen } = useStore();

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main
                className="flex-1 transition-all duration-300 p-6 md:p-8"
                style={{ marginLeft: sidebarOpen ? '260px' : '0' }}
            >
                {children}
            </main>
            <Notifications />
        </div>
    );
}
