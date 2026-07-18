import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { setupStyles } from '../styles/setupStyles';

export default function SetupField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  editable = true,
  fieldKey,
  onFieldLayout,
  onFieldFocus,
  style,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[setupStyles.fieldWrap, style]}
      onLayout={(event) => {
        if (fieldKey && onFieldLayout) onFieldLayout(fieldKey, event.nativeEvent.layout.y);
      }}
    >
      {label ? <Text style={setupStyles.label}>{label}</Text> : null}
      <TextInput
        value={value === undefined || value === null ? '' : String(value)}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6f7684"
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        onFocus={() => {
          setFocused(true);
          if (fieldKey && onFieldFocus) onFieldFocus(fieldKey);
        }}
        onBlur={() => setFocused(false)}
        style={[
          setupStyles.input,
          focused && setupStyles.inputFocused,
          multiline && setupStyles.inputMultiline,
          !editable && setupStyles.readOnlyInput,
        ]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType={multiline ? 'default' : 'done'}
        blurOnSubmit={!multiline}
      />
    </View>
  );
}
