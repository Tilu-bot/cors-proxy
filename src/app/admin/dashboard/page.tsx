'use client';

import { Suspense } from 'react';
import DashboardContent from '@/components/dashboard/DashboardContent';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6 text-center">Proxy Dashboard</h1>
      <Suspense fallback={<div className="text-center text-gray-500">Loading dashboard data...</div>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
