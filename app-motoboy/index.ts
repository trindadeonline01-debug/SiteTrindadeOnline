import { registerRootComponent } from 'expo';

import App from './App';
// Define a tarefa de GPS em segundo plano já no carregamento do app (o Android
// pode acordá-la sem a interface aberta) — ver src/localizacao.ts.
import './src/localizacao';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
