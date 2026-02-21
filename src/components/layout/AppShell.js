'use client';

import { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Notifications from '@/components/layout/Notifications';
import useStore from '@/store/useStore';
import { listFolders, listDocuments } from '@/lib/api';

export default function AppShell({ children }) {
    const { sidebarOpen, setFolders, setDocuments } = useStore();

    useEffect(() => {
        async function sync() {
            try {
                const [fData, dData] = await Promise.all([listFolders(), listDocuments()]);
                if (fData.folders) setFolders(fData.folders);
                if (dData.documents) setDocuments(dData.documents);
            } catch (err) {
                console.error("Sync error:", err);
            }
        }
        sync();
    }, [setFolders, setDocuments]);

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
