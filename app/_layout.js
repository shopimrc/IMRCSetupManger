import { Slot } from 'expo-router';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import useIncomingIMRC from '../features/setups/hooks/useIncomingIMRC';
import SetupsMigrationProgressPopup from '../features/setups/components/SetupsMigrationProgressPopup';
import AppVersionGate from '../features/version/AppVersionGate';

export default function RootLayout() {
  useIncomingIMRC();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AppVersionGate>
        <Slot />
      </AppVersionGate>
      <SetupsMigrationProgressPopup />
    </SafeAreaProvider>
  );
}
