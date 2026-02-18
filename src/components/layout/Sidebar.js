'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '@/store/useStore';
import { HiOutlineViewGrid, HiOutlineDocumentText, HiOutlineSearch, HiOutlineMicrophone, HiOutlineCog, HiOutlineMenu, HiOutlineX, HiOutlineLightningBolt, HiOutlineChip } from 'react-icons/hi';

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: HiOutlineViewGrid },
    { href: '/documents', label: 'Documents', icon: HiOutlineDocumentText },
    { href: '/query', label: 'AI Query', icon: HiOutlineSearch },
    { href: '/voice', label: 'KHUSHI Voice', icon: HiOutlineMicrophone },
    { href: '/diagram', label: 'Diagram', icon: HiOutlineChip },
    { href: '/settings', label: 'Settings', icon: HiOutlineCog },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { sidebarOpen, toggleSidebar } = useStore();

    return (
        <>
            {/* Mobile toggle */}
            <button
                onClick={toggleSidebar}
                className="fixed top-4 left-4 z-50 p-2 rounded-xl bg-gray-800/80 backdrop-blur-xl border border-white/10 md:hidden"
                style={{ color: 'var(--text-primary)' }}
            >
                {sidebarOpen ? <HiOutlineX size={20} /> : <HiOutlineMenu size={20} />}
            </button>

            {/* Sidebar */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.aside
                        initial={{ x: -280 }}
                        animate={{ x: 0 }}
                        exit={{ x: -280 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="sidebar fixed left-0 top-0 bottom-0 w-[260px] z-40 flex flex-col"
                    >
                        {/* Logo */}
                        <div className="p-6 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                    style={{ background: 'var(--gradient-primary)' }}>
                                    <HiOutlineLightningBolt size={22} color="white" />
                                </div>
                                <div>
                                    <h1 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>MetroCircuit</h1>
                                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>AI Reviewer</p>
                                </div>
                            </div>
                        </div>

                        {/* Nav links */}
                        <nav className="flex-1 px-4 space-y-1">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`sidebar-link ${isActive ? 'active' : ''}`}
                                    >
                                        <Icon size={20} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Footer */}
                        <div className="p-4 mx-4 mb-4 rounded-xl" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                            <p className="text-xs font-medium" style={{ color: 'var(--accent-blue)' }}>MetroCircuit AI v2.0</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Powered by Gemini</p>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>
        </>
    );
}
