'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import useStore from '@/store/useStore';
import { listFolders, listDocuments } from '@/lib/api';
import { HiOutlineDocumentText, HiOutlineFolder, HiOutlineDatabase, HiOutlineSearch, HiOutlineLightningBolt, HiOutlineUpload } from 'react-icons/hi';
import Link from 'next/link';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function Dashboard() {
    const { folders, setFolders, documents, setDocuments } = useStore();
    const [stats, setStats] = useState({ docs: 0, folders: 0, chunks: 0 });
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        async function loadData() {
            try {
                const [foldersRes, docsRes] = await Promise.all([
                    listFolders().catch(() => ({ folders: [] })),
                    listDocuments().catch(() => ({ documents: [] })),
                ]);
                setFolders(foldersRes.folders || []);
                setDocuments(docsRes.documents || []);
                setStats({
                    docs: (docsRes.documents || []).length,
                    folders: (foldersRes.folders || []).length,
                    chunks: (docsRes.documents || []).reduce((a, d) => a + (d.page_count || 0), 0),
                });
            } catch (e) {
                // Config not set yet, use empty data
            }
            setLoaded(true);
        }
        loadData();
    }, []);

    const statCards = [
        { label: 'Documents', value: stats.docs, icon: HiOutlineDocumentText, color: 'blue', gradient: 'from-blue-500 to-indigo-600' },
        { label: 'Folders', value: stats.folders, icon: HiOutlineFolder, color: 'purple', gradient: 'from-purple-500 to-pink-600' },
        { label: 'Indexed Chunks', value: stats.chunks, icon: HiOutlineDatabase, color: 'emerald', gradient: 'from-emerald-500 to-teal-600' },
        { label: 'Queries Today', value: 0, icon: HiOutlineSearch, color: 'amber', gradient: 'from-amber-500 to-orange-600' },
    ];

    return (
        <AppShell>
            <motion.div variants={containerVariants} initial="hidden" animate="visible">
                {/* Header */}
                <motion.div variants={itemVariants} className="mb-8">
                    <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Dashboard
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Welcome to MetroCircuit AI — Your electrical document intelligence platform
                    </p>
                </motion.div>

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                    {statCards.map((card, i) => {
                        const Icon = card.icon;
                        return (
                            <motion.div
                                key={card.label}
                                variants={itemVariants}
                                className={`glass-card stat-card ${card.color} p-5`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${card.gradient}`}
                                    >
                                        <Icon size={20} color="white" />
                                    </div>
                                </div>
                                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{card.value}</p>
                                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{card.label}</p>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Quick Actions */}
                <motion.div variants={itemVariants} className="mb-8">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                        Quick Actions
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Link href="/documents">
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="glass-card p-5 cursor-pointer flex items-center gap-4"
                            >
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
                                    <HiOutlineUpload size={24} color="white" />
                                </div>
                                <div>
                                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Upload Document</p>
                                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>PDF, SLD, Circuit Drawings</p>
                                </div>
                            </motion.div>
                        </Link>

                        <Link href="/query">
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="glass-card p-5 cursor-pointer flex items-center gap-4"
                            >
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600">
                                    <HiOutlineLightningBolt size={24} color="white" />
                                </div>
                                <div>
                                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>AI Query</p>
                                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ask about circuits</p>
                                </div>
                            </motion.div>
                        </Link>

                        <Link href="/voice">
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="glass-card p-5 cursor-pointer flex items-center gap-4"
                            >
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-600">
                                    <HiOutlineSearch size={24} color="white" />
                                </div>
                                <div>
                                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Ask KHUSHI</p>
                                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Voice-powered search</p>
                                </div>
                            </motion.div>
                        </Link>
                    </div>
                </motion.div>

                {/* Recent Documents */}
                <motion.div variants={itemVariants}>
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                        Recent Documents
                    </h2>
                    <div className="glass-card overflow-hidden">
                        {documents.length === 0 ? (
                            <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                                <HiOutlineDocumentText size={48} className="mx-auto mb-3 opacity-30" />
                                <p className="font-medium">No documents yet</p>
                                <p className="text-sm mt-1">Upload your first metro circuit drawing to get started</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                            <th className="text-left p-4 text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Name</th>
                                            <th className="text-left p-4 text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Status</th>
                                            <th className="text-left p-4 text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Chunks</th>
                                            <th className="text-left p-4 text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {documents.slice(0, 5).map((doc) => (
                                            <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <HiOutlineDocumentText size={18} style={{ color: 'var(--accent-blue)' }} />
                                                        <span className="font-medium text-sm">{doc.name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`status-badge ${doc.status || 'uploaded'}`}>
                                                        {doc.status || 'uploaded'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                    {doc.page_count || 0}
                                                </td>
                                                <td className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                    {new Date(doc.created_at).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AppShell>
    );
}
