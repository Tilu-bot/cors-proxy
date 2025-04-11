'use client';

import { Suspense } from 'react';
import DashboardContent from '@/components/dashboard/DashboardContent';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <h1 className="text-4xl font-extrabold mb-8 text-center text-purple-400 drop-shadow-md">
        Galaxy Proxy Dashboard
      </h1>
      <Suspense fallback={<div className="text-center text-gray-400 animate-pulse">Loading dashboard data...</div>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
