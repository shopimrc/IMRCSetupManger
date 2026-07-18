// app/tools/near-me.js

import React from 'react';
import { useRouter } from 'expo-router';
import TrackNearMeScreen from '../../features/tools/TrackNearMeScreen';

export default function TrackNearMeToolRoute() {
  const router = useRouter();
  return <TrackNearMeScreen onBack={() => router.replace('/tools')} />;
}
