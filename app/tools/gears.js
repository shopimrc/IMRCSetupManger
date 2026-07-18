// app/tools/gears.js

import React from 'react';
import { useRouter } from 'expo-router';
import GearToothCounterScreen from '../../features/tools/GearToothCounterScreen';

export default function GearToothCounterToolRoute() {
  const router = useRouter();
  return <GearToothCounterScreen onBack={() => router.replace('/tools')} router={router} />;
}
