'use client';

import { Suspense } from 'react';
import DashboardContent from '@/components/dashboard/DashboardContent';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Proxy Dashboard</h1>
      <Suspense fallback={<div>Loading dashboard data...</div>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
