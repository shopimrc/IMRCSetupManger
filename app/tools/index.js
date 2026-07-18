// app/tools/index.js

import React from 'react';
import { useRouter } from 'expo-router';
import ToolsHomeScreen from '../../features/tools/ToolsHomeScreen';

export default function ToolsHomeRoute() {
  const router = useRouter();
  return (
    <ToolsHomeScreen
      onBack={() => router.replace('/')}
      onNavigate={(route) => router.push(route)}
      router={router}
    />
  );
}
