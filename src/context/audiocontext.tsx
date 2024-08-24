import { createContext, useContext } from "react";
import { WaveFile } from "wavefile";

interface AppContext {
    audioContext: AudioContext;
    loadedPlugins: string[];
    pluginChain: AudioNode[];
    samples: {[name: string] : WaveFile};
}

const AppContextComp = createContext<AppContext | undefined>(undefined);

interface AppContextProviderProps {
    children: React.ReactNode;
}

export const AppContextProvider: React.FC<AppContextProviderProps> = ({children}) => {
    const audioContext = new AudioContext({sampleRate: 44100});
    audioContext.resume();
    const loadedPlugins: string[] = [];
    const pluginChain: AudioNode[] = [];
    const samples = {};
    return (
        <AppContextComp.Provider
            value={{
                audioContext,
                loadedPlugins,
                pluginChain,
                samples,
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