'use client';

import useStore from '@/store/useStore';

export default function Notifications() {
    const { notifications } = useStore();

    if (notifications.length === 0) return null;

    return (
        <div className="toast">
            {notifications.map((n) => (
                <div key={n.id} className={`toast-item ${n.type}`}>
                    {n.msg}
                </div>
            ))}
        </div>
    );
}
