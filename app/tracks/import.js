// app/tracks/import.js

import React from 'react';
import { useRouter } from 'expo-router';

import TrackImportForm from '../../features/tracks/components/TrackImportForm';

export default function TrackImportScreen() {
  const router = useRouter();

  function handleImported() {
    router.replace('/tracks');
  }

  function handleCancel() {
    router.back();
  }

  function handleSubmitTrack() {
    router.replace('/tracks/submit');
  }

  return (
    <TrackImportForm
      onImported={handleImported}
      onCancel={handleCancel}
      onSubmitTrack={handleSubmitTrack}
    />
  );
}
