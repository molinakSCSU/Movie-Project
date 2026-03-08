import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { shadcn } from '@clerk/ui/themes';
import App from './App.jsx';
import './index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkEnabled = Boolean(clerkPublishableKey);

const app = (
  <React.StrictMode>
    <App clerkEnabled={clerkEnabled} />
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  clerkEnabled ? (
    <ClerkProvider publishableKey={clerkPublishableKey} appearance={{ theme: shadcn }}>
      {app}
    </ClerkProvider>
  ) : (
    app
  )
);
