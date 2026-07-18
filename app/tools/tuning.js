// app/tools/tuning.js

import React from 'react';
import { useRouter } from 'expo-router';
import TuningAssistantScreen from '../../features/tools/TuningAssistantScreen';

export default function TuningAssistantToolRoute() {
  const router = useRouter();
  return <TuningAssistantScreen onBack={() => router.replace('/tools')} />;
}
