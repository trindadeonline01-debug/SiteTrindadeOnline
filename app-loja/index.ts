// react-native-get-random-values e react-native-url-polyfill precisam
// carregar ANTES de qualquer outra coisa — @supabase/supabase-js usa
// crypto.getRandomValues() e URL, que o motor JS do React Native não tem
// nativamente (diferente do navegador/Node). Sem isso, supabase-js quebra
// na primeira chamada (sessão/auth), não num erro óbvio de import.
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
