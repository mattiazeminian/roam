import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  isSupported,
  loadAccount,
  signIn as runSignIn,
  signOut as clearStoredAccount,
  type Account,
} from './account';
export type AccountContextValue = {
  account: Account | null;
  /** False until the stored identity and device support have been read. */
  loaded: boolean;
  /** Whether Sign in with Apple is available on this device. */
  supported: boolean;
  /** True while the system sign-in flow is open. */
  signingIn: boolean;
  errorMessage: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

/**
 * The signed-in identity, or null.
 *
 * The app is fully usable signed out — this provider only reads and writes the
 * local identity; nothing else in the app depends on it yet (#20).
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [supported, setSupported] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([loadAccount(), isSupported()])
      .then(([stored, canSignIn]) => {
        if (!active) {
          return;
        }
        setAccount(stored);
        setSupported(canSignIn);
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setErrorMessage(null);
    try {
      const next = await runSignIn();
      if (next) {
        setAccount(next);
      }
    } catch (error) {
      // Backing out of the Apple sheet is a normal action, not a failure.
      const code = (error as { code?: string } | null)?.code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setErrorMessage('Could not sign in with Apple.');
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearStoredAccount();
    setAccount(null);
    setErrorMessage(null);
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({ account, loaded, supported, signingIn, errorMessage, signIn, signOut }),
    [account, loaded, supported, signingIn, errorMessage, signIn, signOut],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error('useAccount must be used inside <AccountProvider>');
  }
  return value;
}
