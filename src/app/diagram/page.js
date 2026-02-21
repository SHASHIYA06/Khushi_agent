'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    useNodesState,
    useEdgesState,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AppShell from '@/components/layout/AppShell';
import useStore from '@/store/useStore';
import { queryRAG } from '@/lib/api';
import {
    HiOutlineChip, HiOutlineLightningBolt, HiOutlineRefresh,
    HiOutlineZoomIn, HiOutlineDownload, HiOutlineSearch,
    HiOutlineAdjustments
} from 'react-icons/hi';

// ── Component colors ──
const COMPONENT_COLORS = {
    MCCB: '#3b82f6', ACB: '#8b5cf6', MCB: '#06b6d4', VCB: '#e11d48',
    TRANSFORMER: '#f59e0b', RELAY: '#10b981', CONTACTOR: '#ec4899',
    BUSBAR: '#f97316', CT: '#6366f1', PT: '#14b8a6', MOTOR: '#84cc16',
    ISOLATOR: '#a855f7', FUSE: '#ef4444', CABLE: '#64748b',
    CAPACITOR: '#22d3ee', PLC: '#0ea5e9', STARTER: '#d946ef',
    DEFAULT: '#3b82f6',
};

function getNodeColor(label) {
    const upper = (label || '').toUpperCase();
    for (const [key, color] of Object.entries(COMPONENT_COLORS)) {
        if (upper.includes(key)) return color;
    }
    return COMPONENT_COLORS.DEFAULT;
}

