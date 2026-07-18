// app/tools/scale.js

import React from 'react';
import { useRouter } from 'expo-router';
import ScaleCalculatorScreen from '../../features/tools/ScaleCalculatorScreen';

export default function ScaleToolRoute() {
  const router = useRouter();
  return <ScaleCalculatorScreen onBack={() => router.replace('/tools')} router={router} />;
}
