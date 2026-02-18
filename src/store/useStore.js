import { create } from 'zustand';

const useStore = create((set, get) => ({
    // Folders
    folders: [],
    setFolders: (folders) => set({ folders }),
    selectedFolder: null,
    setSelectedFolder: (folder) => set({ selectedFolder: folder }),

    // Documents
    documents: [],
    setDocuments: (documents) => set({ documents }),

    // Query
    queryResult: null,
    setQueryResult: (result) => set({ queryResult: result }),
    queryHistory: [],
    addQueryToHistory: (q) => set((s) => ({ queryHistory: [q, ...s.queryHistory].slice(0, 50) })),

    // UI
    sidebarOpen: true,
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    loading: false,
    setLoading: (loading) => set({ loading }),
    activeTab: 'text',
    setActiveTab: (tab) => set({ activeTab: tab }),

    // Voice
    isListening: false,
    setIsListening: (val) => set({ isListening: val }),
    transcript: '',
    setTranscript: (t) => set({ transcript: t }),

    // Notifications
    notifications: [],
    addNotification: (msg, type = 'info') => {
        const id = Date.now();
        set((s) => ({
            notifications: [...s.notifications, { id, msg, type }],
        }));
        setTimeout(() => {
            set((s) => ({
                notifications: s.notifications.filter((n) => n.id !== id),
            }));
        }, 4000);
    },
}));

export default useStore;
