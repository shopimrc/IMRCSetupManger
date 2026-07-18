import React from 'react';
import { View, Text } from 'react-native';
import { setupStyles } from '../styles/setupStyles';

export default function SetupSection({ title, hint, children, tight = false }) {
  return (
    <View style={tight ? setupStyles.cardTight : setupStyles.formSection}>
      {(title || hint) ? (
        <View style={setupStyles.sectionTitleRow}>
          {title ? <Text style={setupStyles.sectionTitle}>{title}</Text> : <View />}
          {hint ? <Text style={setupStyles.sectionHint}>{hint}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}
