'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AppShell from '@/components/layout/AppShell';
import useStore from '@/store/useStore';
import { queryDocuments } from '@/lib/api';
import {
    HiOutlineSearch, HiOutlineLightningBolt, HiOutlineCode,
    HiOutlineDocumentText, HiOutlineChip, HiOutlineFilter
} from 'react-icons/hi';

// Component type colors for diagram nodes
const COMPONENT_COLORS = {
    MCCB: '#3b82f6',
    ACB: '#8b5cf6',
    MCB: '#06b6d4',
    TRANSFORMER: '#f59e0b',
    RELAY: '#10b981',
    CONTACTOR: '#ec4899',
    BUSBAR: '#f97316',
    CT: '#6366f1',
    PT: '#14b8a6',
    VCB: '#e11d48',
    MOTOR: '#84cc16',
    CABLE: '#64748b',
    DEFAULT: '#3b82f6',
};

function getNodeColor(label) {
    const upper = (label || '').toUpperCase();
    for (const [key, color] of Object.entries(COMPONENT_COLORS)) {
        if (upper.includes(key)) return color;
    }
    return COMPONENT_COLORS.DEFAULT;
}

export default function QueryPage() {
    const { addNotification, queryResult, setQueryResult } = useStore();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('text');
    const [outputType, setOutputType] = useState('text');
    const [filterPanel, setFilterPanel] = useState('');
    const [filterVoltage, setFilterVoltage] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    async function handleQuery() {
        if (!query.trim()) return;
        setLoading(true);
        try {
            const result = await queryDocuments(query, {
                outputType,
                filterPanel: filterPanel || null,
                filterVoltage: filterVoltage || null,
            });
            setQueryResult(result);
            addNotification('Query completed', 'success');

            // Build diagram from matches
            if (result.matches) {
                buildDiagram(result.matches);
            }
        } catch (e) {
            addNotification('Query failed: ' + e.message, 'error');
        }
        setLoading(false);
    }

    function buildDiagram(matches) {
        const newNodes = [];
        const newEdges = [];
        const nodeMap = new Map();
        let yOffset = 0;

        matches.forEach((match, mIdx) => {
            const comps = match.components || [];
            const conns = match.connections || [];

            comps.forEach((comp, cIdx) => {
                const label = typeof comp === 'string' ? comp : comp.type || comp.label || 'Unknown';
                const nodeId = `${mIdx}-${cIdx}-${label}`;

                if (!nodeMap.has(label)) {
                    nodeMap.set(label, nodeId);
                    newNodes.push({
                        id: nodeId,
                        data: { label },
                        position: { x: cIdx * 220, y: yOffset },
                        style: {
                            background: `${getNodeColor(label)}22`,
                            border: `2px solid ${getNodeColor(label)}`,
                            borderRadius: '12px',
                            padding: '12px 18px',
                            color: '#f1f5f9',
                            fontSize: '13px',
                            fontWeight: '600',
                        },
                    });
                }
            });

            conns.forEach((conn, eIdx) => {
                const sourceLabel = typeof conn.from === 'string' ? conn.from : '';
                const targetLabel = typeof conn.to === 'string' ? conn.to : '';
                const sourceId = nodeMap.get(sourceLabel);
                const targetId = nodeMap.get(targetLabel);

                if (sourceId && targetId && sourceId !== targetId) {
                    newEdges.push({
                        id: `e-${mIdx}-${eIdx}`,
                        source: sourceId,
                        target: targetId,
                        animated: true,
                        style: { stroke: '#06b6d4', strokeWidth: 2 },
                        label: conn.label || '',
                        labelStyle: { fill: '#94a3b8', fontSize: 11 },
                    });
                }
            });

            yOffset += 180;
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }

    const tabs = [
        { id: 'text', label: 'Text', icon: HiOutlineDocumentText },
        { id: 'json', label: 'JSON', icon: HiOutlineCode },
        { id: 'diagram', label: 'Diagram', icon: HiOutlineChip },
    ];

    const outputTypes = [
        { value: 'text', label: 'General Analysis' },
        { value: 'wiring', label: 'Wiring Details' },
        { value: 'schematic', label: 'Schematic Structure' },
        { value: 'json', label: 'Structured JSON' },
    ];

    return (
        <AppShell>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>AI Query</h1>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Ask questions about your metro circuit drawings using RAG-powered search
                    </p>
                </div>

                {/* Query Input Area */}
                <div className="glass-card p-6 mb-6">
                    {/* Output type selector */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {outputTypes.map((t) => (
                            <button
                                key={t.value}
                                className={`tab-btn ${outputType === t.value ? 'active' : ''}`}
                                onClick={() => setOutputType(t.value)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Query input */}
                    <div className="flex gap-3">
                        <input
                            className="input-field flex-1"
                            placeholder="Ask about your circuit drawings... e.g., 'Show me traction feeder panel wiring details'"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                        />
                        <button
                            onClick={handleQuery}
                            disabled={loading || !query.trim()}
                            className="btn-primary"
                        >
                            {loading ? <div className="spinner" /> : <><HiOutlineLightningBolt size={18} /> Query</>}
                        </button>
                    </div>

                    {/* Filters toggle */}
                    <div className="mt-3">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="text-sm flex items-center gap-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <HiOutlineFilter size={14} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </button>
                        {showFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="flex gap-3 mt-3 overflow-hidden"
                            >
                                <input
                                    className="input-field flex-1"
                                    placeholder="Filter by panel..."
                                    value={filterPanel}
                                    onChange={(e) => setFilterPanel(e.target.value)}
                                />
                                <input
                                    className="input-field flex-1"
                                    placeholder="Filter by voltage..."
                                    value={filterVoltage}
                                    onChange={(e) => setFilterVoltage(e.target.value)}
                                />
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Results */}
                {queryResult && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        {/* Output tabs */}
                        <div className="flex gap-2 mb-4">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                        onClick={() => setActiveTab(tab.id)}
                                    >
                                        <Icon size={14} style={{ display: 'inline', marginRight: 6 }} />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Text output */}
                        {activeTab === 'text' && (
                            <div className="glass-card p-6">
                                <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                                    {queryResult.answer}
                                </div>
                                {queryResult.matches && (
                                    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-glass)' }}>
                                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                                            Sources: {queryResult.matchCount} chunks matched
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {queryResult.matches.slice(0, 5).map((m, i) => (
                                                <span key={i} className="text-xs px-3 py-1 rounded-full"
                                                    style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)' }}>
                                                    Page {m.page_number} • {(m.similarity * 100).toFixed(0)}% match
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* JSON output */}
                        {activeTab === 'json' && (
                            <div className="glass-card p-6">
                                <pre className="text-xs overflow-auto max-h-[500px] leading-relaxed"
                                    style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>
                                    {JSON.stringify(queryResult, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* Diagram output */}
                        {activeTab === 'diagram' && (
                            <div className="glass-card overflow-hidden" style={{ height: '600px' }}>
                                {nodes.length === 0 ? (
                                    <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                                        <div className="text-center">
                                            <HiOutlineChip size={48} className="mx-auto mb-3 opacity-30" />
                                            <p>No diagram data available</p>
                                            <p className="text-xs mt-1">Try querying with &quot;Schematic Structure&quot; output type</p>
                                        </div>
                                    </div>
                                ) : (
                                    <ReactFlow
                                        nodes={nodes}
                                        edges={edges}
                                        onNodesChange={onNodesChange}
                                        onEdgesChange={onEdgesChange}
                                        fitView
                                        attributionPosition="bottom-left"
                                    >
                                        <Background color="#1e293b" gap={20} />
                                        <Controls />
                                        <MiniMap
                                            nodeColor={(n) => getNodeColor(n.data?.label)}
                                            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                        />
                                    </ReactFlow>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </motion.div>
        </AppShell>
    );
}
