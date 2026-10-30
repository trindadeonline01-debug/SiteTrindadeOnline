import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './src/supabase';
import { fetchMyCompany } from './src/api/company';
import { colors, spacing } from './src/theme';
import type { Company } from './src/types';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [companyErro, setCompanyErro] = useState('');

  async function loadCompany() {
    setCompanyErro('');
    const comp = await fetchMyCompany();
    if (!comp) { setCompanyErro('Essa conta não tem negócio cadastrado no Trindade Online.'); return; }
    if (!comp.loja_digital_enabled) { setCompanyErro('Seu negócio ainda não tem o Cardápio Digital ativado — fale com o suporte.'); return; }
    setCompany(comp);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session);
      setChecking(false);
      if (session) loadCompany();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      if (session) loadCompany();
      else { setCompany(null); setCompanyErro(''); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SafeAreaView style={styles.center}><ActivityIndicator color={colors.signDark} size="large" /></SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={signedIn && company ? 'light' : 'dark'} />
      {!signedIn ? (
        <LoginScreen />
      ) : company ? (
        <HomeScreen company={company} />
      ) : (
        <SafeAreaView style={styles.center}>
          {companyErro ? (
            <>
              <Text style={styles.erroTitle}>⚠️</Text>
              <Text style={styles.erroTxt}>{companyErro}</Text>
            </>
          ) : (
            <ActivityIndicator color={colors.signDark} size="large" />
          )}
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, padding: spacing.xl },
  erroTitle: { fontSize: 32, marginBottom: spacing.md },
  erroTxt: { fontSize: 14, color: colors.ink, textAlign: 'center', fontWeight: '600' },
});