// ── Layout helpers ──
// ── Layout helpers: Hierarchical "Matrix" Layout ──
function autoLayout(components, connections) {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    // Heuristic levels for electrical hierarchy
    const LEVELS = {
        TRANSFORMER: 0, BUSBAR: 0,
        ACB: 1, VCB: 1, ISOLATOR: 1,
        MCCB: 2, MCB: 2, FUSE: 2,
        RELAY: 3, CONTACTOR: 3, PLC: 3, STARTER: 3,
        MOTOR: 4, CAPACITOR: 4, CABLE: 4, CT: 4, PT: 4,
        DEFAULT: 2
    };

    const levelGroups = [[], [], [], [], []];

    components.forEach((comp, i) => {
        const label = typeof comp === 'string' ? comp : comp.type || comp.label || 'Unknown';
        const upper = label.toUpperCase();
        let level = LEVELS.DEFAULT;

        for (const [key, val] of Object.entries(LEVELS)) {
            if (upper.includes(key)) {
                level = val;
                break;
            }
        }
        levelGroups[level].push(label);
    });

    // Position nodes based on levels
    let currentIdx = 0;
    levelGroups.forEach((group, level) => {
        group.forEach((label, i) => {
            const id = `n-${currentIdx}-${label.replace(/\s+/g, '_')}`;
            const color = getNodeColor(label);

            // Calculate position with staggering
            const xOffset = group.length > 1 ? (i - (group.length - 1) / 2) * 280 : 0;
            const x = 500 + xOffset;
            const y = level * 200;

            nodeMap.set(label, id);
            nodes.push({
                id,
                data: { label },
                position: { x, y },
                style: {
                    background: `${color}15`,
                    border: `2px solid ${color}`,
                    borderRadius: '14px',
                    padding: '14px 20px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    fontWeight: '700',
                    boxShadow: `0 0 20px ${color}22`,
                    minWidth: '160px',
                    textAlign: 'center',
                },
            });
            currentIdx++;
        });
    });

    connections.forEach((conn, i) => {
        const fromLabel = typeof conn.from === 'string' ? conn.from : '';
        const toLabel = typeof conn.to === 'string' ? conn.to : '';
        const sourceId = nodeMap.get(fromLabel);
        const targetId = nodeMap.get(toLabel);

        if (sourceId && targetId && sourceId !== targetId) {
            edges.push({
                id: `e-${i}`,
                source: sourceId,
                target: targetId,
                animated: true,
                style: { stroke: '#06b6d4', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4' },
                label: conn.label || conn.cable || '',
                labelStyle: { fill: '#94a3b8', fontSize: 11, fontWeight: 600 },
                labelBgStyle: { fill: '#111827', fillOpacity: 0.8 },
                labelBgPadding: [4, 8],
                labelBgBorderRadius: 6,
            });
        }
    });

    return { nodes, edges };
}

export default function DiagramPage() {
    const { folders, documents, addNotification } = useStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedFolderId, setSelectedFolderId] = useState('');
    const [selectedDocId, setSelectedDocId] = useState('');
    const [diagramTitle, setDiagramTitle] = useState('');
    const [componentCount, setComponentCount] = useState(0);
    const [connectionCount, setConnectionCount] = useState(0);
    const [showLegend, setShowLegend] = useState(true);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Fetch schematic from query
    async function handleSearch() {
        if (!searchQuery.trim()) return;
        setLoading(true);
        try {
            const result = await queryRAG(searchQuery, {
                outputType: 'schematic',
                matchCount: 15,
                folderId: selectedFolderId || null,
                documentId: selectedDocId || null,
            });

            // Aggregate components & connections from matches
            const allComponents = new Map();
            const allConnections = [];

            if (result.matches) {
                result.matches.forEach((match) => {
                    const comps = match.components || [];
                    const conns = match.connections || [];

                    comps.forEach((c) => {
                        const label = typeof c === 'string' ? c : c.type || c.label;
                        if (label) allComponents.set(label, c);
                    });

                    conns.forEach((conn) => {
                        allConnections.push(conn);
                    });
                });
            }

            // Also try parsing structured answer
            try {
                const answerData = typeof result.answer === 'string'
                    ? JSON.parse(result.answer.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
                    : result.answer;

                if (answerData?.components) {
                    answerData.components.forEach((c) => {
                        const label = typeof c === 'string' ? c : c.type || c.label || c.id;
                        if (label) allComponents.set(label, c);
                    });
                }
                if (answerData?.connections) {
                    answerData.connections.forEach((conn) => allConnections.push(conn));
                }
            } catch (e) { /* answer wasn't JSON */ }

            const componentsArr = Array.from(allComponents.keys());
            const { nodes: newNodes, edges: newEdges } = autoLayout(componentsArr, allConnections);

            setNodes(newNodes);
            setEdges(newEdges);
            setDiagramTitle(searchQuery);
            setComponentCount(componentsArr.length);
            setConnectionCount(allConnections.length);
            addNotification(`Diagram: ${componentsArr.length} components, ${allConnections.length} connections`, 'success');
        } catch (e) {
            addNotification('Diagram generation failed: ' + e.message, 'error');
        }
        setLoading(false);
    }

    // Export as PNG screenshot
    function handleExport() {
        addNotification('Use browser screenshot (Cmd+Shift+4) to capture diagram', 'info');
    }

    const legendItems = Object.entries(COMPONENT_COLORS).filter(([k]) => k !== 'DEFAULT').slice(0, 10);

    return (
        <AppShell>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            <HiOutlineChip size={28} style={{ color: 'var(--accent-cyan)' }} />
                            Circuit Diagram
                        </h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Generate interactive schematic diagrams from your documents
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowLegend(!showLegend)} className="btn-secondary text-sm">
                            <HiOutlineAdjustments size={16} /> Legend
                        </button>
                        <button onClick={handleExport} className="btn-secondary text-sm">
                            <HiOutlineDownload size={16} /> Export
                        </button>
                    </div>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap gap-4 mb-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold mb-1 ml-1" style={{ color: 'var(--text-secondary)' }}>Target Folder</label>
                        <select
                            className="input-field w-full text-sm"
                            value={selectedFolderId}
                            onChange={(e) => setSelectedFolderId(e.target.value)}
                        >
                            <option value="">All Folders</option>
                            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold mb-1 ml-1" style={{ color: 'var(--text-secondary)' }}>Target Document</label>
                        <select
                            className="input-field w-full text-sm"
                            value={selectedDocId}
                            onChange={(e) => setSelectedDocId(e.target.value)}
                        >
                            <option value="">All Documents</option>
                            {documents.filter(d => !selectedFolderId || d.folder_id === selectedFolderId).map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Search bar */}
                <div className="glass-card p-4 mb-4">
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <input
                                className="input-field w-full pl-10"
                                placeholder="Search for a circuit, panel, or system... e.g., 'Traction power panel SLD'"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={18} />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={loading || !searchQuery.trim()}
                            className="btn-primary"
                        >
                            {loading ? <div className="spinner" /> : <><HiOutlineLightningBolt size={18} /> Generate</>}
                        </button>
                    </div>
                    {diagramTitle && (
                        <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            <span>📋 <strong style={{ color: 'var(--text-primary)' }}>{diagramTitle}</strong></span>
                            <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)' }}>
                                {componentCount} components
                            </span>
                            <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-cyan)' }}>
                                {connectionCount} connections
                            </span>
                        </div>
                    )}
                </div>

                {/* Diagram Canvas */}
                <div className="glass-card overflow-hidden" style={{ height: 'calc(100vh - 310px)', minHeight: '500px' }}>
                    {nodes.length === 0 ? (
                        <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                            <div className="text-center">
                                <HiOutlineChip size={64} className="mx-auto mb-4 opacity-20" />
                                <p className="text-lg font-semibold mb-2">No Diagram Generated</p>
                                <p className="text-sm max-w-md">
                                    Enter a search query above to generate a circuit schematic diagram from your uploaded documents.
                                    The AI will extract components and connections automatically.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            fitView
                            minZoom={0.1}
                            maxZoom={3}
                            attributionPosition="bottom-left"
                        >
                            <Background color="#1e293b" gap={24} size={1} />
                            <Controls
                                showInteractive={false}
                                style={{ borderRadius: '12px', overflow: 'hidden' }}
                            />
                            <MiniMap
                                nodeColor={(n) => getNodeColor(n.data?.label)}
                                style={{
                                    background: '#111827',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                }}
                                maskColor="rgba(0,0,0,0.5)"
                            />

                            {/* Legend panel */}
                            {showLegend && (
                                <Panel position="top-right">
                                    <div className="glass-card p-3" style={{ maxWidth: '200px' }}>
                                        <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Component Legend</p>
                                        <div className="space-y-1">
                                            {legendItems.map(([name, color]) => (
                                                <div key={name} className="flex items-center gap-2 text-xs">
                                                    <div className="w-3 h-3 rounded" style={{ background: color }} />
                                                    <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </Panel>
                            )}
                        </ReactFlow>
                    )}
                </div>
            </motion.div>
        </AppShell>
    );
}
