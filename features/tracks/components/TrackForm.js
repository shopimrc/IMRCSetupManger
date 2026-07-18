// features/tracks/components/TrackForm.js
// Full-screen compatibility wrapper. The main Track list uses TrackEditSheet.

import React from 'react';
import { View } from 'react-native';

import TrackEditSheet from './TrackEditSheet';
import { trackStyles as styles } from '../styles/trackStyles';

export default function TrackForm(props) {
  return (
    <View style={styles.screen}>
      <TrackEditSheet
        visible
        {...props}
        onCancel={props.onCancel || (() => {})}
      />
    </View>
  );
}
