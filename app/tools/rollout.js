// app/tools/rollout.js

import React from 'react';
import { useRouter } from 'expo-router';
import RolloutCalculatorScreen from '../../features/tools/RolloutCalculatorScreen';

export default function RolloutToolRoute() {
  const router = useRouter();
  return <RolloutCalculatorScreen onBack={() => router.replace('/tools')} router={router} />;
}
