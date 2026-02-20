import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CookiePrefs {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

interface CookieContextType {
  prefs: CookiePrefs | null;
  bannerVisible: boolean;
  modalVisible: boolean;
  acceptAll: () => void;
  rejectNonEssential: () => void;
  savePrefs: (analytics: boolean, marketing: boolean) => void;
  openModal: () => void;
  closeModal: () => void;
}

const STORAGE_KEY = 'pulse_cookie_prefs';

const CookieContext = createContext<CookieContextType | undefined>(undefined);

export function CookieProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<CookiePrefs | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPrefs(JSON.parse(stored));
        setBannerVisible(false);
      } else {
        setBannerVisible(true);
      }
    } catch {
      setBannerVisible(true);
    }
  }, []);

  function saveToStorage(p: CookiePrefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    setPrefs(p);
    setBannerVisible(false);
    setModalVisible(false);
  }

  function acceptAll() {
    saveToStorage({ necessary: true, analytics: true, marketing: true, timestamp: new Date().toISOString() });
  }

  function rejectNonEssential() {
    saveToStorage({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() });
  }

  function savePrefs(analytics: boolean, marketing: boolean) {
    saveToStorage({ necessary: true, analytics, marketing, timestamp: new Date().toISOString() });
  }

  return (
    <CookieContext.Provider value={{
      prefs, bannerVisible, modalVisible,
      acceptAll, rejectNonEssential, savePrefs,
      openModal: () => setModalVisible(true),
      closeModal: () => setModalVisible(false),
    }}>
      {children}
    </CookieContext.Provider>
  );
}

export function useCookies() {
  const ctx = useContext(CookieContext);
  if (!ctx) throw new Error('useCookies must be used within CookieProvider');
  return ctx;
}
