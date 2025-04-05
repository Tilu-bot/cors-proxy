'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function DashboardContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    // Example: Fetch data based on searchParams
    const fetchData = async () => {
      const param = searchParams.get('param');
      const response = await fetch(`/api/data?param=${param}`);
      const result = await response.json();
      setData(result);
    };

    fetchData();
  }, [searchParams]);

  return (
    <div>
      <h1>Dashboard</h1>
      {data ? (
        <div>
          <p>Data: {JSON.stringify(data)}</p>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}