import React from 'react';

const PATHS = {
    upload:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    play:     <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />,
    user:     <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    slides:   <><rect x="2" y="4" width="20" height="14" rx="1" /><path d="M2 20h20" /></>,
    doc:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    md:       <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8v8M7 12l2 3 2-3M14 8v8M14 12l2-2 1 2" /></>,
    excel:    <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M8 8l8 8M16 8l-8 8" /></>,
    json:     <><path d="M5 8a3 3 0 0 1 3-3H7M5 16a3 3 0 0 0 3 3h0" /><path d="M19 8a3 3 0 0 0-3-3h1M19 16a3 3 0 0 1-3 3h1" /></>,
    csv:      <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 8v8M15 8v8M3 12h18" /></>,
    img:      <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
};

export default function Icon({ name }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {PATHS[name]}
        </svg>
    );
}
