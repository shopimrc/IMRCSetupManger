// app/tracks/submit.js

import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import TrackSubmitForm from '../../features/tracks/components/TrackSubmitForm';

export default function TrackSubmitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const initialTrack = {
    trackName: params?.trackName ? String(params.trackName) : '',
    trackType: params?.trackType ? String(params.trackType) : '',
    surface: params?.surface ? String(params.surface) : '',
    address: params?.address ? String(params.address) : '',
    city: params?.city ? String(params.city) : '',
    state: params?.state ? String(params.state) : '',
    zipCode: params?.zipCode ? String(params.zipCode) : '',
    phone: params?.phone ? String(params.phone) : '',
    liveRcUrl: params?.liveRcUrl ? String(params.liveRcUrl) : '',
    direction: params?.direction ? String(params.direction) : '',
    tractionLevel: params?.tractionLevel ? String(params.tractionLevel) : '',
    runLine: params?.runLine ? String(params.runLine) : '',
    trackDimensions: params?.trackDimensions ? String(params.trackDimensions) : '',
    notes: params?.notes ? String(params.notes) : '',
  };

  function handleCancel() {
    router.back();
  }

  return (
    <TrackSubmitForm
      initialTrack={initialTrack}
      onCancel={handleCancel}
    />
  );
}
