// Public web configuration for the Spark project.
const previewProject = {
  apiKey: 'AIzaSyDCiHXUZPp4Doycqv0L_kqN1yMZGUNiGEU',
  authDomain: 'hand-calculator-live-preview.firebaseapp.com',
  projectId: 'hand-calculator-live-preview',
  appId: '1:675135217182:web:7b610433ade1656393580f',
  databaseURL: 'https://hand-calculator-live-preview-default-rtdb.europe-west1.firebasedatabase.app',
};

const enabledHosts = [
  'al9afey81.github.io',
  'hand-calculator-live-preview.web.app',
  'hand-calculator-live-preview.firebaseapp.com',
  'localhost',
  '127.0.0.1',
];

export const firebaseConfig = enabledHosts.includes(globalThis.location?.hostname) ? previewProject : null;
