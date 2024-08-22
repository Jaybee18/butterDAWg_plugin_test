import { createContext, useContext } from "react";

interface AppContext {
    audioContext: AudioContext;
    loadedPlugins: string[];
}

const AppContextComp = createContext<AppContext | undefined>(undefined);

interface AppContextProviderProps {
    children: React.ReactNode;
}

export const AppContextProvider: React.FC<AppContextProviderProps> = ({children}) => {
    const audioContext = new AudioContext({sampleRate: 44100});
    const loadedPlugins: string[] = [];
    return (
        <AppContextComp.Provider
            value={{
                audioContext,
                loadedPlugins,
            }}
        >
            {children}
        </AppContextComp.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContextComp);

    if (!context) {
        throw new Error("useAppContext must be used within an AppContextProvider");
    }

    return context;
}