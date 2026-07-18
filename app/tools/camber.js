// app/tools/camber.js

import React from 'react';
import { useRouter } from 'expo-router';
import CamberGaugeScreen from '../../features/tools/CamberGaugeScreen';

export default function CamberGaugeToolRoute() {
  const router = useRouter();
  return <CamberGaugeScreen onBack={() => router.replace('/tools')} router={router} />;
}
