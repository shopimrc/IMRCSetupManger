import React from 'react';
import { NavigationContainer } from "expo-router/react-navigation";
import AppNavigator from './app/AppNavigator';
import { IMRCDarkTheme } from './app/theme';
import { StatusBar } from 'expo-status-bar';

export default function App(){
  return (
    <NavigationContainer theme={IMRCDarkTheme}>
      <StatusBar style="light" />
      <AppNavigator />
    </NavigationContainer>
  );
}
