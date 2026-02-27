import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { BrandingConfig } from "../types";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";

const DEFAULT_BRANDING: BrandingConfig = {
  appName: "KLTC Messaging",
  logoUrl: null,
  primaryColor: "#1a1a2e",
  secondaryColor: "#3498db",
  accentColor: "#f39c12",
};

interface BrandingContextType {
  branding: BrandingConfig;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: DEFAULT_BRANDING,
  refreshBranding: async () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);

  const refreshBranding = async () => {
    try {
      const data = await api.getBranding();
      setBranding(data);
      document.title = data.appName || "KLTC Messaging";
    } catch {
      setBranding(DEFAULT_BRANDING);
    }
  };

  useEffect(() => {
    if (user) {
      refreshBranding();
    } else {
      setBranding(DEFAULT_BRANDING);
      document.title = "KLTC Messaging";
    }
  }, [user]);

  return (
    <BrandingContext.Provider value={{ branding, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
